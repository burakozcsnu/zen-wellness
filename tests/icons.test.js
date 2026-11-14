// Every icon the manifest names exists with the exact pixel size it declares (read from the PNG header).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pngSize = file => {
  const bytes = fs.readFileSync(path.join(root, file));
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG', `${file} is a PNG`);
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
};
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));

test('manifest has an id and 192 / 512 (any) and 512 (maskable) icons of the declared size', () => {
  assert.equal(manifest.id, './');
  const key = icon => `${icon.sizes} ${icon.purpose}`;
  assert.deepEqual(manifest.icons.map(key).sort(), ['192x192 any', '512x512 any', '512x512 maskable']);
  for (const icon of manifest.icons) assert.equal(pngSize(icon.src), icon.sizes, icon.src);
});

test('apple-touch-icon is 180 px and the splash logo is under 80 KB', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const touch = html.match(/rel="apple-touch-icon" href="([^"]+)"/)[1];
  assert.equal(pngSize(touch), '180x180');
  assert.ok(fs.statSync(path.join(root, 'icons/logo-720.png')).size < 80 * 1024);
});

test('the splash logo and icons the page loads are in the service worker shell list', () => {
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  for (const file of ['icons/icon-192.png', 'icons/apple-touch-icon-180.png', 'icons/logo-720.png']) assert.ok(sw.includes(`'${file}'`), file);
});
