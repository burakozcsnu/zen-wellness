// Loads the TEST Supabase project settings and refuses to run against production.
// Secrets come from the git-ignored .env.test (local) or GitHub secrets (CI); never print them.
const fs = require('fs');
const path = require('path');

const PROD_REF = 'mdcvljbbnoxqsfwcjvqz';
const envFile = path.join(__dirname, '..', '..', '.env.test');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required (see docs/test-env.example).`);
  return value;
}

function loadTestEnv() {
  const url = required('ZEN_TESTDB_SUPABASE_URL').replace(/\/$/, '');
  const ref = new URL(url).hostname.split('.')[0];
  // Hard guard: tests write data and run load, so production must never be the target.
  if (ref === PROD_REF || required('ZEN_TESTDB_DB_USER').includes(PROD_REF)) {
    throw new Error('Refusing to run: the test settings point at PRODUCTION.');
  }
  return {
    url,
    publishableKey: required('ZEN_TESTDB_PUBLISHABLE_KEY'),
    adminEmail: required('ZEN_TESTDB_ADMIN_EMAIL'),
    adminPassword: required('ZEN_TESTDB_ADMIN_PASSWORD'),
    clientEmail: required('ZEN_TESTDB_CLIENT_EMAIL'),
    clientPassword: required('ZEN_TESTDB_CLIENT_PASSWORD')
  };
}

module.exports = { loadTestEnv, PROD_REF };
