// The release check: a changed shell file needs a version bump, and every version string must agree.
const test = require('node:test');
const assert = require('node:assert/strict');
const { checkVersions } = require('../scripts/check-version-bump');

const script = v => `const APP_VERSION = '${v}';`;
const html = v => `<link href="style.css?v=${v}"><script src="vendor/supabase.js?v=${v}"></script><script src="script.js?v=${v}"></script>`;
const sw = v => `const SHELL_VERSION = '${v}';`;
const input = (over = {}) => ({ changed: ['script.js'], baseScript: script('1.0.0'), script: script('1.0.1'), sw: sw('1.0.1'), indexHtml: html('1.0.1'), ...over });

test('a changed shell file without a bump fails', () => {
  const problems = checkVersions(input({ script: script('1.0.0') , sw: sw('1.0.0'), indexHtml: html('1.0.0') }));
  assert.match(problems.join('\n'), /still 1\.0\.0/);
});
test('a consistent bump passes', () => assert.deepEqual(checkVersions(input()), []));
test('a docs-only change passes without a bump', () => {
  assert.deepEqual(checkVersions(input({ changed: ['docs/testing.md', 'tests/x.test.js'], script: script('1.0.0') })), []);
});
test('a mismatched ?v= fails', () => {
  assert.match(checkVersions(input({ indexHtml: html('1.0.0') })).join('\n'), /style\.css\?v=1\.0\.0/);
});
test('a mismatched SHELL_VERSION fails', () => {
  assert.match(checkVersions(input({ sw: sw('1.0.0') })).join('\n'), /SHELL_VERSION/);
});
test('a vendor or icon change counts as a shell change', () => {
  for (const file of ['vendor/chart.umd.min.js', 'icons/icon-192.png', 'sw.js', 'fonts/a.woff2']) {
    assert.equal(checkVersions(input({ changed: [file], script: script('1.0.0'), sw: null, indexHtml: html('1.0.0') })).length, 1, file);
  }
});
