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
  ssl: { rejectUnauthorized: false }
});

async function checkCounts() {
  try {
    await client.connect();
    const tables = ['uyeler', 'programlar', 'olcumler', 'antrenmanlar', 'dokumanlar', 'master_egzersizler'];
    for (const table of tables) {
      const res = await client.query(`SELECT COUNT(*) FROM ${table}`);
      console.log(`Table ${table}: ${res.rows[0].count} rows`);
    }
  } catch (err) {
    console.error('Count check failed:', err);
  } finally {
    await client.end();
  }
}

checkCounts();
