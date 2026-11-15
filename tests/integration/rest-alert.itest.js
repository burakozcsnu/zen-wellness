// Rest-end push (rest_alerts table + rest-alert Edge Function) on the TEST project: who may touch the table, who may call the
// function, and that the push is sent only for the current, uncancelled alert. A push is observed through sent_at.
// Needs the functions deployed first: node scripts/deploy-test-functions.js
const { describe, it, before, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { env, signIn, rest } = require('../helpers/api');

const CRON_SECRET = process.env.ZEN_TESTDB_CRON_SECRET;
const FUNCTION_URL = `${env.url}/functions/v1/rest-alert`;
const FAKE_PUSH = `${env.url}/functions/v1/fake-push`;
const skip = CRON_SECRET ? false : 'ZEN_TESTDB_CRON_SECRET is not set: deploy the test functions (node scripts/deploy-test-functions.js)';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const uid = () => Date.now() * 10 + Math.floor(Math.random() * 10);
const inSeconds = s => new Date(Date.now() + s * 1000).toISOString();
const call = (token, body, extraHeaders = {}) => fetch(FUNCTION_URL, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extraHeaders }, body: JSON.stringify(body)
});
const table = (token, method, query, body) => fetch(`${env.url}/rest/v1/rest_alerts${query}`, {
  method, headers: { apikey: env.publishableKey, Authorization: `Bearer ${token || env.publishableKey}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
  body: body === undefined ? undefined : JSON.stringify(body)
}).then(async r => ({ status: r.status, rows: r.ok ? await r.json().catch(() => []) : [] }));

describe('rest-alert (test project)', { skip }, () => {
  let admin, clientA, clientB, memberA, memberB;
  const subscriptions = [];

  before(async () => {
    [admin, clientA, clientB] = await Promise.all([
      signIn(env.adminEmail, env.adminPassword), signIn(env.clientEmail, env.clientPassword),
      signIn(process.env.ZEN_TESTDB_NEWCLIENT_EMAIL, process.env.ZEN_TESTDB_NEWCLIENT_PASSWORD)
    ]);
    const idOf = async token => (await rest(token, 'GET', 'uyeler?select=id'))[0].id;
    [memberA, memberB] = await Promise.all([idOf(clientA), idOf(clientB)]);
    await rest(admin, 'DELETE', `push_subscriptions?member_id=eq.${memberA}`);
  });

  afterEach(async () => {
    await rest(admin, 'DELETE', `rest_alerts?member_id=in.(${memberA},${memberB})`).catch(() => {});
    for (const id of subscriptions.splice(0)) await rest(admin, 'DELETE', `push_subscriptions?id=eq.${id}`).catch(() => {});
  });

  const setAlert = async (member, alertId, dueAt) => {
    await rest(admin, 'DELETE', `rest_alerts?member_id=eq.${member}`);
    await rest(admin, 'POST', 'rest_alerts', { member_id: member, alert_id: alertId, due_at: dueAt });
  };
  const addSubscription = async endpoint => {
    const ecdh = crypto.createECDH('prime256v1');
    ecdh.generateKeys();
    const [row] = await rest(admin, 'POST', 'push_subscriptions', { id: uid(), member_id: memberA, endpoint, p256dh: ecdh.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') });
    subscriptions.push(row.id);
    return row;
  };
  const row = async () => (await rest(admin, 'GET', `rest_alerts?select=*&member_id=eq.${memberA}`))[0];
  const waitFor = async (check, ms) => { for (let end = Date.now() + ms; Date.now() < end; await sleep(500)) if (await check()) return true; return false; };

  describe('permissions on rest_alerts', () => {
    it('anonymous visitors see nothing and cannot write', async () => {
      await setAlert(memberA, crypto.randomUUID(), inSeconds(60));
      assert.equal((await table(null, 'GET', '?select=*')).rows.length, 0);
      const write = await table(null, 'POST', '', { member_id: memberA, alert_id: crypto.randomUUID(), due_at: inSeconds(60) });
      assert.ok(!(write.status >= 200 && write.status < 300), `anonymous insert returned HTTP ${write.status}`);
    });

    it('a client writes, reads and changes only their own row', async () => {
      const own = await table(clientA, 'POST', '?on_conflict=member_id', { member_id: memberA, alert_id: crypto.randomUUID(), due_at: inSeconds(60), sent_at: null });
      assert.ok(own.status >= 200 && own.status < 300, `own upsert returned HTTP ${own.status}`);
      assert.equal((await table(clientA, 'PATCH', `?member_id=eq.${memberA}`, { alert_id: null })).rows.length, 1);
      assert.equal((await table(clientA, 'GET', '?select=member_id')).rows.length, 1);
    });

    it("a client cannot read, change, delete or create another client's row", async () => {
      await setAlert(memberB, crypto.randomUUID(), inSeconds(60));
      assert.equal((await table(clientA, 'GET', `?member_id=eq.${memberB}`)).rows.length, 0, "client A read B's row");
      assert.equal((await table(clientA, 'PATCH', `?member_id=eq.${memberB}`, { alert_id: null })).rows.length, 0, "client A changed B's row");
      assert.equal((await table(clientA, 'DELETE', `?member_id=eq.${memberB}`)).rows.length, 0, "client A deleted B's row");
      await rest(admin, 'DELETE', `rest_alerts?member_id=eq.${memberB}`);
      const insert = await table(clientA, 'POST', '', { member_id: memberB, alert_id: crypto.randomUUID(), due_at: inSeconds(60) });
      assert.ok(!(insert.status >= 200 && insert.status < 300), `insert for another client returned HTTP ${insert.status}`);
    });

    it('the trainer can read and change any row', async () => {
      await setAlert(memberB, crypto.randomUUID(), inSeconds(60));
      assert.equal((await table(admin, 'GET', `?member_id=eq.${memberB}`)).rows.length, 1);
      assert.equal((await table(admin, 'PATCH', `?member_id=eq.${memberB}`, { alert_id: null })).rows.length, 1);
    });
  });

  describe('function access', () => {
    it('rejects no token, a bad token, a bad body and a wrong chain secret', async () => {
      const id = crypto.randomUUID();
      await setAlert(memberA, id, inSeconds(60));
      assert.equal((await call(null, { alert_id: id })).status, 401);
      assert.equal((await call('not-a-token', { alert_id: id })).status, 401);
      assert.equal((await call(clientA, { alert_id: 'nope' })).status, 400);
      assert.equal((await call(null, { alert_id: id, member_id: memberA }, { 'x-rest-alert-chain': 'wrong-secret' })).status, 401);
    });

    it('rejects an alert_id that is not the current one, one due too far away, one long past, one already sent, one cancelled', async () => {
      const id = crypto.randomUUID();
      await setAlert(memberA, id, inSeconds(60));
      assert.equal((await call(clientA, { alert_id: crypto.randomUUID() })).status, 409, 'wrong alert_id');
      await setAlert(memberA, id, inSeconds(20 * 60));
      assert.equal((await call(clientA, { alert_id: id })).status, 409, 'due too far');
      await setAlert(memberA, id, inSeconds(-30));
      assert.equal((await call(clientA, { alert_id: id })).status, 409, 'long past');
      await setAlert(memberA, id, inSeconds(60));
      await rest(admin, 'PATCH', `rest_alerts?member_id=eq.${memberA}`, { sent_at: new Date().toISOString() });
      assert.equal((await call(clientA, { alert_id: id })).status, 409, 'already sent');
      await setAlert(memberA, null, inSeconds(60));
      assert.equal((await call(clientA, { alert_id: id })).status, 409, 'cancelled');
    });
  });

  describe('sending', () => {
    it('a due alert is accepted at once and sent after the end plus grace (sent_at set, not before)', async () => {
      await addSubscription(`${FAKE_PUSH}?case=rest`);
      const id = crypto.randomUUID();
      await setAlert(memberA, id, inSeconds(3));
      const started = Date.now();
      assert.equal((await call(clientA, { alert_id: id })).status, 202);
      assert.ok(Date.now() - started < 3000, 'the function must answer before the rest ends');
      assert.equal((await row()).sent_at, null, 'sent before the rest ended');
      assert.ok(await waitFor(async () => (await row()).sent_at, 15000), 'sent_at was never set');
      assert.ok(Date.now() - started >= 5500, 'sent before the grace period was over');
    });

    it('two calls for the same alert end with the alert claimed; a sent alert is not accepted again', async () => {
      await addSubscription(`${FAKE_PUSH}?case=rest-twice`);
      const id = crypto.randomUUID();
      await setAlert(memberA, id, inSeconds(3));
      const results = await Promise.all([call(clientA, { alert_id: id }), call(clientA, { alert_id: id })]);
      assert.deepEqual(results.map(r => r.status), [202, 202]);
      assert.ok(await waitFor(async () => (await row()).sent_at, 15000));
      assert.equal((await call(clientA, { alert_id: id })).status, 409, 'a sent alert accepted again');
    });

    it('an alert cancelled before it is due (alert_id null) is never sent', async () => {
      await addSubscription(`${FAKE_PUSH}?case=rest-cancel`);
      const id = crypto.randomUUID();
      await setAlert(memberA, id, inSeconds(3));
      assert.equal((await call(clientA, { alert_id: id })).status, 202);
      assert.equal((await table(clientA, 'PATCH', `?member_id=eq.${memberA}`, { alert_id: null })).rows.length, 1);
      await sleep(8000);
      assert.equal((await row()).sent_at, null, 'a cancelled alert was sent');
    });

    it('an extended rest replaces the alert: the old one is not sent, the new one is', async () => {
      await addSubscription(`${FAKE_PUSH}?case=rest-extend`);
      const oldId = crypto.randomUUID();
      const newId = crypto.randomUUID();
      await setAlert(memberA, oldId, inSeconds(3));
      assert.equal((await call(clientA, { alert_id: oldId })).status, 202);
      await rest(admin, 'PATCH', `rest_alerts?member_id=eq.${memberA}`, { alert_id: newId, due_at: inSeconds(8) });
      assert.equal((await call(clientA, { alert_id: newId })).status, 202);
      await sleep(7500); // past the old alert's wake-up (6 s), before the new one's (11 s)
      assert.equal((await row()).sent_at, null, 'the replaced alert was sent');
      assert.ok(await waitFor(async () => (await row()).sent_at, 10000), 'the new alert was never sent');
    });

    it('the chained call (right secret, no user token) sends too', async () => {
      await addSubscription(`${FAKE_PUSH}?case=rest-chain`);
      const id = crypto.randomUUID();
      await setAlert(memberA, id, inSeconds(3));
      assert.equal((await call(null, { alert_id: id, member_id: memberA }, { 'x-rest-alert-chain': CRON_SECRET })).status, 202);
      assert.ok(await waitFor(async () => (await row()).sent_at, 15000));
    });

    it('a rest longer than one sleep step really chains and is sent after the end, not before', { timeout: 200000 }, async () => {
      await addSubscription(`${FAKE_PUSH}?case=rest-long`);
      const id = crypto.randomUUID();
      await setAlert(memberA, id, inSeconds(130));
      assert.equal((await call(clientA, { alert_id: id })).status, 202);
      await sleep(125000); // past two 60 s steps: the first runs have handed over to chained ones
      assert.equal((await row()).sent_at, null, 'sent before the rest ended');
      assert.ok(await waitFor(async () => (await row()).sent_at, 30000), 'the chained run never sent');
    });

    it('a subscription the push service reports as gone (410) is deleted', async () => {
      const gone = await addSubscription(`${FAKE_PUSH}/gone`);
      const id = crypto.randomUUID();
      await setAlert(memberA, id, inSeconds(3));
      assert.equal((await call(clientA, { alert_id: id })).status, 202);
      assert.ok(await waitFor(async () => !(await rest(admin, 'GET', `push_subscriptions?select=id&id=eq.${gone.id}`)).length, 15000), 'expired subscription was kept');
    });
  });
});
