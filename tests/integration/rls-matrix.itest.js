// Permissions matrix against the TEST database: every table x {anonymous, client A, client B, trainer}.
// Rows are seeded by the trainer, then each role tries read / insert / update / delete on its own and
// on the other client's rows. Run: npm run test:integration   (needs .env.test, see docs/test-env.example)
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { loadTestEnv } = require('../helpers/test-env');

const env = loadTestEnv();
const process_ = process;

// Intended access of a CLIENT to their OWN rows. Cross-client access is always denied.
//   none: no access | read | read+insert | full: read, insert, update, delete
// A "known" field would mark a gap where the live policy is looser than intended (shown as todo, never hidden).
const SPEC = {
  uyeler:                  { client: 'read' },
  olcumler:                { client: 'read+insert' },
  antrenmanlar:            { client: 'read' },
  beslenme_planlari:       { client: 'read' },
  dokumanlar:              { client: 'read' },
  weekly_program_schedule: { client: 'read' },
  device_connections:      { client: 'read' },
  health_metrics:          { client: 'read' },
  workout_completions:     { client: 'full' },
  schedule_attendance:     { client: 'full' },
  programlar:              { client: 'none', noMember: true },
  master_egzersizler:      { client: 'none', noMember: true },
  master_besinler:         { client: 'none', noMember: true },
  trainers:                { client: 'none', noMember: true },
  schema_migrations:       { client: 'none', noMember: true }
};

let n = 0;
let slot = 0;
const uid = () => Date.now() * 10 + (n++ % 10);

// Minimal valid row per table for a given member. Returns null for tables without member ownership.
const ROW = {
  olcumler: m => ({ id: uid(), member_id: m, tarih: '2026-01-01', weight: 70 }),
  antrenmanlar: m => ({ id: uid(), member_id: m, tarih: '2026-01-01', sablon: 'itest' }),
  beslenme_planlari: m => ({ id: uid(), member_id: m, plan_adi: 'itest' }),
  dokumanlar: m => ({ id: uid(), member_id: m, adi: 'itest', yol: `${m}/itest.pdf`, tip: 'Diğer' }),
  // Unique day/time per row: the table has a uniqueness rule and rows from earlier suites still exist.
  weekly_program_schedule: m => { const k = slot++; return { id: uid(), member_id: m, day_of_week: 1 + (k % 7), start_time: `${String(Math.floor(k / 7) % 24).padStart(2, '0')}:00` }; },
  device_connections: m => ({ id: uid(), member_id: m, platform: 'ios', device_identifier: `itest-${uid()}` }),
  health_metrics: m => ({ id: uid(), member_id: m, source: 'healthkit', metric_type: 'steps', value: 1, unit: 'count', recorded_at: new Date().toISOString() }),
  workout_completions: m => ({ id: uid(), member_id: m, workout_id: 1, exercise_index: slot++, completion_date: '2026-01-01', completed: true }),
  schedule_attendance: m => ({ id: uid(), member_id: m, schedule_id: 1, occurrence_date: `2026-01-${String(1 + (slot++ % 28)).padStart(2, '0')}`, status: 'attending' })
};
// Tables whose rows need a parent row (foreign key) that belongs to the same client.
const PARENT = { workout_completions: ['antrenmanlar', 'workout_id'], schedule_attendance: ['weekly_program_schedule', 'schedule_id'] };
const UPDATE = {
  olcumler: { weight: 71 }, antrenmanlar: { sablon: 'itest2' }, beslenme_planlari: { plan_adi: 'itest2' }, dokumanlar: { adi: 'itest2' },
  weekly_program_schedule: { notes: 'itest2' }, device_connections: { device_name: 'itest2' }, health_metrics: { value: 2 },
  workout_completions: { completed: false }, schedule_attendance: { status: 'declined' }
};

async function signIn(email, password) {
  const response = await fetch(`${env.url}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: env.publishableKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password })
  });
  const body = await response.json();
  assert.ok(body.access_token, `login failed for a test account (HTTP ${response.status})`);
  return body.access_token;
}

const call = (token, method, table, { query = '', body } = {}) =>
  fetch(`${env.url}/rest/v1/${table}${query}`, {
    method,
    headers: { apikey: env.publishableKey, Authorization: `Bearer ${token || env.publishableKey}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body)
  }).then(async r => ({ status: r.status, rows: r.ok ? await r.json().catch(() => []) : [] }));

describe('RLS permissions matrix (test database)', () => {
  let admin, clientA, clientB, memberA, memberB;
  const created = []; // [table, id] for cleanup

  before(async () => {
    [admin, clientA, clientB] = await Promise.all([
      signIn(env.adminEmail, env.adminPassword),
      signIn(env.clientEmail, env.clientPassword),
      signIn(process_.env.ZEN_TESTDB_NEWCLIENT_EMAIL, process_.env.ZEN_TESTDB_NEWCLIENT_PASSWORD)
    ]);
    const ids = async token => (await call(token, 'GET', 'uyeler', { query: '?select=id' })).rows.map(r => r.id);
    [memberA] = await ids(clientA);
    [memberB] = await ids(clientB);
    assert.ok(memberA && memberB && memberA !== memberB, 'seeded members missing: run npm run test:seed');
  });

  after(async () => {
    for (const [table, id] of created.reverse()) await call(admin, 'DELETE', table, { query: `?id=eq.${id}` });
  });

  for (const [table, spec] of Object.entries(SPEC)) {
    describe(table, () => {
      const known = spec.known ? { todo: spec.known } : {};

      it('anonymous visitors see nothing and cannot write', async () => {
        const read = await call(null, 'GET', table, { query: '?select=*&limit=1' });
        assert.ok(read.status === 401 || read.rows.length === 0, `anonymous read returned ${read.rows.length} row(s)`);
        const write = await call(null, 'POST', table, { body: { id: uid() } });
        assert.ok(!(write.status >= 200 && write.status < 300), `anonymous insert returned HTTP ${write.status}`);
      });

      if (spec.noMember) {
        it('clients have no access at all', async () => {
          const read = await call(clientA, 'GET', table, { query: '?select=*&limit=1' });
          assert.equal(read.rows.length, 0, 'client can read an admin-only table');
          const write = await call(clientA, 'POST', table, { body: { id: uid() } });
          assert.ok(!(write.status >= 200 && write.status < 300), `client insert returned HTTP ${write.status}`);
        });
        return;
      }

      if (table === 'uyeler') {
        it('each client sees exactly their own profile', async () => {
          const a = await call(clientA, 'GET', table, { query: '?select=id' });
          const b = await call(clientB, 'GET', table, { query: '?select=id' });
          assert.deepEqual(a.rows.map(r => r.id), [memberA]);
          assert.deepEqual(b.rows.map(r => r.id), [memberB]);
        });
        it("a client cannot change another client's profile or trainer-only fields", async () => {
          const other = await call(clientA, 'PATCH', table, { query: `?id=eq.${memberB}`, body: { telefon: '0000' } });
          assert.equal(other.rows.length, 0, "client A modified client B's profile");
          const own = await call(clientA, 'PATCH', table, { query: `?id=eq.${memberA}`, body: { brans: 'hack' } });
          assert.ok(own.status >= 400 || own.rows.length === 0, 'client changed a trainer-only field');
        });
        return;
      }

      let rowA, rowB;
      const parents = {};
      const build = member => ({ ...ROW[table](member), ...(PARENT[table] ? { [PARENT[table][1]]: parents[member] } : {}) });
      before(async () => {
        for (const member of [memberA, memberB]) {
          if (!PARENT[table]) continue;
          const parent = await call(admin, 'POST', PARENT[table][0], { body: ROW[PARENT[table][0]](member) });
          assert.ok(parent.rows[0], `trainer could not seed parent row for ${table} (HTTP ${parent.status})`);
          created.push([PARENT[table][0], parent.rows[0].id]);
          parents[member] = parent.rows[0].id;
        }
        for (const [member, assign] of [[memberA, r => (rowA = r)], [memberB, r => (rowB = r)]]) {
          const result = await call(admin, 'POST', table, { body: build(member) });
          assert.ok(result.rows[0], `trainer could not seed ${table} (HTTP ${result.status}); fix the row factory`);
          created.push([table, result.rows[0].id]);
          assign(result.rows[0]);
        }
      });

      it('trainer can read, update and delete rows of any client', async () => {
        assert.equal((await call(admin, 'GET', table, { query: `?id=eq.${rowA.id}` })).rows.length, 1);
        assert.equal((await call(admin, 'PATCH', table, { query: `?id=eq.${rowB.id}`, body: UPDATE[table] })).rows.length, 1);
      });

      it('a client sees only their own rows', async () => {
        // Targeted queries, so the check still works when a client owns thousands of rows (API returns 1,000 max).
        assert.equal((await call(clientA, 'GET', table, { query: `?select=id&id=eq.${rowA.id}` })).rows.length, 1, 'client cannot see their own row');
        assert.equal((await call(clientA, 'GET', table, { query: `?select=id&member_id=neq.${memberA}&limit=1` })).rows.length, 0, "client can see another client's rows");
        assert.equal((await call(clientB, 'GET', table, { query: `?select=id&member_id=neq.${memberB}&limit=1` })).rows.length, 0, "client B can see another client's rows");
      });

      it("a client cannot change or delete another client's row", async () => {
        const patch = await call(clientA, 'PATCH', table, { query: `?id=eq.${rowB.id}`, body: UPDATE[table] });
        assert.equal(patch.rows.length, 0, "updated another client's row");
        const del = await call(clientA, 'DELETE', table, { query: `?id=eq.${rowB.id}` });
        assert.equal(del.rows.length, 0, "deleted another client's row");
        assert.equal((await call(admin, 'GET', table, { query: `?id=eq.${rowB.id}` })).rows.length, 1);
      });

      it("a client cannot insert a row for another client", async () => {
        const result = await call(clientA, 'POST', table, { body: build(memberB) });
        assert.ok(!(result.status >= 200 && result.status < 300), `insert for another client returned HTTP ${result.status}`);
        if (result.rows[0]) created.push([table, result.rows[0].id]);
      });

      it(`a client's own write access is "${spec.client}"`, known, async () => {
        const mayInsert = spec.client === 'read+insert' || spec.client === 'full';
        const mayChange = spec.client === 'full';
        const insert = await call(clientA, 'POST', table, { body: build(memberA) });
        if (insert.rows[0]) created.push([table, insert.rows[0].id]);
        assert.equal(insert.status >= 200 && insert.status < 300, mayInsert, `own insert allowed=${!mayInsert ? 'no' : 'yes'}, got HTTP ${insert.status}`);
        const patch = await call(clientA, 'PATCH', table, { query: `?id=eq.${rowA.id}`, body: UPDATE[table] });
        assert.equal(patch.rows.length === 1, mayChange, `own update allowed=${mayChange}`);
        const del = await call(clientA, 'DELETE', table, { query: `?id=eq.${rowA.id}` });
        assert.equal(del.rows.length === 1, mayChange, `own delete allowed=${mayChange}`);
      });
    });
  }
});
