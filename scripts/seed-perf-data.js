// Fills the TEST database with a realistic large data set for performance tests:
// 500 members, 50,000 measurements, 25,000 workouts, 1,500 nutrition plans, plus a heavy history for the test client.
// Usage: node scripts/seed-perf-data.js           add the data (re-running first removes the old perf data)
//        node scripts/seed-perf-data.js --members=50   a typical studio (default is the 500-member stress case)
//        node scripts/seed-perf-data.js --clean   remove it
// Perf rows are marked by ids >= 9e15 and member names starting with "PERF ". Refuses to touch production.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { loadTestEnv, PROD_REF } = require('../tests/helpers/test-env');

const env = loadTestEnv();
const user = process.env.ZEN_TESTDB_DB_USER;
if (user.includes(PROD_REF)) throw new Error('Refusing to run against production.');

const BASE = '9000000000000000';
const membersArg = process.argv.find(arg => arg.startsWith('--members='));
const MEMBERS = membersArg ? Number(membersArg.split('=')[1]) : 500, MEASUREMENTS_PER = 100, WORKOUTS_PER = 50, PLANS_PER = 3, HEAVY_MEASUREMENTS = 2000, HEAVY_WORKOUTS = 500;

(async () => {
  const db = new Client({
    user, host: process.env.ZEN_TESTDB_DB_HOST, database: 'postgres', password: process.env.ZEN_TESTDB_DB_PASSWORD, port: 6543,
    ssl: { ca: fs.readFileSync(path.join(__dirname, '..', '.supabase', 'prod-ca-2021.crt'), 'utf8') }
  });
  await db.connect();
  try {
    await db.query('BEGIN');
    // Children first; member deletes would cascade, but explicit is clearer.
    for (const table of ['olcumler', 'antrenmanlar', 'beslenme_planlari']) await db.query(`DELETE FROM ${table} WHERE id >= ${BASE}`);
    await db.query("DELETE FROM uyeler WHERE ad_soyad LIKE 'PERF %'");
    if (process.argv.includes('--clean')) { await db.query('COMMIT'); console.log('Perf data removed.'); return; }

    await db.query(`INSERT INTO uyeler (ad_soyad, trainer_id, degerlendirme_tamamlandi, kayit_tarihi)
                    SELECT 'PERF Danışan ' || g, 'burak-ozcan', true, date '2024-01-01' + g FROM generate_series(1, ${MEMBERS}) g`);
    await db.query(`INSERT INTO olcumler (id, member_id, tarih, weight, fat, waist, chest, hips)
                    SELECT ${BASE} + row_number() OVER (), m.id, date '2023-01-01' + g, 60 + random() * 30, 12 + random() * 15, 70 + random() * 30, 90 + random() * 20, 90 + random() * 20
                    FROM uyeler m, generate_series(1, ${MEASUREMENTS_PER}) g WHERE m.ad_soyad LIKE 'PERF %'`);
    await db.query(`INSERT INTO antrenmanlar (id, member_id, tarih, sablon, setler)
                    SELECT ${BASE} + 1000000 + row_number() OVER (), m.id, date '2023-01-01' + g, 'PERF antrenman',
                           '[{"ad":"Squat","tekrar":10,"set":4},{"ad":"Bench Press","tekrar":8,"set":4},{"ad":"Row","tekrar":10,"set":3}]'::jsonb
                    FROM uyeler m, generate_series(1, ${WORKOUTS_PER}) g WHERE m.ad_soyad LIKE 'PERF %'`);
    await db.query(`INSERT INTO beslenme_planlari (id, member_id, tarih, plan_adi, ogunler)
                    SELECT ${BASE} + 2000000 + row_number() OVER (), m.id, date '2024-01-01' + g, 'PERF plan', '[{"ad":"Kahvaltı","kalori":500}]'::jsonb
                    FROM uyeler m, generate_series(1, ${PLANS_PER}) g WHERE m.ad_soyad LIKE 'PERF %'`);

    // Heavy history for the test client (what a long-time client looks like).
    const client = await db.query('SELECT id FROM uyeler WHERE email = $1', [env.clientEmail]);
    if (!client.rows[0]) throw new Error('Test client missing: run npm run test:seed first.');
    const id = client.rows[0].id;
    await db.query(`INSERT INTO olcumler (id, member_id, tarih, weight, fat)
                    SELECT ${BASE} + 3000000 + g, $1, date '2020-01-01' + g, 60 + random() * 30, 12 + random() * 15 FROM generate_series(1, ${HEAVY_MEASUREMENTS}) g`, [id]);
    await db.query(`INSERT INTO antrenmanlar (id, member_id, tarih, sablon, setler)
                    SELECT ${BASE} + 4000000 + g, $1, date '2020-01-01' + g, 'PERF antrenman', '[{"ad":"Squat","tekrar":10,"set":4}]'::jsonb FROM generate_series(1, ${HEAVY_WORKOUTS}) g`, [id]);
    await db.query('COMMIT');
    await db.query('ANALYZE uyeler, olcumler, antrenmanlar, beslenme_planlari');
    const counts = await db.query('SELECT (SELECT count(*) FROM uyeler) members, (SELECT count(*) FROM olcumler) measurements, (SELECT count(*) FROM antrenmanlar) workouts');
    console.log('Perf data ready:', counts.rows[0]);
  } catch (error) {
    await db.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await db.end();
  }
})().catch(error => { console.error('Perf seed failed:', error.message); process.exit(1); });
