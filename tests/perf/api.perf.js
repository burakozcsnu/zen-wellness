// API and database performance against the TEST database with the large data set (npm run test:perf:seed first).
// Measures what the app really does: trainer startup (loads whole tables), client portal load, per-member queries.
const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Client } = require('pg');
const { loadTestEnv } = require('../helpers/test-env');

const env = loadTestEnv();
const SAMPLES = 15;

// p95 budgets in milliseconds, measured from this machine (Turkey -> Frankfurt). See docs/perf-baseline.md.
const BUDGET = { trainerStartup: 2000, memberMeasurements: 500, clientMeasurements: 800, clientPortalLoad: 1200 };

const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * p) - 1)];
const report = (name, times) => console.log(`  ${name}: p50=${Math.round(percentile(times, 0.5))}ms p95=${Math.round(percentile(times, 0.95))}ms max=${Math.round(Math.max(...times))}ms`);

async function signIn(email, password) {
  const r = await fetch(`${env.url}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: env.publishableKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password })
  });
  return (await r.json()).access_token;
}
const get = (token, query, extra = {}) =>
  fetch(`${env.url}/rest/v1/${query}`, { headers: { apikey: env.publishableKey, Authorization: `Bearer ${token}`, ...extra } });

async function timed(fn, samples = SAMPLES) {
  const times = [];
  for (let i = 0; i < samples; i++) { const t = performance.now(); await fn(); times.push(performance.now() - t); }
  return times;
}

// The app's data-service.js running in Node on top of a minimal PostgREST client (same calls supabase-js makes).
function appDataService(token) {
  const client = {
    from(table) {
      const params = new URLSearchParams();
      let countHeader = null;
      const chain = {
        select(columns, options) { params.set('select', columns); if (options?.count) countHeader = options.count; return chain; },
        eq(column, value) { params.set(column, `eq.${value}`); return chain; },
        order(column) { params.set('order', column); return chain; },
        async range(from, to) {
          const response = await fetch(`${env.url}/rest/v1/${table}?${params}`, {
            headers: { apikey: env.publishableKey, Authorization: `Bearer ${token}`, 'Range-Unit': 'items', Range: `${from}-${to}`, ...(countHeader ? { Prefer: `count=${countHeader}` } : {}) }
          });
          const total = response.headers.get('content-range')?.split('/')[1];
          return response.ok ? { data: await response.json(), count: total && total !== '*' ? Number(total) : null, error: null } : { data: null, error: new Error(`HTTP ${response.status}`) };
        }
      };
      return chain;
    },
    auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange() {} }
  };
  const context = {
    window: { addEventListener() {}, dispatchEvent() {} }, navigator: { onLine: true },
    localStorage: { getItem: () => null, setItem() {} }, CustomEvent: class {}, setTimeout: () => 0,
    console, Date, Math, JSON, Promise, Set, Error, String, Boolean
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', '..', 'data-service.js'), 'utf8'), context);
  return context.window.TrainerProDataService.create(client);
}

describe('API performance (large data set)', () => {
  let admin, client, memberId;
  before(async () => {
    admin = await signIn(env.adminEmail, env.adminPassword);
    client = await signIn(env.clientEmail, env.clientPassword);
    const mine = await (await get(client, 'uyeler?select=id')).json();
    memberId = mine[0].id;
    const heavy = await get(client, 'olcumler?select=id', { Prefer: 'count=exact', Range: '0-0' });
    assert.ok(Number(heavy.headers.get('content-range').split('/')[1]) >= 2000, 'perf data missing: run npm run test:perf:seed');
  });

  it('trainer startup, first page of every table in parallel (raw request, capped at 1,000 rows; the full load is timed in frontend.spec.js)', async () => {
    const tables = ['uyeler', 'olcumler', 'antrenmanlar', 'dokumanlar', 'weekly_program_schedule', 'master_egzersizler', 'master_besinler', 'beslenme_planlari', 'health_metrics'];
    const times = await timed(() => Promise.all(tables.map(t => get(admin, `${t}?select=*`).then(r => r.arrayBuffer()))));
    report('trainer startup (first pages)', times);
    assert.ok(percentile(times, 0.95) <= BUDGET.trainerStartup, `p95 ${Math.round(percentile(times, 0.95))}ms over budget ${BUDGET.trainerStartup}ms`);
  });

  it('one member\'s measurements for the trainer (100 rows)', async () => {
    const [first] = await (await get(admin, "uyeler?select=id&ad_soyad=like.PERF*&limit=1")).json();
    const times = await timed(() => get(admin, `olcumler?select=*&member_id=eq.${first.id}`).then(r => r.arrayBuffer()));
    report('trainer: one member', times);
    assert.ok(percentile(times, 0.95) <= BUDGET.memberMeasurements, `p95 ${Math.round(percentile(times, 0.95))}ms over budget ${BUDGET.memberMeasurements}ms`);
  });

  it('client with a long history loads own measurements (2,000 rows)', async () => {
    const times = await timed(() => get(client, `olcumler?select=*&member_id=eq.${memberId}`).then(r => r.arrayBuffer()));
    report('client: own measurements', times);
    assert.ok(percentile(times, 0.95) <= BUDGET.clientMeasurements, `p95 ${Math.round(percentile(times, 0.95))}ms over budget ${BUDGET.clientMeasurements}ms`);
  });

  it('client portal load (all queries the portal makes, in parallel)', async () => {
    const queries = ['olcumler', 'antrenmanlar', 'beslenme_planlari', 'dokumanlar', 'weekly_program_schedule', 'push_subscriptions', 'schedule_notifications', 'schedule_attendance', 'workout_completions', 'health_metrics', 'workout_sessions']
      .map(t => `${t}?select=*&member_id=eq.${memberId}`);
    const times = await timed(() => Promise.all(queries.map(q => get(client, q).then(r => r.arrayBuffer()))));
    report('client portal', times);
    assert.ok(percentile(times, 0.95) <= BUDGET.clientPortalLoad, `p95 ${Math.round(percentile(times, 0.95))}ms over budget ${BUDGET.clientPortalLoad}ms`);
  });

  // Supabase caps one API response at 1,000 rows. This runs the app's real fetchAll (data-service.js) against the real API.
  for (const table of ['olcumler', 'antrenmanlar']) {
    it(`the app's paged loader receives ALL ${table} rows, not a truncated page`, async () => {
      const probe = await get(admin, `${table}?select=id`, { Prefer: 'count=exact', Range: '0-0' });
      const total = Number(probe.headers.get('content-range').split('/')[1]);
      const service = appDataService(admin);
      const rows = await service.fetchAll(table);
      assert.equal(rows.length, total, `received ${rows.length} of ${total} rows`);
      assert.equal(new Set(rows.map(row => row.id)).size, total, 'duplicate rows across pages');
    });
  }

  it('filtering by member_id uses an index (not a full table scan)', async () => {
    const db = new Client({
      user: process.env.ZEN_TESTDB_DB_USER, host: process.env.ZEN_TESTDB_DB_HOST, database: 'postgres', password: process.env.ZEN_TESTDB_DB_PASSWORD, port: 6543,
      ssl: { ca: fs.readFileSync(path.join(__dirname, '..', '..', '.supabase', 'prod-ca-2021.crt'), 'utf8') }
    });
    await db.connect();
    try {
      // The index must exist on every table the app filters by member...
      for (const table of ['olcumler', 'antrenmanlar', 'beslenme_planlari', 'dokumanlar']) {
        const found = await db.query("SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = $1 AND indexdef LIKE '%(member_id)%'", [table]);
        assert.equal(found.rowCount > 0, true, `${table}: no index on member_id`);
      }
      // ...and the planner must actually use it where there is data (tiny tables legitimately skip indexes).
      for (const table of ['olcumler', 'antrenmanlar']) {
        const plan = (await db.query(`EXPLAIN (FORMAT JSON) SELECT * FROM ${table} WHERE member_id = ${memberId}`)).rows[0]['QUERY PLAN'];
        assert.ok(!JSON.stringify(plan).includes('"Seq Scan"'), `${table}: sequential scan on member_id`);
      }
    } finally { await db.end(); }
  });
});
