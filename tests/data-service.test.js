// Tests for the offline save queue in data-service.js, against a fake database (no network).
// Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'data-service.js'), 'utf8');

// Builds an isolated browser-like world: storage, online flag, timers, events and a fake Supabase client.
function setup({ respond = () => ({ data: [{}], error: null }) } = {}) {
  const store = new Map();
  const events = [];
  const timers = [];
  const calls = [];
  const listeners = {};
  let userId = 'trainer';
  let authCallback = null;

  const builder = call => {
    const chain = {
      upsert(payload) { call.op = 'upsert'; call.payload = payload; return chain; },
      insert(payload) { call.op = 'insert'; call.payload = payload; return chain; },
      update(payload) { call.op = 'update'; call.payload = payload; return chain; },
      delete() { call.op = 'delete'; return chain; },
      eq(column, value) { call.filters.push([column, value]); return chain; },
      select() { calls.push(call); return Promise.resolve(respond(call)); }
    };
    return chain;
  };
  const client = {
    from(table) { return builder({ table, filters: [] }); },
    auth: {
      getSession: async () => ({ data: { session: userId ? { user: { id: userId } } : null } }),
      onAuthStateChange(callback) { authCallback = callback; }
    }
  };
  const window = {
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
    dispatchEvent(event) { events.push(event); }
  };
  const context = {
    window,
    navigator: { onLine: true },
    localStorage: {
      getItem: key => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => store.set(key, String(value)),
      removeItem: key => store.delete(key),
      has: key => store.has(key)
    },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    console: { error() {}, log() {} },
    Date, Math, JSON, Promise, Set, Error, String, Boolean
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  const service = context.window.TrainerProDataService.create(client);
  const tick = () => new Promise(resolve => setImmediate(resolve));
  return {
    service, calls, events, timers, context,
    queue: () => JSON.parse(store.get('trainerpro_sync_queue') || '[]'),
    failedList: () => JSON.parse(store.get('trainerpro_sync_failed') || '[]'),
    setUser: id => { userId = id; },
    setOnline: online => { context.navigator.onLine = online; },
    fireAuth: (event, session) => authCallback?.(event, session),
    runTimers: async () => { const due = timers.splice(0); for (const t of due) t.fn(); await tick(); await tick(); },
    tick
  };
}

test('offline update and delete reach the right record after reconnecting', async () => {
  const world = setup();
  await world.tick();
  world.setOnline(false);
  await world.service.mutate('olcumler', 'update', { weight: 80 }, { id: 42 });
  await world.service.mutate('olcumler', 'delete', null, { id: 7 });
  assert.equal(world.queue().length, 2);
  world.setOnline(true);
  await world.service.flushQueue();
  const update = world.calls.find(call => call.op === 'update');
  const remove = world.calls.find(call => call.op === 'delete');
  assert.deepEqual(update.filters, [['id', 42]]);
  assert.deepEqual(remove.filters, [['id', 7]]);
  assert.equal(world.queue().length, 0);
});

test("Safari's 'Load failed' is treated as offline and queued", async () => {
  const world = setup({ respond: () => ({ data: null, error: { message: 'TypeError: Load failed' } }) });
  await world.tick();
  const result = await world.service.mutate('olcumler', 'insert', { id: 1, weight: 70 });
  assert.equal(result.queued, true);
  assert.equal(world.queue().length, 1);
});

test("another user's queued changes are never run", async () => {
  const world = setup();
  await world.tick();
  world.setOnline(false);
  await world.service.mutate('uyeler', 'update', { brans: 'Karate' }, { id: 5 });
  world.setOnline(true);
  world.setUser('client-1');
  await world.service.flushQueue();
  assert.equal(world.calls.length, 0, 'nothing may run under the client login');
  assert.equal(world.queue().length, 1, "the trainer's change is kept");
  world.setUser(null);
  await world.service.flushQueue();
  assert.equal(world.calls.length, 0, 'nothing runs while logged out');
  world.setUser('trainer');
  world.fireAuth('SIGNED_IN');
  await world.runTimers();
  assert.equal(world.calls.length, 1, 'it runs after the trainer logs in again');
  assert.equal(world.queue().length, 0);
});

test('a change queued while online is retried after 30 seconds', async () => {
  let fail = true;
  const world = setup({ respond: () => (fail ? { data: null, error: { message: 'Failed to fetch' } } : { data: [{}], error: null }) });
  await world.tick();
  await world.service.mutate('olcumler', 'insert', { id: 2 });
  assert.equal(world.queue().length, 1);
  assert.ok(world.timers.some(timer => timer.ms === 30000), 'a 30 s retry is scheduled');
  fail = false;
  await world.runTimers();
  assert.equal(world.queue().length, 0);
});

test('connection errors are not counted as failed attempts', async () => {
  const world = setup({ respond: () => ({ data: null, error: { message: 'NetworkError when attempting to fetch resource.' } }) });
  await world.tick();
  await world.service.mutate('olcumler', 'insert', { id: 3 });
  for (let i = 0; i < 10; i += 1) await world.service.flushQueue();
  assert.equal(world.queue().length, 1);
  assert.equal(world.queue()[0].attempts, 0);
  assert.equal(world.failedList().length, 0);
});

test('after 5 real failures a change is set aside, kept, and reported once', async () => {
  let online = false;
  const world = setup({ respond: () => (online ? { data: null, error: { message: 'permission denied' } } : { data: [{}], error: null }) });
  await world.tick();
  world.setOnline(false);
  await world.service.mutate('olcumler', 'update', { weight: 1 }, { id: 9 });
  world.setOnline(true);
  online = true;
  for (let i = 0; i < 7; i += 1) await world.service.flushQueue();
  assert.equal(world.queue().length, 0, 'no longer retried');
  assert.equal(world.failedList().length, 1, 'kept in the failed list');
  assert.equal(world.failedList()[0].attempts, 5);
  assert.equal(world.events.filter(event => event.type === 'trainerpro-sync-failed').length, 1);
});

test('changes queued during a flush are not lost', async () => {
  let world;
  let queuedDuringFlush = false;
  world = setup({
    respond: () => {
      if (!queuedDuringFlush) {
        queuedDuringFlush = true;
        world.setOnline(false);
        world.service.mutate('olcumler', 'insert', { id: 99 });
      }
      return { data: [{}], error: null };
    }
  });
  await world.tick();
  world.setOnline(false);
  await world.service.mutate('olcumler', 'insert', { id: 1 });
  world.setOnline(true);
  await world.service.flushQueue();
  await world.tick();
  assert.deepEqual(world.queue().map(item => item.payload.id), [99]);
});

test('updates queued by versions before 1.3.116 are set aside, inserts still run', async () => {
  const world = setup();
  world.context.localStorage.setItem('trainerpro_sync_queue', JSON.stringify([
    { table: 'olcumler', operation: 'update', payload: { weight: 1 }, id: '1700000000000-abc', userId: 'trainer', attempts: 0 },
    { table: 'olcumler', operation: 'insert', payload: { id: 4 }, id: '1700000000001-def', userId: 'trainer', attempts: 0 }
  ]));
  await world.service.flushQueue();
  assert.equal(world.calls.length, 1);
  assert.equal(world.calls[0].op, 'insert');
  assert.equal(world.queue().length, 0);
  assert.equal(world.failedList().length, 1);
});

test('a change with no recorded owner is set aside and never sent', async () => {
  const world = setup();
  world.context.localStorage.setItem('trainerpro_sync_queue', JSON.stringify([
    { queueId: 'a', table: 'olcumler', operation: 'insert', payload: { id: 4 }, attempts: 0 },
    { queueId: 'b', table: 'olcumler', operation: 'insert', payload: { id: 5 }, userId: 'trainer', attempts: 0 }
  ]));
  await world.service.flushQueue();
  assert.deepEqual(world.calls.map(call => call.payload.id), [5]);
  assert.equal(world.queue().length, 0);
  assert.equal(world.failedList().length, 1);
  assert.equal(world.failedList()[0].status, 'failed');
  assert.equal(world.failedList()[0].lastError, 'No owner recorded; not sent.');
  assert.equal(world.events.filter(event => event.type === 'trainerpro-sync-failed').length, 1);
});

test('getPendingCount(userId) counts only that user; without an argument it counts everything', () => {
  const world = setup();
  world.context.localStorage.setItem('trainerpro_sync_queue', JSON.stringify([
    { queueId: 'a', userId: 'trainer' }, { queueId: 'b', userId: 'trainer' }, { queueId: 'c', userId: 'other' }, { queueId: 'd' }
  ]));
  assert.equal(world.service.getPendingCount('trainer'), 2);
  assert.equal(world.service.getPendingCount('other'), 1);
  assert.equal(world.service.getPendingCount(), 4);
});

test('clearLocalData removes own and owner-less items and the cache, keeps other users, drops empty keys', () => {
  const world = setup();
  const ls = world.context.localStorage;
  ls.setItem('trainerpro_sync_queue', JSON.stringify([
    { queueId: 'a', userId: 'trainer' }, { queueId: 'b' }, { queueId: 'c', userId: 'other' }
  ]));
  ls.setItem('trainerpro_sync_failed', JSON.stringify([{ queueId: 'd', userId: 'trainer' }]));
  ls.setItem('trainerpro_cache', '{"members":[]}');
  assert.equal(world.service.clearLocalData('trainer'), 2);
  assert.deepEqual(world.queue().map(item => item.queueId), ['c']);
  assert.equal(ls.has('trainerpro_sync_failed'), false);
  assert.equal(ls.has('trainerpro_cache'), false);
  assert.equal(world.service.clearLocalData('other'), 1);
  assert.equal(ls.has('trainerpro_sync_queue'), false);
});

test('clearLocalData logs and rethrows a storage error', () => {
  const world = setup();
  world.context.localStorage.removeItem = () => { throw new Error('blocked'); };
  assert.throws(() => world.service.clearLocalData('trainer'), /blocked/);
});

// ---- M1: pending overlay, failed list API, safe replay ----
const overlayApi = () => setup().context.window.TrainerProDataService;
const seedQueue = (world, items) => world.context.localStorage.setItem('trainerpro_sync_queue', JSON.stringify(items));
const queued = (queueId, extra = {}) => ({ queueId, userId: 'trainer', table: 'olcumler', operation: 'insert', payload: { id: queueId }, attempts: 0, ...extra });

test('applyPending: upsert replaces by id, appends when new, accepts array payloads', () => {
  const { applyPending } = overlayApi();
  const rows = [{ id: 1, w: 1 }, { id: 2, w: 2 }];
  const out = applyPending(rows, 'olcumler', [
    { table: 'olcumler', operation: 'upsert', payload: { id: 1, w: 10 } },
    { table: 'olcumler', operation: 'insert', payload: [{ id: 3, w: 3 }, { id: 2, extra: 'x' }] }
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(out)), [{ id: 1, w: 10 }, { id: 2, w: 2, extra: 'x' }, { id: 3, w: 3 }]);
});

test('applyPending: onConflict on two columns replaces instead of duplicating', () => {
  const { applyPending } = overlayApi();
  const rows = [{ id: 1, a: 'x', b: 'y', v: 1 }];
  const out = applyPending(rows, 't', [{ table: 't', operation: 'upsert', onConflict: 'a,b', payload: { id: 9, a: 'x', b: 'y', v: 2 } }]);
  assert.equal(out.length, 1);
  assert.equal(out[0].v, 2);
  const other = applyPending(rows, 't', [{ table: 't', operation: 'upsert', onConflict: 'a,b', payload: { id: 9, a: 'x', b: 'z', v: 2 } }]);
  assert.equal(other.length, 2);
});

test('applyPending: update merges, missing row is a no-op, delete removes, ids match loosely', () => {
  const { applyPending } = overlayApi();
  const rows = [{ id: 1, w: 1 }, { id: 2, w: 2 }];
  const out = applyPending(rows, 't', [
    { table: 't', operation: 'update', id: '1', payload: { w: 5 } },
    { table: 't', operation: 'update', id: 99, payload: { w: 5 } },
    { table: 't', operation: 'delete', id: '2' }
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(out)), [{ id: 1, w: 5 }]);
});

test('applyPending: pure, idempotent, ignores other tables, tolerates non-arrays', () => {
  const { applyPending } = overlayApi();
  const rows = [{ id: 1, w: 1 }];
  const frozen = JSON.stringify(rows);
  rows.forEach(Object.freeze);
  Object.freeze(rows);
  const muts = [
    { table: 't', operation: 'update', id: 1, payload: { w: 2 } },
    { table: 't', operation: 'insert', payload: { id: 2 } },
    { table: 'other', operation: 'delete', id: 1 }
  ];
  const once = applyPending(rows, 't', muts);
  assert.equal(JSON.stringify(rows), frozen);
  assert.deepEqual(JSON.parse(JSON.stringify(applyPending(once, 't', muts))), JSON.parse(JSON.stringify(once)));
  assert.equal(once.length, 2);
  assert.deepEqual([...applyPending(null, 't', muts).map(r => r.id)], [2]);
});

test('getPending / getFailed filter by user and return copies', () => {
  const world = setup();
  seedQueue(world, [queued('a'), queued('b', { userId: 'other' }), queued('c')]);
  world.context.localStorage.setItem('trainerpro_sync_failed', JSON.stringify([queued('d'), queued('e', { userId: 'other' })]));
  assert.deepEqual(world.service.getPending('trainer').map(i => i.queueId), ['a', 'c']);
  assert.deepEqual(world.service.getFailed('trainer').map(i => i.queueId), ['d']);
  world.service.getPending('trainer')[0].queueId = 'changed';
  assert.equal(world.queue()[0].queueId, 'a');
});

test('retryFailed moves the item to the end of the queue and a flush sends it; discardFailed drops the empty key', async () => {
  const world = setup();
  await world.tick();
  const ls = world.context.localStorage;
  seedQueue(world, [queued('a', { userId: 'other' })]);
  ls.setItem('trainerpro_sync_failed', JSON.stringify([queued('f', { attempts: 5, status: 'failed', lastError: 'boom' }), queued('g')]));
  assert.equal(world.service.retryFailed('nope'), false);
  assert.equal(world.service.retryFailed('f'), true);
  const moved = world.queue().find(i => i.queueId === 'f');
  assert.equal(moved.attempts, 0);
  assert.equal('status' in moved && 'lastError' in moved, false);
  assert.equal(world.queue()[world.queue().length - 1].queueId, 'f');
  await world.tick(); await world.tick();
  assert.equal(world.calls.length, 1, 'the retried change was sent');
  assert.equal(world.service.discardFailed('g'), true);
  assert.equal(world.service.discardFailed('g'), false);
  assert.equal(ls.has('trainerpro_sync_failed'), false);
});

test('enqueue dispatches trainerpro-sync-queue with queued:true and the user count', async () => {
  const world = setup();
  await world.tick();
  world.setOnline(false);
  await world.service.mutate('olcumler', 'insert', { id: 1 });
  await world.service.mutate('olcumler', 'insert', { id: 2 });
  const details = world.events.filter(e => e.type === 'trainerpro-sync-queue').map(e => ({ ...e.detail }));
  assert.deepEqual(details, [{ pending: 1, queued: true }, { pending: 2, queued: true }]);
});

test('duplicate-key on a queued insert counts as sent; a direct mutate returns the error', async () => {
  const dup = { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "olcumler_pkey"', details: 'Key (id)=(1) already exists.' } };
  const world = setup({ respond: () => dup });
  await world.tick();
  seedQueue(world, [queued('a')]);
  await world.service.flushQueue();
  assert.equal(world.queue().length, 0);
  assert.equal(world.failedList().length, 0);
  assert.equal(world.events.filter(e => e.type === 'trainerpro-sync-failed').length, 0);
  const direct = await world.service.mutate('olcumler', 'insert', { id: 5 });
  assert.equal(direct.error.code, '23505');
  assert.equal(direct.queued, false);
});

test('auth error during a flush keeps every item untouched, signals once, stops, schedules no retry', async () => {
  const world = setup({ respond: () => ({ data: null, error: { status: 401, message: 'JWT expired' } }) });
  await world.tick();
  seedQueue(world, [queued('a', { attempts: 2 }), queued('b')]);
  world.timers.length = 0;
  await world.service.flushQueue();
  assert.equal(world.calls.length, 1, 'later items are not executed');
  assert.deepEqual(world.queue().map(i => [i.queueId, i.attempts]), [['a', 2], ['b', 0]]);
  assert.equal(world.events.filter(e => e.type === 'trainerpro-sync-auth').length, 1);
  assert.equal(world.timers.length, 0);
});

test('a 403 permission error still counts as an attempt', async () => {
  const world = setup({ respond: () => ({ data: null, error: { status: 403, code: '42501', message: 'denied' } }) });
  await world.tick();
  seedQueue(world, [queued('a')]);
  await world.service.flushQueue();
  assert.equal(world.queue()[0].attempts, 1);
  assert.equal(world.events.filter(e => e.type === 'trainerpro-sync-auth').length, 0);
});

test('a timed-out direct mutate is queued', async () => {
  const world = setup({ respond: () => ({ data: null, error: { name: 'TimeoutError', message: 'The operation was aborted due to timeout' } }) });
  await world.tick();
  const result = await world.service.mutate('olcumler', 'insert', { id: 1 });
  assert.equal(result.queued, true);
  assert.equal(world.queue().length, 1);
});

test('a 23505 on another constraint is a real failure: attempts count and it ends in the failed list', async () => {
  const other = { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "weekly_program_schedule_member_id_day_of_week_start_time_key"', details: 'Key (member_id, day_of_week)=(1, 2) already exists.' } };
  const world = setup({ respond: () => other });
  await world.tick();
  seedQueue(world, [queued('a')]);
  await world.service.flushQueue();
  assert.equal(world.queue()[0].attempts, 1);
  for (let i = 0; i < 6; i += 1) await world.service.flushQueue();
  assert.equal(world.queue().length, 0);
  assert.equal(world.failedList().length, 1);
});

test('a 23505 on a queued upsert counts as an attempt', async () => {
  const world = setup({ respond: () => ({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "olcumler_pkey"', details: 'Key (id)=(1) already exists.' } }) });
  await world.tick();
  seedQueue(world, [queued('a', { operation: 'upsert' })]);
  await world.service.flushQueue();
  assert.equal(world.queue()[0].attempts, 1);
});

test('a database "transaction is aborted" error is not taken for no connection', async () => {
  const world = setup({ respond: () => ({ data: null, error: { message: 'current transaction is aborted, commands ignored until end of transaction block' } }) });
  await world.tick();
  const direct = await world.service.mutate('olcumler', 'insert', { id: 1 });
  assert.equal(direct.queued, false);
  assert.ok(direct.error);
  assert.equal(world.queue().length, 0);
  seedQueue(world, [queued('a')]);
  await world.service.flushQueue();
  assert.equal(world.queue()[0].attempts, 1);
});

test('a change made after the token expired offline is labelled with the last known user, without getSession', async () => {
  const world = setup();
  await world.tick();
  world.fireAuth('TOKEN_REFRESHED', { user: { id: 'trainer' } });
  world.setUser(null); // getSession() now answers "no session", as with an expired token and no connection
  world.setOnline(false);
  const result = await world.service.mutate('olcumler', 'insert', { id: 9 });
  assert.equal(result.queued, true);
  assert.equal(world.queue()[0].userId, 'trainer');
  assert.equal(world.service.getPendingCount('trainer'), 1);
  world.fireAuth('SIGNED_OUT');
  await world.service.mutate('olcumler', 'insert', { id: 10 });
  assert.equal(world.queue()[1].userId, null, 'sign-out forgets the user');
});

test('a connection error stops the flush: later changes are not sent and the order is kept', async () => {
  const world = setup({ respond: call => (call.payload.id === 'older'
    ? { data: null, error: { message: 'TimeoutError: timed out' } } : { data: [{}], error: null }) });
  await world.tick();
  seedQueue(world, [queued('older', { payload: { id: 'older' } }), queued('newer', { payload: { id: 'newer' } })]);
  world.timers.length = 0;
  await world.service.flushQueue();
  assert.equal(world.calls.length, 1, 'the newer change must not overtake the older one');
  assert.deepEqual(world.queue().map(i => i.queueId), ['older', 'newer']);
});
