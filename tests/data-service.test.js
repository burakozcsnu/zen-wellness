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
      setItem: (key, value) => store.set(key, String(value))
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
    fireAuth: event => authCallback?.(event),
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
    { table: 'olcumler', operation: 'update', payload: { weight: 1 }, id: '1700000000000-abc', attempts: 0 },
    { table: 'olcumler', operation: 'insert', payload: { id: 4 }, id: '1700000000001-def', attempts: 0 }
  ]));
  await world.service.flushQueue();
  assert.equal(world.calls.length, 1);
  assert.equal(world.calls[0].op, 'insert');
  assert.equal(world.queue().length, 0);
  assert.equal(world.failedList().length, 1);
});
