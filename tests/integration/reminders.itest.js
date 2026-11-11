// The reminder Edge Function (send-schedule-reminders) running on the TEST project: access control, the 1-day and
// 1-hour reminders, no duplicates, survival of a dead push endpoint, and schedule-change notifications.
// Needs the functions deployed first: node scripts/deploy-test-functions.js
const { describe, it, before, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { env, signIn, rest } = require('../helpers/api');

const CRON_SECRET = process.env.ZEN_TESTDB_CRON_SECRET;
const FUNCTION_URL = `${env.url}/functions/v1/send-schedule-reminders`;
const FAKE_PUSH = `${env.url}/functions/v1/fake-push`;
const skip = CRON_SECRET ? false : 'ZEN_TESTDB_CRON_SECRET is not set: deploy the test functions (node scripts/deploy-test-functions.js)';

let counter = 0;
const uid = () => Date.now() * 10 + (counter++ % 10);
const run = secret => fetch(FUNCTION_URL, { headers: secret ? { Authorization: `Bearer ${secret}` } : {} });

// Day of week (1=Mon..7=Sun) and HH:MM of an instant in Istanbul time, the zone the function schedules in.
function istanbulSlot(instant) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(instant).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  return { day: { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[parts.weekday], time: `${parts.hour}:${parts.minute}:00` };
}

// A valid (but fake) browser push subscription pointing at the stand-in push service.
const fakeKeys = () => {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  return { p256dh: ecdh.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') };
};

describe('reminder Edge Function (test project)', { skip }, () => {
  let admin, memberId;
  const cleanup = []; // [table, id]

  before(async () => {
    admin = await signIn(env.adminEmail, env.adminPassword);
    [{ id: memberId }] = await rest(admin, 'GET', `uyeler?select=id&email=eq.${encodeURIComponent(env.clientEmail)}`);
    // Other suites may leave subscriptions behind; start clean so counts below are exact.
    await rest(admin, 'DELETE', `push_subscriptions?member_id=eq.${memberId}`);
  });

  // Every test starts with no subscriptions or schedules of its own, so counts are exact.
  afterEach(async () => {
    for (const [table, id] of cleanup.splice(0).reverse()) await rest(admin, 'DELETE', `${table}?id=eq.${id}`).catch(() => {});
  });

  const addSubscription = async endpoint => {
    const [row] = await rest(admin, 'POST', 'push_subscriptions', { id: uid(), member_id: memberId, endpoint, ...fakeKeys() });
    cleanup.push(['push_subscriptions', row.id]);
    return row;
  };
  // Schedule whose start is `msFromNow` away. The function compares WHOLE MINUTES: the start time must equal the minute of
  // "now + msFromNow" at the moment it runs. So start from a safe second of the minute (the call must not cross a minute boundary).
  const addScheduleIn = async msFromNow => {
    while (new Date().getSeconds() > 40 || new Date().getSeconds() < 2) await new Promise(resolve => setTimeout(resolve, 1000));
    const target = new Date(Date.now() + msFromNow);
    const { day, time } = istanbulSlot(target);
    const [row] = await rest(admin, 'POST', 'weekly_program_schedule', { id: uid(), member_id: memberId, day_of_week: day, start_time: time, branch: 'Fitness' });
    cleanup.push(['weekly_program_schedule', row.id]);
    return row;
  };
  const deliveries = scheduleId => rest(admin, 'GET', `push_reminder_deliveries?select=*&schedule_id=eq.${scheduleId}`);

  it('rejects calls without the secret or with a wrong one', async () => {
    assert.equal((await run(null)).status, 401);
    assert.equal((await run('definitely-not-the-secret')).status, 401);
  });

  it('accepts the secret and answers with a count', async () => {
    const response = await run(CRON_SECRET);
    assert.equal(response.status, 200);
    assert.equal(typeof (await response.json()).sent, 'number');
  });

  for (const [label, type, ms] of [['1 hour before', 'hour-before', 3600000], ['1 day before', 'day-before', 86400000]]) {
    it(`sends the "${label}" reminder once and never twice`, async () => {
      const subscription = await addSubscription(`${FAKE_PUSH}?case=${type}`);
      const schedule = await addScheduleIn(ms);
      const first = await (await run(CRON_SECRET)).json();
      assert.ok(first.sent >= 1, `expected a delivery, got ${JSON.stringify(first)}`);
      const rows = await deliveries(schedule.id);
      assert.equal(rows.length, 1, 'one delivery row per subscription');
      assert.equal(rows[0].reminder_type, type);
      assert.equal(rows[0].subscription_id, subscription.id);
      // Running again inside the same minute-window must not notify the client again.
      await run(CRON_SECRET);
      assert.equal((await deliveries(schedule.id)).length, 1, 'duplicate reminder was sent');
    });
  }

  it('does not remind about a session that is not due', async () => {
    await addSubscription(`${FAKE_PUSH}?case=not-due`);
    const schedule = await addScheduleIn(5 * 3600000);
    await run(CRON_SECRET);
    assert.equal((await deliveries(schedule.id)).length, 0);
  });

  it('survives a dead push endpoint: no crash, no false "delivered" record', async () => {
    const dead = await addSubscription('https://push-service.invalid/dead-endpoint');
    const schedule = await addScheduleIn(3600000);
    const response = await run(CRON_SECRET);
    assert.equal(response.status, 200);
    const rows = (await deliveries(schedule.id)).filter(row => row.subscription_id === dead.id);
    assert.equal(rows.length, 0, 'a failed push must not be recorded as delivered');
  });

  it('sends a schedule-change notification and marks it as sent', async () => {
    await addSubscription(`${FAKE_PUSH}?case=notification`);
    const [note] = await rest(admin, 'POST', 'schedule_notifications', { id: uid(), member_id: memberId, action: 'updated', message: 'E2E: seans saati değişti' });
    cleanup.push(['schedule_notifications', note.id]);
    const result = await (await run(CRON_SECRET)).json();
    assert.ok(result.sent >= 1);
    const [after] = await rest(admin, 'GET', `schedule_notifications?select=push_sent_at&id=eq.${note.id}`);
    assert.ok(after.push_sent_at, 'notification was not marked as sent');
  });
});
