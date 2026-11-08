// Security check: what can a logged-in CLIENT change in the clients table (uyeler)?
// Logs in as the test client from .env (ZEN_TEST_CLIENT_EMAIL / ZEN_TEST_CLIENT_PASSWORD).
// Expected: client sees only own row; own questionnaire fields can be saved; trainer-only fields cannot.
// Writes only the test client's own row, and puts back any value it changes. Prints no personal data.
// Usage (PowerShell, repository folder): node scripts/check-member-permissions.js
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://mdcvljbbnoxqsfwcjvqz.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_cR0_yg6oxqfP4mAcPTL4Bw_ZhW16sSr';

const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
const email = process.env.ZEN_TEST_CLIENT_EMAIL;
const password = process.env.ZEN_TEST_CLIENT_PASSWORD;
if (!email || !password) throw new Error('ZEN_TEST_CLIENT_EMAIL and ZEN_TEST_CLIENT_PASSWORD are required in .env.');

async function login() {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if (!response.ok) throw new Error(`Test client login failed (HTTP ${response.status}).`);
  const session = await response.json();
  const role = session.user?.app_metadata?.role;
  if (role === 'admin') throw new Error('The test login is a trainer account; use a client account.');
  return session.access_token;
}

function rest(token) {
  return async (query, method = 'GET', body) => {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/uyeler?${query}`, {
      method,
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await response.text();
    return { status: response.status, rows: response.ok && text ? JSON.parse(text) : [], error: response.ok ? null : text };
  };
}

async function main() {
  const call = rest(await login());
  const results = [];
  const check = (name, passed, detail) => results.push({ name, passed, detail });

  // 1. Visibility (read-only): without any filter, only the client's own row may come back.
  // The update rule uses the same condition, so this also covers other clients' rows
  // without ever writing to them.
  const own = await call('select=id,telefon,brans');
  check("Client sees only own profile, no other clients", !own.error && own.rows.length === 1,
    `${own.rows.length} row(s) visible, HTTP ${own.status}`);
  if (own.error || own.rows.length !== 1) {
    for (const result of results) console.log(`${result.passed ? 'PASS' : 'FAIL'}  ${result.name} (${result.detail})`);
    throw new Error('Stopped before any write: visibility check failed.');
  }
  const { id, telefon, brans } = own.rows[0];

  // 2. Questionnaire field: saving the unchanged phone number must work.
  const editable = await call(`id=eq.${id}`, 'PATCH', { telefon });
  check('Client can save own questionnaire field', !editable.error && editable.rows.length === 1, `HTTP ${editable.status}`);

  // 3. Trainer-only field: changing the branch must be refused.
  const otherBranch = brans === 'Karate' ? 'Fitness' : 'Karate';
  const protectedField = await call(`id=eq.${id}`, 'PATCH', { brans: otherBranch });
  const changed = !protectedField.error && protectedField.rows.length === 1;
  if (changed) {
    // Put the original value back and make sure it stuck.
    const restore = await call(`id=eq.${id}`, 'PATCH', { brans });
    if (restore.error || restore.rows[0]?.brans !== brans) {
      console.error(`WARNING: could not restore the test client's branch (HTTP ${restore.status}). Fix it in the app as trainer.`);
    }
  }
  check('Client cannot change trainer-only field (brans)', !changed,
    changed ? 'CHANGED (value restored)' : `refused, HTTP ${protectedField.status}`);

  for (const result of results) console.log(`${result.passed ? 'PASS' : 'FAIL'}  ${result.name} (${result.detail})`);
  const failed = results.filter(result => !result.passed).length;
  console.log(failed ? `${failed} check(s) FAILED.` : 'All checks passed.');
  if (failed) process.exitCode = 1;
}

main().catch(error => {
  console.error(`Check could not run: ${error.message}`);
  process.exitCode = 1;
});
