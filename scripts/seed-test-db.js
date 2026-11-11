// Builds the TEST database: runs the migrations, then creates fake accounts and one fake member each.
// Usage: node scripts/seed-test-db.js            (needs .env.test or ZEN_TESTDB_* variables; see docs/test-env.example)
// Safe to re-run. Refuses to touch production.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { loadTestEnv, PROD_REF } = require('../tests/helpers/test-env');

const env = loadTestEnv();
const need = name => process.env[name] || (() => { throw new Error(`${name} is required (see docs/test-env.example).`); })();
const dbUser = need('ZEN_TESTDB_DB_USER'), dbHost = need('ZEN_TESTDB_DB_HOST'), dbPassword = need('ZEN_TESTDB_DB_PASSWORD');
const secretKey = need('ZEN_TESTDB_SECRET_KEY');
if (dbUser.includes(PROD_REF)) throw new Error('Refusing to run against production.');

const accounts = [
  { email: env.adminEmail, password: env.adminPassword, role: 'admin', name: null },
  { email: env.clientEmail, password: env.clientPassword, role: 'user', name: 'Test Danışan', assessed: true },
  { email: need('ZEN_TESTDB_NEWCLIENT_EMAIL'), password: need('ZEN_TESTDB_NEWCLIENT_PASSWORD'), role: 'user', name: 'Yeni Test Danışan', assessed: false }
];

const adminHeaders = { apikey: secretKey, Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' };

async function ensureUser({ email, password, role }) {
  const response = await fetch(`${env.url}/auth/v1/admin/users`, {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({ email, password, email_confirm: true, app_metadata: { role } })
  });
  if (response.ok) return (await response.json()).id;
  // Already exists: find it, then reset password and role so the run is repeatable.
  const list = await (await fetch(`${env.url}/auth/v1/admin/users?per_page=200`, { headers: adminHeaders })).json();
  const existing = (list.users || []).find(user => user.email === email);
  if (!existing) throw new Error(`Could not create or find test user ${email} (HTTP ${response.status}).`);
  await fetch(`${env.url}/auth/v1/admin/users/${existing.id}`, {
    method: 'PUT', headers: adminHeaders, body: JSON.stringify({ password, app_metadata: { role } })
  });
  return existing.id;
}

(async () => {
  const connect = () => new Client({
    user: dbUser, host: dbHost, database: 'postgres', password: dbPassword, port: 6543,
    ssl: { ca: fs.readFileSync(path.join(__dirname, '..', '.supabase', 'prod-ca-2021.crt'), 'utf8') }
  });
  // A fresh project has none of the six core tables (they were created by hand in production).
  const baseline = connect();
  await baseline.connect();
  console.log('Applying baseline schema...');
  await baseline.query(fs.readFileSync(path.join(__dirname, '..', '.supabase', 'baseline.sql'), 'utf8'));
  await baseline.end();

  const migrationEnv = { ...process.env, SUPABASE_DB_USER: dbUser, SUPABASE_DB_HOST: dbHost, SUPABASE_DB_PASSWORD: dbPassword };
  for (const script of ['migrate.js', 'migrate_nutrition.js', 'migrate_auth.js']) {
    console.log(`Running ${script} on the test database...`);
    execFileSync(process.execPath, [path.join(__dirname, '..', '.supabase', script)], { env: migrationEnv, stdio: 'inherit' });
  }

  const db = connect();
  await db.connect();
  try {
    for (const account of accounts) {
      const userId = await ensureUser(account);
      console.log(`Account ready: ${account.role} (${account.email.replace(/^(.).*@/, '$1***@')})`);
      if (account.role !== 'user') continue;
      await db.query(
        `INSERT INTO uyeler (id, ad_soyad, email, auth_user_id, trainer_id, degerlendirme_tamamlandi, degerlendirme_tarihi)
         SELECT $1, $2, $3, $4, 'burak-ozcan', $5, CASE WHEN $5 THEN now() END
         WHERE NOT EXISTS (SELECT 1 FROM uyeler WHERE auth_user_id = $4)`,
        [Date.now() + accounts.indexOf(account), account.name, account.email, userId, account.assessed]
      );
      // Keep the flag stable between runs so the wizard test always starts from the same state.
      await db.query('UPDATE uyeler SET degerlendirme_tamamlandi = $2 WHERE auth_user_id = $1', [userId, account.assessed]);
    }
    console.log('Test database ready.');
  } finally {
    await db.end();
  }
})().catch(error => { console.error('Seed failed:', error.message); process.exit(1); });
