// The self-hosted libraries must stay byte-identical to the npm registry releases (sha256 from the registry tarballs).
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const FILES = {
  'supabase.js': 'e6cc2a8f6bc5b68451fd62bf0afa2c0049097f4a80f499bbc70dcf41a80459ef', // @supabase/supabase-js 2.105.1 dist/umd/supabase.js
  'chart.umd.min.js': '87364cc2b2a76a6684929e7d6b80b18a897794db38400caff1fcf1791c6925d2' // chart.js 4.6.1 dist/chart.umd.min.js
};

for (const [file, sha] of Object.entries(FILES)) {
  test(`vendor/${file} matches the registry release`, () => {
    const bytes = fs.readFileSync(path.join(__dirname, '..', 'vendor', file));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), sha);
  });
}

test('index.html loads the libraries from vendor/, not a CDN', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /src="vendor\/supabase\.js\?v=/);
  assert.match(html, /src="vendor\/chart\.umd\.min\.js\?v=/);
  assert.doesNotMatch(html, /cdn\.jsdelivr\.net/);
});
