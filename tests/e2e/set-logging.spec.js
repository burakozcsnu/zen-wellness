// A client logs a workout set by set on the session screen: from the button to the database, with the rest countdown,
// corrections, resuming after a reload, "last time" numbers, saving offline, and the phone layout.
const { test, expect, login } = require('./fixtures');
const { env, signIn, rest } = require('../helpers/api');

const stamp = Date.now();
const today = () => new Date().toLocaleDateString('en-CA');
const queueLength = page => page.evaluate(() => JSON.parse(localStorage.getItem('trainerpro_sync_queue') || '[]').length);
const clean = problems => problems.filter(p => !p.includes('Failed to load resource'));

test.describe('client set logging', () => {
  test.describe.configure({ mode: 'serial' });
  let admin, memberId, workoutId;
  const title = `E2E Set Günlüğü ${stamp}`;
  // The trainer form saves one entry per set (text values); 2 exercises x 2 sets, rest 30.
  const setler = ['E2E Squat', 'E2E Row'].flatMap(ad => [1, 2].map(set_no => (
    { ad, set_no, weight: '60', reps: '8', sure: '', tip: 'Normal', tempo: '', rest_seconds: 30, rpe: null })));

  const sessions = () => rest(admin, 'GET', `workout_sessions?select=id,status,ended_at,metadata&member_id=eq.${memberId}&metadata->>workoutId=eq.${workoutId}&order=started_at`);
  const steps = sessionId => rest(admin, 'GET', `workout_session_steps?select=id,step_index,exercise_name,weight,reps,completed&workout_session_id=eq.${sessionId}&order=step_index`);

  test.beforeAll(async () => {
    admin = await signIn(env.adminEmail, env.adminPassword);
    [{ id: memberId }] = await rest(admin, 'GET', `uyeler?select=id&email=eq.${encodeURIComponent(env.clientEmail)}`);
    // A far-future date keeps it at the top of the client's list of ten.
    [{ id: workoutId }] = await rest(admin, 'POST', 'antrenmanlar', {
      id: stamp, member_id: memberId, tarih: '2099-12-31', sablon: title, setler: JSON.stringify(setler), rest_seconds: 30
    });
  });
  const deleteSessions = async () => {
    for (const { id } of await sessions()) await rest(admin, 'DELETE', `workout_sessions?id=eq.${id}`).catch(() => {}); // steps cascade
  };
  test.beforeEach(deleteSessions);
  test.afterAll(async () => {
    await deleteSessions();
    await rest(admin, 'DELETE', `antrenmanlar?id=eq.${workoutId}`).catch(() => {});
  });

  const openWorkouts = async page => {
    await login(page, 'user', env.clientEmail, env.clientPassword);
    await expect(page.getByText('Hoş geldiniz')).toBeVisible({ timeout: 20000 });
    await page.locator('[data-portal-tab="workouts"]').click();
    return page.locator('.member-portal-list li', { hasText: title });
  };
  const begin = async page => {
    const item = await openWorkouts(page);
    await item.getByRole('button', { name: 'Antrenmanı Başlat' }).click();
    await expect(page.locator('#member-session')).toBeVisible();
    return page.locator('#member-session');
  };
  const rowOf = (screen, index) => screen.locator(`[data-step="${index}"]`);

  test('start, fields, save one set: rows, targets, +2,5 and the database', async ({ page, problems }) => {
    const screen = await begin(page);
    await expect(screen).toHaveAttribute('role', 'dialog');
    await expect(screen).toHaveAttribute('aria-modal', 'true');
    await expect(page.locator('#member-session-title')).toHaveText(title);
    await expect(page.locator('#member-session-title')).toBeFocused();
    await expect(page.locator('#member-session-rest-label')).toHaveText('Dinlenme süresi: 30 sn');
    await expect(screen.locator('.session-set')).toHaveCount(4);
    await expect(screen.getByText('Hedef: 60 kg × 8')).toHaveCount(4);
    await expect(screen.getByText('Set 2')).toHaveCount(2); // set numbers restart for each exercise

    const row = rowOf(screen, 0);
    await expect(row.getByLabel('Ağırlık (kg)')).toHaveValue('60');
    await expect(row.getByLabel('Ağırlık (kg)')).toHaveAttribute('inputmode', 'decimal');
    await expect(row.getByLabel('Tekrar', { exact: true })).toHaveAttribute('inputmode', 'numeric');
    await row.getByRole('button', { name: 'Ağırlığı artır' }).click();
    await expect(row.getByLabel('Ağırlık (kg)')).toHaveValue('62,5');
    await row.getByRole('button', { name: 'Tamam' }).click();
    await expect(row).toContainText('✓ 62,5 kg × 8');
    await expect(row.getByRole('button', { name: 'Düzelt' })).toBeVisible();
    await expect(rowOf(screen, 1).getByRole('button', { name: 'Tamam' })).toBeVisible(); // the others are untouched

    const [session, ...extra] = await sessions();
    expect(extra).toEqual([]);
    expect(session.status).toBe('active');
    expect(Number(session.metadata.workoutId)).toBe(workoutId);
    await expect.poll(async () => (await steps(session.id)).length).toBe(1);
    const [step] = await steps(session.id);
    expect(step).toMatchObject({ step_index: 0, exercise_name: 'E2E Squat', weight: 62.5, reps: 8, completed: true });
    expect(clean(problems)).toEqual([]);
  });

  test('rest countdown: runs from the end time, +15 sn, Geç, and ends', async ({ page, problems }) => {
    const screen = await begin(page);
    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    const bar = page.locator('#member-session-rest-bar');
    await expect(bar).toBeHidden();
    await rowOf(screen, 0).getByRole('button', { name: 'Tamam' }).click();
    await expect(bar).toHaveAttribute('role', 'timer');
    await expect(page.locator('#member-session-rest-text')).toHaveText('Dinlenme: 0:30');
    await page.clock.runFor(10000);
    await expect(page.locator('#member-session-rest-text')).toHaveText('Dinlenme: 0:20');
    await bar.getByRole('button', { name: '+15 sn' }).click();
    await expect(page.locator('#member-session-rest-text')).toHaveText('Dinlenme: 0:35');
    await page.clock.runFor(35000);
    await expect(page.locator('#member-session-rest-text')).toHaveText('Dinlenme bitti');
    await expect(page.locator('#member-session-rest-live')).toHaveText('Dinlenme bitti');
    await page.clock.runFor(5000);
    await expect(bar).toBeHidden();

    await rowOf(screen, 1).getByRole('button', { name: 'Tamam' }).click(); // the next set restarts it
    await expect(page.locator('#member-session-rest-text')).toHaveText('Dinlenme: 0:30');
    await bar.getByRole('button', { name: 'Geç' }).click();
    await expect(bar).toBeHidden();
    // The rest setting: 15 s steps, 0 means off.
    await screen.getByRole('button', { name: 'Dinlenme süresini azalt' }).click();
    await expect(page.locator('#member-session-rest-label')).toHaveText('Dinlenme süresi: 15 sn');
    await screen.getByRole('button', { name: 'Dinlenme süresini azalt' }).click();
    await expect(page.locator('#member-session-rest-label')).toHaveText('Dinlenme süresi: Kapalı');
    await rowOf(screen, 2).getByRole('button', { name: 'Tamam' }).click();
    await expect(rowOf(screen, 2)).toContainText('✓');
    await expect(bar).toBeHidden(); // rest off: no bar
    expect(clean(problems)).toEqual([]);
  });

  test('Düzelt saves over the same row', async ({ page }) => {
    const screen = await begin(page);
    const row = rowOf(screen, 0);
    await row.getByRole('button', { name: 'Tamam' }).click();
    await expect(row).toContainText('✓ 60 kg × 8');
    const [session] = await sessions();
    await expect.poll(async () => (await steps(session.id)).length).toBe(1);
    const [before] = await steps(session.id);

    await row.getByRole('button', { name: 'Düzelt' }).click();
    await row.getByLabel('Tekrar', { exact: true }).fill('10');
    await row.getByRole('button', { name: 'Tamam' }).click();
    await expect(row).toContainText('✓ 60 kg × 10');
    await expect.poll(async () => (await steps(session.id))[0]?.reps).toBe(10);
    const after = await steps(session.id);
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(before.id);
  });

  test('an invalid number shows the toast and saves nothing', async ({ page }) => {
    const screen = await begin(page);
    const row = rowOf(screen, 0);
    for (const bad of ['0', 'abc', '1000', '2,5']) {
      await row.getByLabel('Tekrar', { exact: true }).fill(bad);
      await row.getByRole('button', { name: 'Tamam' }).click();
      await expect(page.locator('#toast-region')).toContainText('Geçerli bir sayı girin.');
      await expect(row.getByLabel('Tekrar', { exact: true })).toBeFocused();
    }
    await row.getByLabel('Ağırlık (kg)').fill('1000');
    await row.getByLabel('Tekrar', { exact: true }).fill('8');
    await row.getByRole('button', { name: 'Tamam' }).click();
    await expect(row.getByLabel('Ağırlık (kg)')).toBeFocused();
    await expect(row.getByRole('button', { name: 'Tamam' })).toBeVisible();
    const [session] = await sessions();
    expect(await steps(session.id)).toEqual([]);
    // A bodyweight set (empty weight) is allowed and stored without a weight.
    await row.getByLabel('Ağırlık (kg)').fill('');
    await row.getByRole('button', { name: 'Tamam' }).click();
    await expect(row).toContainText('✓ 8 tekrar');
    await expect.poll(async () => (await steps(session.id)).length).toBe(1);
    expect((await steps(session.id))[0].weight).toBeNull();
  });

  test('reload mid-session: Devam Et shows the saved sets and keeps one session', async ({ page, problems }) => {
    const screen = await begin(page);
    await rowOf(screen, 0).getByRole('button', { name: 'Tamam' }).click();
    await expect(rowOf(screen, 0)).toContainText('✓');
    await expect.poll(async () => (await sessions()).length).toBe(1);
    const [session] = await sessions();
    await expect.poll(async () => (await steps(session.id)).length).toBe(1);

    await page.reload();
    await page.locator('.brand-splash-logo').click({ force: true }); // the splash shows on every load; the role resumes the saved session
    await page.locator('.portal-role:not(.portal-role-admin)').click();
    await expect(page.getByText('Hoş geldiniz')).toBeVisible({ timeout: 20000 });
    await page.locator('[data-portal-tab="workouts"]').click();
    const item = page.locator('.member-portal-list li', { hasText: title });
    await expect(item.getByRole('button', { name: 'Devam Et' })).toBeVisible();
    await item.getByRole('button', { name: 'Devam Et' }).click();
    await expect(rowOf(page.locator('#member-session'), 0)).toContainText('✓ 60 kg × 8');
    await expect(rowOf(page.locator('#member-session'), 1).getByRole('button', { name: 'Tamam' })).toBeVisible();
    expect((await sessions()).map(s => s.id)).toEqual([session.id]);

    await page.locator('#member-session').getByRole('button', { name: 'Kapat' }).click(); // leaves the screen, the session stays active
    await expect(page.locator('#member-session')).toBeHidden();
    await expect(item.getByRole('button', { name: 'Devam Et' })).toBeFocused();
    expect((await sessions())[0].status).toBe('active');
    expect(clean(problems)).toEqual([]);
  });

  test('finish: completed, last time numbers next time, and an empty session is cancelled', async ({ page, problems }) => {
    const screen = await begin(page);
    await rowOf(screen, 0).getByRole('button', { name: 'Ağırlığı artır' }).click();
    await rowOf(screen, 0).getByRole('button', { name: 'Tamam' }).click();
    await expect(rowOf(screen, 0)).toContainText('✓ 62,5 kg × 8');
    await screen.getByRole('button', { name: 'Antrenmanı Bitir' }).click();
    await expect(page.locator('#toast-region')).toContainText('Antrenman kaydedildi.');
    await expect(screen).toBeHidden();
    await expect(page.locator('[data-portal-section="workouts"]')).toBeVisible();
    await expect.poll(async () => (await sessions())[0]?.status).toBe('completed');
    expect((await sessions())[0].ended_at).not.toBeNull();

    const item = page.locator('.member-portal-list li', { hasText: title });
    await item.getByRole('button', { name: 'Antrenmanı Başlat' }).click();
    const again = rowOf(page.locator('#member-session'), 0);
    await expect(again).toContainText('Geçen sefer: 62,5 kg × 8');
    await expect(again.getByLabel('Ağırlık (kg)')).toHaveValue('62,5');
    await expect(again.getByLabel('Tekrar', { exact: true })).toHaveValue('8');
    await page.locator('#member-session').getByRole('button', { name: 'Antrenmanı Bitir' }).click();
    await expect(page.locator('#toast-region')).toContainText('Kayıt yapılmadı.');
    await expect.poll(async () => (await sessions()).map(s => s.status)).toEqual(['completed', 'cancelled']);
    expect(clean(problems)).toEqual([]);
  });

  test('a set saved offline shows at once, waits in the queue and reaches the database once', async ({ page, context, problems }) => {
    const screen = await begin(page);
    await expect.poll(async () => (await sessions()).length).toBe(1); // the session itself is sent
    await context.setOffline(true);
    await rowOf(screen, 0).getByRole('button', { name: 'Tamam' }).click();
    await expect(rowOf(screen, 0)).toContainText('✓ 60 kg × 8', { timeout: 3000 });
    await expect(page.locator('#sync-pending-button')).toHaveText('1');
    expect(await queueLength(page)).toBe(1);

    await context.setOffline(false);
    await expect.poll(() => queueLength(page), { timeout: 20000 }).toBe(0);
    const [session] = await sessions();
    await expect.poll(async () => (await steps(session.id)).length, { timeout: 15000 }).toBe(1);
    await expect(rowOf(page.locator('#member-session'), 0)).toContainText('✓ 60 kg × 8'); // the reload after the send keeps it
    expect(clean(problems)).toEqual([]);
  });

  test('phone layout: touch targets, no sideways scroll, the rest bar never covers the last row', async ({ page, problems }) => {
    await page.setViewportSize({ width: 375, height: 700 });
    const item = await openWorkouts(page);
    const startButton = item.getByRole('button', { name: 'Antrenmanı Başlat' });
    const size = async locator => { const box = await locator.boundingBox(); return [Math.round(box.width), Math.round(box.height)]; };
    const [startW, startH] = await size(startButton);
    expect(Math.min(startW, startH)).toBeGreaterThanOrEqual(44);
    await startButton.click();
    const screen = page.locator('#member-session');
    await expect(screen).toBeVisible();
    await rowOf(screen, 0).getByRole('button', { name: 'Tamam' }).click();
    await expect(page.locator('#member-session-rest-bar')).toBeVisible();

    const buttons = screen.locator('button:visible');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(10);
    for (let i = 0; i < count; i++) {
      const [w, h] = await size(buttons.nth(i));
      expect(Math.min(w, h), `button ${i}: ${await buttons.nth(i).innerText()}`).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => [document.documentElement.scrollWidth <= innerWidth,
      document.getElementById('member-session').scrollWidth <= innerWidth])).toEqual([true, true]);

    await page.locator('#member-session-list').evaluate(list => { list.scrollTop = list.scrollHeight; });
    const last = rowOf(screen, 3).getByRole('button', { name: 'Tamam' });
    const lastBox = await last.boundingBox();
    const barBox = await page.locator('#member-session-rest-bar').boundingBox();
    expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(barBox.y);
    await last.click();
    await expect(rowOf(screen, 3)).toContainText('✓');
    expect(clean(problems)).toEqual([]);
  });

  test('a workout without sets offers no start button', async ({ page }) => {
    const [empty] = await rest(admin, 'POST', 'antrenmanlar', {
      id: stamp + 1, member_id: memberId, tarih: '2099-12-30', sablon: `E2E Boş ${stamp}`, setler: '[]'
    });
    try {
      await login(page, 'user', env.clientEmail, env.clientPassword);
      await expect(page.getByText('Hoş geldiniz')).toBeVisible({ timeout: 20000 });
      await page.locator('[data-portal-tab="workouts"]').click();
      const item = page.locator('.member-portal-list li', { hasText: `E2E Boş ${stamp}` });
      await expect(item).toContainText('Bu antrenmanda egzersiz yok.');
      await expect(item.getByRole('button')).toHaveCount(0);
    } finally {
      await rest(admin, 'DELETE', `antrenmanlar?id=eq.${empty.id}`).catch(() => {});
    }
  });

  test('keyboard: Tab and Shift+Tab stay inside the session screen, Escape closes it and returns focus', async ({ page, problems }, info) => {
    test.skip(info.project.name !== 'desktop', 'keyboard test, desktop only');
    const screen = await begin(page);
    const inside = () => page.evaluate(() => !!document.activeElement?.closest('#member-session'));
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      expect(await inside(), `after Tab ${i + 1}`).toBe(true);
    }
    // Wrap at both ends: from the first control Shift+Tab lands on the last one, and Tab from the last on the first.
    await page.evaluate(() => [...document.querySelectorAll('#member-session button, #member-session input')].find(el => el.tabIndex >= 0 && el.getClientRects().length).focus());
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => document.activeElement.textContent)).toBe('Antrenmanı Bitir');
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement.textContent)).toBe('Kapat');
    for (let i = 0; i < 5; i++) { await page.keyboard.press('Shift+Tab'); expect(await inside()).toBe(true); }
    await page.keyboard.press('Escape');
    await expect(screen).toBeHidden();
    await expect(page.locator(`[data-session-start="${workoutId}"]`)).toBeFocused();
    expect(clean(problems)).toEqual([]);
  });

  // Device features, stubbed before the page loads: the app must call each one the right way.
  const stubDevice = (missing) => page => page.addInitScript(missing => {
    const log = { vibrate: [], wake: [], released: 0, starts: [], stops: [], resumes: 0, clicks: 0, closed: 0 };
    window.__dev = log;
    const def = (obj, name, value) => Object.defineProperty(obj, name, { value, configurable: true, writable: true });
    let visibility = 'visible';
    Object.defineProperty(document, 'visibilityState', { get: () => visibility, configurable: true });
    let sentinel = null;
    log.setHidden = hidden => {
      visibility = hidden ? 'hidden' : 'visible';
      if (hidden && sentinel) sentinel.listeners.forEach(fn => fn()); // a hidden page loses the lock
      document.dispatchEvent(new Event('visibilitychange'));
    };
    document.addEventListener('click', event => { if (event.target.id === 'member-session-haptic') log.clicks++; }, true);
    if (missing) {
      ['vibrate', 'wakeLock', 'audioSession'].forEach(name => def(navigator, name, undefined));
      window.AudioContext = undefined; window.webkitAudioContext = undefined;
      return;
    }
    def(navigator, 'vibrate', pattern => { log.vibrate.push(pattern); return true; });
    def(navigator, 'audioSession', { type: 'auto' });
    def(navigator, 'wakeLock', { request: async type => {
      log.wake.push(type);
      sentinel = { listeners: [], release() { log.released++; return Promise.resolve(); }, addEventListener(_, fn) { this.listeners.push(fn); } };
      return sentinel;
    } });
    window.AudioContext = class {
      constructor() { this.currentTime = 100; this.destination = {}; }
      resume() { log.resumes++; return Promise.resolve(); }
      close() { log.closed++; return Promise.resolve(); }
      createGain() { return { gain: {}, connect() {} }; }
      createOscillator() {
        const ctx = this;
        return { frequency: {}, connect() {}, start(at) { log.starts.push(at - ctx.currentTime); }, stop(...args) { log.stops.push(args.length); } };
      }
    };
  }, missing);
  const dev = (page, key) => page.evaluate(k => window.__dev[k], key);

  test('device features: wake lock, hidden-page re-request, scheduled beep, vibration, haptic switch, cancel, release', async ({ page, problems }) => {
    await stubDevice(false)(page);
    const screen = await begin(page);
    expect(await dev(page, 'wake')).toEqual(['screen']);
    await page.evaluate(() => window.__dev.setHidden(true));
    await page.evaluate(() => window.__dev.setHidden(false));
    await expect.poll(() => dev(page, 'wake')).toEqual(['screen', 'screen']);

    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    await rowOf(screen, 0).getByRole('button', { name: 'Tamam' }).click();
    await expect(page.locator('#member-session-rest-text')).toHaveText('Dinlenme: 0:30');
    await expect.poll(() => dev(page, 'starts')).toEqual([30]); // the beep is booked 30 s ahead on the audio clock
    expect(await page.evaluate(() => navigator.audioSession.type)).toBe('playback');
    expect(await dev(page, 'resumes')).toBe(1);
    expect(await dev(page, 'clicks')).toBe(1); // the tap itself
    expect(await dev(page, 'vibrate')).toEqual([]);
    await page.clock.runFor(30000);
    await expect(page.locator('#member-session-rest-text')).toHaveText('Dinlenme bitti');
    expect(await dev(page, 'vibrate')).toEqual([[200, 100, 200]]);
    expect(await dev(page, 'clicks')).toBe(2); // and the rest end
    await page.clock.runFor(5000);

    // Skipping cancels the booked beep and nothing vibrates later.
    await rowOf(screen, 1).getByRole('button', { name: 'Tamam' }).click();
    await expect.poll(() => dev(page, 'starts')).toHaveLength(2);
    const stopsBefore = (await dev(page, 'stops')).filter(n => n === 0).length;
    await page.locator('#member-session-rest-bar').getByRole('button', { name: 'Geç' }).click();
    expect((await dev(page, 'stops')).filter(n => n === 0).length).toBe(stopsBefore + 1);
    await page.clock.runFor(60000);
    expect(await dev(page, 'vibrate')).toHaveLength(1);

    expect(await dev(page, 'released')).toBe(0);
    await screen.getByRole('button', { name: 'Kapat' }).click();
    await expect.poll(() => dev(page, 'released')).toBe(1);
    expect(clean(problems)).toEqual([]);
  });

  test('device features missing: the whole flow still works with no errors', async ({ page, problems }) => {
    await stubDevice(true)(page);
    const screen = await begin(page);
    await page.clock.install();
    await page.clock.pauseAt(new Date(Date.now() + 1000));
    await rowOf(screen, 0).getByRole('button', { name: 'Tamam' }).click();
    await expect(page.locator('#member-session-rest-text')).toHaveText('Dinlenme: 0:30');
    await page.clock.runFor(30000);
    await expect(page.locator('#member-session-rest-text')).toHaveText('Dinlenme bitti');
    await page.evaluate(() => window.__dev.setHidden(true));
    await page.evaluate(() => window.__dev.setHidden(false));
    await screen.getByRole('button', { name: 'Kapat' }).click();
    await expect(screen).toBeHidden();
    expect(clean(problems)).toEqual([]);
  });
});
