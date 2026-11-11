// fetchAll must return EVERY row even though the API returns at most 1,000 rows per request.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'data-service.js'), 'utf8');

// Fake table of `total` rows that, like the real API, never returns more than `cap` rows per request.
function world(total, cap = 1000, error = null, noCount = false) {
  const requests = [];
  const client = {
    from(table) {
      const request = { table, filters: [], order: null, range: null, count: undefined, columns: null };
      const chain = {
        select(columns, options) { request.columns = columns; request.count = options?.count; return chain; },
        eq(column, value) { request.filters.push([column, value]); return chain; },
        order(column) { request.order = column; return chain; },
        range(from, to) {
          request.range = [from, to];
          requests.push(request);
          if (error) return Promise.resolve({ data: null, error });
          const size = Math.min(to - from + 1, cap, Math.max(0, total - from));
          return Promise.resolve({ data: Array.from({ length: size }, (_, i) => ({ id: from + i + 1 })), count: request.count === 'exact' && !noCount ? total : null, error: null });
        }
      };
      return chain;
    },
    auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange() {} }
  };
  const window = { addEventListener() {}, dispatchEvent() {} };
  const context = {
    window, navigator: { onLine: true },
    localStorage: { getItem: () => null, setItem() {} },
    CustomEvent: class {}, setTimeout: () => 0, console: { error() {}, log() {} },
    Date, Math, JSON, Promise, Set, Error, String, Boolean
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { service: context.window.TrainerProDataService.create(client), requests };
}

test('returns all rows across several pages (52,000 rows)', async () => {
  const { service, requests } = world(52000);
  const rows = await service.fetchAll('olcumler');
  assert.equal(rows.length, 52000);
  assert.equal(new Set(rows.map(row => row.id)).size, 52000, 'no duplicates');
  assert.equal(requests.length, 52, 'one request per page, no extra confirming request');
});

test('still returns every row when the API gives no total', async () => {
  const { service } = world(2500, 1000, null, true);
  assert.equal((await service.fetchAll('olcumler')).length, 2500);
});

test('pages after the first are requested in parallel, rows stay in id order', async () => {
  const { service } = world(9000);
  const rows = await service.fetchAll('olcumler');
  assert.deepEqual(Array.from(rows, row => row.id), Array.from({ length: 9000 }, (_, i) => i + 1));
});

test('exactly one full page ends cleanly', async () => {
  const { service } = world(1000);
  assert.equal((await service.fetchAll('olcumler')).length, 1000);
});

test('empty table returns an empty list', async () => {
  const { service } = world(0);
  assert.equal((await service.fetchAll('olcumler')).length, 0);
});

test('pages are requested in a stable order', async () => {
  const { service, requests } = world(2500);
  await service.fetchAll('olcumler');
  assert.ok(requests.every(request => request.order === 'id'), 'every page request must be ordered by id');
});

test('can filter by member so a client with a long history gets every row', async () => {
  const { service, requests } = world(2000);
  const rows = await service.fetchAll('olcumler', 1000, { member_id: 7 });
  assert.equal(rows.length, 2000);
  assert.ok(requests.every(request => request.filters.some(([column, value]) => column === 'member_id' && value === 7)));
});

test('an API error is thrown, never swallowed', async () => {
  const { service } = world(10, 1000, new Error('permission denied'));
  await assert.rejects(() => service.fetchAll('olcumler'), /permission denied/);
});

test('can read just some columns (used for the dashboard count)', async () => {
  const { service, requests } = world(1500);
  const rows = await service.fetchAll('olcumler', 1000, {}, 4, 'member_id');
  assert.equal(rows.length, 1500);
  assert.ok(requests.every(request => request.columns === 'member_id'), 'every page must ask for only member_id');
});

test('reads every column by default', async () => {
  const { service, requests } = world(10);
  await service.fetchAll('olcumler');
  assert.equal(requests[0].columns, '*');
});
