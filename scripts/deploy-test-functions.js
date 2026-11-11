// Deploys the reminder Edge Function (plus a fake push service) to the TEST project, with throwaway keys.
// Usage: node scripts/deploy-test-functions.js    (needs .env.test and a logged-in Supabase CLI; never touches production)
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { loadTestEnv, PROD_REF } = require('../tests/helpers/test-env');

const env = loadTestEnv();
const ref = new URL(env.url).hostname.split('.')[0];
if (ref === PROD_REF) throw new Error('Refusing to deploy to production.');
const root = path.join(__dirname, '..');
const secretKey = process.env.ZEN_TESTDB_SECRET_KEY;
if (!secretKey) throw new Error('ZEN_TESTDB_SECRET_KEY is required (see docs/test-env.example).');

// Test-only CRON_SECRET: created once and remembered in the git-ignored .env.test (never printed).
let cronSecret = process.env.ZEN_TESTDB_CRON_SECRET;
if (!cronSecret) {
  cronSecret = crypto.randomBytes(32).toString('hex');
  fs.appendFileSync(path.join(root, '.env.test'), `\nZEN_TESTDB_CRON_SECRET=${cronSecret}\n`);
}

// Fresh throwaway VAPID pair (P-256), base64url as web-push expects.
const ecdh = crypto.createECDH('prime256v1');
ecdh.generateKeys();
const b64url = buffer => buffer.toString('base64url');

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'zen-test-functions-'));
const functions = path.join(work, 'supabase', 'functions');
try {
  fs.mkdirSync(path.join(functions, 'send-schedule-reminders'), { recursive: true });
  fs.mkdirSync(path.join(functions, 'fake-push'), { recursive: true });
  fs.copyFileSync(path.join(root, 'supabase', 'functions', 'send-schedule-reminders', 'index.ts'), path.join(functions, 'send-schedule-reminders', 'index.ts'));
  fs.copyFileSync(path.join(root, 'tests', 'fixtures', 'fake-push', 'index.ts'), path.join(functions, 'fake-push', 'index.ts'));
  fs.writeFileSync(path.join(work, 'supabase', 'config.toml'), 'project_id = "zen-test"\n');
  const envFile = path.join(work, 'secrets.env');
  fs.writeFileSync(envFile, [
    `DATABASE_SECRET_KEY=${secretKey}`,
    `VAPID_PUBLIC_KEY=${b64url(ecdh.getPublicKey())}`,
    `VAPID_PRIVATE_KEY=${b64url(ecdh.getPrivateKey())}`,
    'VAPID_SUBJECT=mailto:test@example.com',
    `CRON_SECRET=${cronSecret}`
  ].join('\n'));

  const cli = (...args) => {
    const result = spawnSync('npx', ['--yes', 'supabase@2.122.1', ...args, '--project-ref', ref], { cwd: work, encoding: 'utf8', shell: true });
    if (result.status !== 0) throw new Error(`supabase ${args[0]} ${args[1]} failed:\n${(result.stderr || '').split('\n').filter(line => !/new version|recommend/i.test(line)).join('\n').slice(0, 800)}`);
  };
  console.log('Setting test function secrets...');
  cli('secrets', 'set', '--env-file', envFile);
  for (const name of ['send-schedule-reminders', 'fake-push']) {
    console.log(`Deploying ${name} to the test project...`);
    cli('functions', 'deploy', name, '--use-api', '--no-verify-jwt', '--workdir', work);
  }
  console.log('Done. Test functions are live on the test project.');
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
