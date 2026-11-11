// Load test against the TEST database only (never production: the guard in test-env.js refuses).
// Ramps concurrent users 5 -> 20 -> 50 -> 100 on the two heaviest real reads and fails on errors or slow p95.
// Dependency-free on purpose (runs the same locally and in CI).
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { loadTestEnv } = require('../helpers/test-env');

const env = loadTestEnv();
const STAGE_SECONDS = Number(process.env.PERF_STAGE_SECONDS || 12);
const STAGES = [5, 20, 50, 100];
// Budgets per stage: [max p95 ms, max error rate]. Set from docs/perf-baseline.md with headroom.
const BUDGET = { 5: [800, 0], 20: [1200, 0], 50: [2600, 0.01], 100: [8000, 0.02] };

const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * p) - 1)];

async function signIn(email, password) {
  const r = await fetch(`${env.url}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: env.publishableKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password })
  });
  return (await r.json()).access_token;
}

async function runStage(users, makeRequest) {
  const latencies = []; let errors = 0;
  const stopAt = Date.now() + STAGE_SECONDS * 1000;
  await Promise.all(Array.from({ length: users }, async () => {
    while (Date.now() < stopAt) {
      const t = performance.now();
      try {
        const response = await makeRequest();
        await response.arrayBuffer();
        if (!response.ok) errors++;
      } catch { errors++; }
      latencies.push(performance.now() - t);
    }
  }));
  return { users, requests: latencies.length, rps: latencies.length / STAGE_SECONDS, p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95), p99: percentile(latencies, 0.99), errorRate: errors / latencies.length };
}

describe('load (test database)', () => {
  let client, admin, memberId;
  before(async () => {
    [client, admin] = await Promise.all([signIn(env.clientEmail, env.clientPassword), signIn(env.adminEmail, env.adminPassword)]);
    const headers = { apikey: env.publishableKey, Authorization: `Bearer ${client}` };
    memberId = (await (await fetch(`${env.url}/rest/v1/uyeler?select=id`, { headers })).json())[0].id;
  });

  const scenarios = {
    'client portal read (own 2,000 measurements)': () =>
      fetch(`${env.url}/rest/v1/olcumler?select=*&member_id=eq.${memberId}`, { headers: { apikey: env.publishableKey, Authorization: `Bearer ${client}` } }),
    'trainer member list (500+ members)': () =>
      fetch(`${env.url}/rest/v1/uyeler?select=*`, { headers: { apikey: env.publishableKey, Authorization: `Bearer ${admin}` } })
  };

  for (const [name, request] of Object.entries(scenarios)) {
    it(name, async () => {
      const failures = [];
      for (const users of STAGES) {
        const result = await runStage(users, request);
        console.log(`  ${name} | ${String(users).padStart(3)} users: ${result.rps.toFixed(1)} req/s, p50=${Math.round(result.p50)}ms p95=${Math.round(result.p95)}ms p99=${Math.round(result.p99)}ms errors=${(result.errorRate * 100).toFixed(1)}%`);
        const [maxP95, maxErrors] = BUDGET[users];
        if (result.p95 > maxP95) failures.push(`${users} users: p95 ${Math.round(result.p95)}ms > ${maxP95}ms`);
        if (result.errorRate > maxErrors) failures.push(`${users} users: error rate ${(result.errorRate * 100).toFixed(1)}% > ${maxErrors * 100}%`);
      }
      assert.deepEqual(failures, [], failures.join('; '));
    });
  }
});
