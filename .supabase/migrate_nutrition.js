const { Client } = require('pg');

const dbPassword = process.env.SUPABASE_DB_PASSWORD;
if (!dbPassword) {
  throw new Error('SUPABASE_DB_PASSWORD environment variable is required.');
}

const client = new Client({
  user: process.env.SUPABASE_DB_USER || 'postgres.mdcvljbbnoxqsfwcjvqz',
  host: process.env.SUPABASE_DB_HOST || 'aws-1-eu-central-1.pooler.supabase.com',
  database: 'postgres',
  password: dbPassword,
  port: 6543,
  ssl: { ca: require('fs').readFileSync(require('path').join(__dirname, 'prod-ca-2021.crt'), 'utf8') } // verify Supabase's certificate
});

async function migrate() {
  let began = false; // ROLLBACK on a never-connected client would hang forever
  try {
    await client.connect();
    console.log('Connected to Supabase successfully.');
    await client.query('BEGIN');
    began = true;
    const startedAt = Date.now();
    await client.query(`SET LOCAL lock_timeout = '15s'`);

    // Master Besinler Tablosu (Library)
    await client.query(`
      CREATE TABLE IF NOT EXISTS master_besinler (
        id BIGINT PRIMARY KEY,
        ad TEXT NOT NULL,
        tip TEXT NOT NULL,
        porsiyon TEXT,
        kalori NUMERIC,
        protein NUMERIC,
        karbonhidrat NUMERIC,
        yag NUMERIC
      );
    `);
    console.log('master_besinler table ensured.');

    // Beslenme Planları Tablosu (Client Dietary Plans)
    await client.query(`
      CREATE TABLE IF NOT EXISTS beslenme_planlari (
        id BIGINT PRIMARY KEY,
        member_id BIGINT NOT NULL,
        tarih DATE,
        plan_adi TEXT,
        ogunler JSONB DEFAULT '[]'::jsonb
      );
      CREATE INDEX IF NOT EXISTS beslenme_planlari_member_id_idx ON beslenme_planlari (member_id);
    `);
    console.log('beslenme_planlari table ensured.');

    // A new table must never be open to the API, even if migrate_auth.js fails later (it adds the policies).
    for (const table of ['master_besinler', 'beslenme_planlari']) {
      await client.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
    }
    await client.query('COMMIT');
    console.log(`Migration committed in ${((Date.now() - startedAt) / 1000).toFixed(1)} s.`);

  } catch (err) {
    if (began) await client.query('ROLLBACK').catch(e => console.error('ROLLBACK failed:', e.message));
    console.error('Migration failed:', err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

migrate();
