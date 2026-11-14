// A migration script that fails before connecting must still print the error and exit 1.
// Run: node --test "tests/**/*.test.js"
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

test('migrate.js exits 1 with the validation message when the catalog is broken', () => {
  const dir = path.join(__dirname, '..', '.supabase');
  const temp = path.join(dir, `migrate.broken-${process.pid}.js`);
  const source = fs.readFileSync(path.join(dir, 'migrate.js'), 'utf8');
  const broken = source.replace('extendedExerciseCatalog.length !== 450', 'extendedExerciseCatalog.length !== 451');
  assert.notEqual(broken, source, 'catalog length check not found: update this test');
  fs.writeFileSync(temp, broken);
  try {
    const result = spawnSync(process.execPath, [temp], {
      encoding: 'utf8',
      timeout: 8000,
      // Fake local target: can never reach a real database even if validation did not throw.
      env: { ...process.env, SUPABASE_DB_PASSWORD: 'x', SUPABASE_DB_HOST: '127.0.0.1', SUPABASE_DB_USER: 'itest' }
    });
    assert.equal(result.status, 1, `stderr: ${result.stderr}`);
    assert.match(result.stderr, /Extended exercise catalog must contain/);
  } finally {
    fs.rmSync(temp, { force: true });
  }
});
