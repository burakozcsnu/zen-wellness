const { Client } = require('pg');

if (process.env.ALLOW_ROLLBACK !== '1') {
  throw new Error('Set ALLOW_ROLLBACK=1 to run the data-foundation rollback.');
}
if (!process.env.SUPABASE_DB_PASSWORD) {
  throw new Error('SUPABASE_DB_PASSWORD environment variable is required.');
}

const client = new Client({
  user: 'postgres.mdcvljbbnoxqsfwcjvqz',
  host: 'aws-1-eu-central-1.pooler.supabase.com',
  database: 'postgres',
  password: process.env.SUPABASE_DB_PASSWORD,
  port: 6543,
  ssl: { rejectUnauthorized: false }
});

async function rollback() {
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      DROP TABLE IF EXISTS workout_session_steps;
      DROP TABLE IF EXISTS workout_sessions;
      DROP TABLE IF EXISTS health_metrics;
      DROP TABLE IF EXISTS device_connections;
      ALTER TABLE master_egzersizler
        DROP COLUMN IF EXISTS body_part,
        DROP COLUMN IF EXISTS classifications,
        DROP COLUMN IF EXISTS style,
        DROP COLUMN IF EXISTS drill,
        DROP COLUMN IF EXISTS difficulty,
        DROP COLUMN IF EXISTS source_url;
      DELETE FROM schema_migrations WHERE version = '2026-11-01-data-foundation';
    `);
    await client.query('COMMIT');
    console.log('Data-foundation migration rolled back.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

rollback().catch(error => {
  console.error('Rollback failed:', error);
  process.exitCode = 1;
});
