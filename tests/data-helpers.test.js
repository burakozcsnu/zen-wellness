// Tests for the record-number and local-date helpers in data-service.js.
// Run: node --test "tests/**/*.test.js"
process.env.TZ = 'Europe/Istanbul'; // must be set before any Date is created
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'data-service.js'), 'utf8');
const context = { window: {}, Date, Math, String, console };
vm.createContext(context);
vm.runInContext(source, context);
const helpers = context.window.TrainerProDataService;

test('time zone for these tests is Turkey (UTC+3)', () => {
  assert.equal(new Date('2026-11-09T22:30:00Z').getHours(), 1);
});

test('localDate gives the local day just after midnight (UTC is still yesterday)', () => {
  const justAfterMidnight = new Date('2026-11-09T22:30:00Z'); // 01:30 on 10 Nov in Turkey
  assert.equal(justAfterMidnight.toISOString().slice(0, 10), '2026-11-09', 'old method: yesterday');
  assert.equal(helpers.localDate(justAfterMidnight), '2026-11-10');
});

test('localDate pads month and day', () => {
  assert.equal(helpers.localDate(new Date(2026, 0, 5, 12)), '2026-01-05');
});

test('newId never repeats, even for many ids in the same millisecond', () => {
  const realNow = Date.now;
  Date.now = () => 1794170000000; // frozen clock
  try {
    const ids = Array.from({ length: 1000 }, () => helpers.newId());
    assert.equal(new Set(ids).size, 1000);
    assert.ok(ids.every(Number.isSafeInteger));
  } finally {
    Date.now = realNow;
  }
});

test('newId stays a millisecond timestamp when calls are spread out', () => {
  const before = Date.now();
  const id = helpers.newId();
  assert.ok(id >= before && id < before + 5000);
});
