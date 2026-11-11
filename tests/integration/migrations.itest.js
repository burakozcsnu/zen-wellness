// Migration safety against the TEST database:
//  1. baseline + all three migrations can be re-run without errors or policy drift (production runs them on every deploy)
//  2. migrate_auth.js fails the deploy when an anonymous/unconditional policy exists (the guard works)
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const { loadTestEnv, PROD_REF } = require('../helpers/test-env');

loadTestEnv(); // production guard
const root = path.join(__dirname, '..', '..');
const dbEnv = {
  ...process.env,
  SUPABASE_DB_USER: process.env.ZEN_TESTDB_DB_USER,
  SUPABASE_DB_HOST: process.env.ZEN_TESTDB_DB_HOST,
  SUPABASE_DB_PASSWORD: process.env.ZEN_TESTDB_DB_PASSWORD
};
assert.ok(!dbEnv.SUPABASE_DB_USER.includes(PROD_REF));

const connect = () => new Client({
  user: dbEnv.SUPABASE_DB_USER, host: dbEnv.SUPABASE_DB_HOST, database: 'postgres', password: dbEnv.SUPABASE_DB_PASSWORD, port: 6543,
  ssl: { ca: fs.readFileSync(path.join(root, '.supabase', 'prod-ca-2021.crt'), 'utf8') }
});

const run = script => {
  try {
    execFileSync(process.execPath, [path.join(root, '.supabase', script)], { env: dbEnv, stdio: 'pipe' });
    return { ok: true, output: '' };
  } catch (error) {
    return { ok: false, output: `${error.stdout || ''}${error.stderr || ''}` };
  }
};

async function snapshot(db) {
  const policies = await db.query("SELECT schemaname, tablename, policyname, cmd, qual, with_check FROM pg_policies WHERE schemaname IN ('public','storage') ORDER BY 1,2,3");
  const rls = await db.query("SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' ORDER BY 1");
  return JSON.stringify({ policies: policies.rows, rls: rls.rows });
}

describe('migrations (test database)', () => {
  let db;
  before(async () => { db = connect(); await db.connect(); });
  after(async () => { await db.query('DROP POLICY IF EXISTS itest_anon_leak ON olcumler').catch(() => {}); await db.end(); });

  it('re-running baseline and all migrations succeeds and changes nothing', async () => {
    const before = await snapshot(db);
    await db.query(fs.readFileSync(path.join(root, '.supabase', 'baseline.sql'), 'utf8'));
    for (const script of ['migrate.js', 'migrate_nutrition.js', 'migrate_auth.js']) {
      const result = run(script);
      assert.ok(result.ok, `${script} failed on a second run:\n${result.output.slice(-600)}`);
    }
    assert.equal(await snapshot(db), before, 'policies or RLS flags drifted after a re-run');
  });

  it('every public table has row level security enabled', async () => {
    const rows = (await db.query("SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND NOT relrowsecurity")).rows;
    assert.deepEqual(rows, [], `tables without RLS: ${rows.map(r => r.relname).join(', ')}`);
  });

  it('the deploy guard fails when an anonymous policy exists', async () => {
    await db.query('CREATE POLICY itest_anon_leak ON olcumler FOR SELECT TO anon USING (true)');
    try {
      const result = run('migrate_auth.js');
      assert.equal(result.ok, false, 'migrate_auth.js accepted an anonymous policy: the guard is broken');
    } finally {
      await db.query('DROP POLICY IF EXISTS itest_anon_leak ON olcumler');
    }
    assert.ok(run('migrate_auth.js').ok, 'migrate_auth.js should pass again once the leak is removed');
  });
});
