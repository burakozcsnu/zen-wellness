const { Client } = require('pg');

const dbPassword = process.env.SUPABASE_DB_PASSWORD;
if (!dbPassword) {
  throw new Error('SUPABASE_DB_PASSWORD environment variable is required.');
}

const client = new Client({
  user: 'postgres.mdcvljbbnoxqsfwcjvqz',
  host: 'aws-1-eu-central-1.pooler.supabase.com',
  database: 'postgres',
  password: dbPassword,
  port: 6543,
  ssl: {
    rejectUnauthorized: false
  }
});

async function migrate() {
  try {
    await client.connect();
    console.log('Connected to Supabase successfully.');

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
    `);
    console.log('beslenme_planlari table ensured.');

  } catch (err) {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

migrate();
