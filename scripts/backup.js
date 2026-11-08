// Full backup of the production database rows and document files to a local folder.
// Read-only: it never writes to the database or storage.
// Usage (PowerShell): see docs/backup-and-restore.md
const { Client } = require('pg');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SUPABASE_URL = 'https://mdcvljbbnoxqsfwcjvqz.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_cR0_yg6oxqfP4mAcPTL4Bw_ZhW16sSr';
const DOCUMENT_BUCKET = 'dokumanlar';

// Optional git-ignored secrets file in the repository folder (see docs/local-setup.md).
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const dbPassword = process.env.SUPABASE_DB_PASSWORD;
if (!dbPassword) throw new Error('SUPABASE_DB_PASSWORD is required (set it in .env or in this PowerShell window).');
const skipFiles = process.argv.includes('--skip-files');

const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const backupRoot = process.env.ZEN_BACKUP_DIR || path.join(os.homedir(), 'Documents', 'zen-backups');
const outDir = path.join(backupRoot, stamp);

const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
const writeFile = (relativePath, content) => {
  const fullPath = path.join(outDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
  return sha256(content);
};

// Prompt without echoing the typed characters.
function promptHidden(question) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) return reject(new Error('Run this script in an interactive terminal.'));
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = char => {
      if (char === '\r' || char === '\n') {
        stdin.setRawMode(false); stdin.pause(); stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(value);
      } else if (char === '\u0003') {
        stdin.setRawMode(false);
        reject(new Error('Cancelled.'));
      } else if (char === '\u0008' || char === '\u007f') {
        value = value.slice(0, -1);
      } else {
        value += char;
      }
    };
    stdin.on('data', onData);
  });
}

function promptVisible(question) {
  return new Promise(resolve => {
    process.stdout.write(question);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.once('data', data => { process.stdin.pause(); resolve(data.toString().trim()); });
  });
}

async function backupDatabase(client, manifest) {
  // One read-only snapshot so all tables are consistent with each other.
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const tables = (await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name`)).rows.map(row => row.table_name);

    for (const table of tables) {
      const { rows } = await client.query(`SELECT * FROM public."${table.replace(/"/g, '""')}"`);
      const hash = writeFile(`data/${table}.json`, JSON.stringify(rows, null, 1));
      manifest.tables[table] = { rows: rows.length, sha256: hash };
      console.log(`  ${table}: ${rows.length} rows`);
    }

    // Login accounts: identifiers and roles only, never password hashes.
    const users = (await client.query(`
      SELECT id, email, raw_app_meta_data, raw_user_meta_data, created_at, last_sign_in_at
      FROM auth.users ORDER BY created_at`)).rows;
    manifest.authUsers = { rows: users.length, sha256: writeFile('auth/users.json', JSON.stringify(users, null, 1)) };

    const schemaQueries = {
      columns: `SELECT table_name, column_name, data_type, is_nullable, column_default
                FROM information_schema.columns WHERE table_schema = 'public'
                ORDER BY table_name, ordinal_position`,
      constraints: `SELECT conrelid::regclass::text AS table_name, conname, pg_get_constraintdef(oid) AS definition
                    FROM pg_constraint WHERE connamespace = 'public'::regnamespace ORDER BY 1, 2`,
      indexes: `SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY 1, 2`,
      policies: `SELECT schemaname, tablename, policyname, roles::text AS roles, cmd, qual, with_check
                 FROM pg_policies WHERE schemaname IN ('public', 'storage') ORDER BY 1, 2, 3`,
      functions: `SELECT p.proname, pg_get_functiondef(p.oid) AS definition
                  FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f' ORDER BY 1`,
      triggers: `SELECT event_object_schema, event_object_table, trigger_name, action_timing, event_manipulation, action_statement
                 FROM information_schema.triggers WHERE event_object_schema IN ('public', 'auth') ORDER BY 1, 2, 3`,
      storageObjects: `SELECT bucket_id, name, created_at, updated_at, metadata
                       FROM storage.objects ORDER BY bucket_id, name`
    };
    for (const [name, sql] of Object.entries(schemaQueries)) {
      const { rows } = await client.query(sql);
      manifest.schema[name] = { rows: rows.length, sha256: writeFile(`schema/${name}.json`, JSON.stringify(rows, null, 1)) };
    }
    return (await client.query(
      `SELECT name FROM storage.objects WHERE bucket_id = $1 ORDER BY name`, [DOCUMENT_BUCKET]
    )).rows.map(row => row.name);
  } finally {
    await client.query('ROLLBACK');
  }
}

async function backupFiles(objectNames, manifest) {
  const email = process.env.ZEN_TRAINER_EMAIL || await promptVisible('Trainer (admin) email for document download: ');
  const password = process.env.ZEN_TRAINER_PASSWORD || await promptHidden('Trainer password (hidden): ');
  const loginResponse = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if (!loginResponse.ok) throw new Error(`Trainer login failed (HTTP ${loginResponse.status}).`);
  const { access_token: accessToken } = await loginResponse.json();

  for (const name of objectNames) {
    const encodedName = name.split('/').map(encodeURIComponent).join('/');
    const response = await fetch(`${SUPABASE_URL}/storage/v1/object/authenticated/${DOCUMENT_BUCKET}/${encodedName}`, {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok) throw new Error(`Download failed for ${name} (HTTP ${response.status}).`);
    const content = Buffer.from(await response.arrayBuffer());
    manifest.files[name] = { bytes: content.length, sha256: writeFile(path.join('files', DOCUMENT_BUCKET, ...name.split('/')), content) };
  }
  console.log(`  ${objectNames.length} document files downloaded`);
}

// Re-read every saved file and compare it with the manifest, so a backup is never trusted unchecked.
function verifyBackup(manifest) {
  const check = (relativePath, expected) => {
    const content = fs.readFileSync(path.join(outDir, relativePath));
    if (sha256(content) !== expected.sha256) throw new Error(`Checksum mismatch: ${relativePath}`);
    if (expected.rows !== undefined && JSON.parse(content).length !== expected.rows) {
      throw new Error(`Row count mismatch: ${relativePath}`);
    }
  };
  Object.entries(manifest.tables).forEach(([table, entry]) => check(`data/${table}.json`, entry));
  check('auth/users.json', manifest.authUsers);
  Object.entries(manifest.schema).forEach(([name, entry]) => check(`schema/${name}.json`, entry));
  Object.entries(manifest.files).forEach(([name, entry]) => check(path.join('files', DOCUMENT_BUCKET, ...name.split('/')), entry));
}

async function main() {
  const manifest = {
    createdAt: new Date().toISOString(),
    project: SUPABASE_URL,
    tables: {}, authUsers: null, schema: {}, files: {},
    filesSkipped: skipFiles
  };
  const client = new Client({
    user: 'postgres.mdcvljbbnoxqsfwcjvqz',
    host: 'aws-1-eu-central-1.pooler.supabase.com',
    database: 'postgres',
    password: dbPassword,
    port: 6543,
    ssl: { ca: fs.readFileSync(path.join(__dirname, '..', '.supabase', 'prod-ca-2021.crt'), 'utf8') } // verify Supabase's certificate
  });
  console.log(`Backing up to ${outDir}`);
  fs.mkdirSync(outDir, { recursive: true });
  await client.connect();
  let objectNames;
  try {
    objectNames = await backupDatabase(client, manifest);
  } finally {
    await client.end();
  }
  if (skipFiles) console.log('  Document files skipped (--skip-files).');
  else await backupFiles(objectNames, manifest);

  writeFile('manifest.json', JSON.stringify(manifest, null, 2));
  verifyBackup(manifest);
  const totalRows = Object.values(manifest.tables).reduce((sum, entry) => sum + entry.rows, 0);
  console.log(`Backup complete and verified: ${Object.keys(manifest.tables).length} tables, ${totalRows} rows, ` +
    `${manifest.authUsers.rows} accounts, ${Object.keys(manifest.files).length} files.`);
}

main().catch(error => {
  console.error(`Backup FAILED: ${error.message}`);
  console.error(`Do not rely on the folder ${outDir}; delete it and run again.`);
  process.exitCode = 1;
});
