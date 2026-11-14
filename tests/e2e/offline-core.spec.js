// Offline core on the trainer screens: unsent changes show at once and survive every refresh, the data cache is written
// per user and expires, the offline messages are honest, and a request that never answers ends up queued.
const { test, expect, login } = require('./fixtures');
// The service worker would answer style.css from its cache, past the page.route rewrite below.
test.use({ serviceWorkers: 'block' });
const { env, signIn, rest } = require('../helpers/api');

const stamp = Date.now();
const today = () => new Date().toLocaleDateString('en-CA');
const queueLength = page => page.evaluate(() => JSON.parse(localStorage.getItem('trainerpro_sync_queue') || '[]').length);
// Honest simulation of "the token ran out while offline": the saved session's expires_at is moved into the past, so
// getSession() tries a refresh, which cannot work without a connection (the page cannot be reloaded offline yet).
const expireSavedToken = page => page.evaluate(() => {
  const key = Object.keys(localStorage).find(k => /^sb-.*-auth-token$/.test(k));
  const saved = JSON.parse(localStorage.getItem(key));
  saved.expires_at = Math.floor(Date.now() / 1000) - 3600;
  localStorage.setItem(key, JSON.stringify(saved));
  return saved.user.id;
});
const queuedOwners = page => page.evaluate(() => JSON.parse(localStorage.getItem('trainerpro_sync_queue') || '[]').map(item => item.userId));
// The app's own foreground-refresh path (runs sync(), which takes the offline branch when there is no connection).
const refreshPath = page => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

test.describe('offline core (trainer)', () => {
  test.describe.configure({ mode: 'serial' });
  let admin, memberId;
  const ids = { food: stamp + 3, exercise: stamp + 4 };
  const names = { member: `E2E Çevrimdışı ${stamp}`, food: `E2E Besin ${stamp}`, exercise: `E2E Hareket ${stamp}` };

  test.beforeAll(async () => {
    admin = await signIn(env.adminEmail, env.adminPassword);
    [{ id: memberId }] = await rest(admin, 'POST', 'uyeler', { ad_soyad: names.member, trainer_id: 'burak-ozcan', kayit_tarihi: today() });
    // The app locks the other tabs until this month has a measurement.
    await rest(admin, 'POST', 'olcumler', { id: stamp + 5, member_id: memberId, tarih: today(), weight: 80 });
    await rest(admin, 'POST', 'master_besinler', { id: ids.food, ad: names.food, tip: 'Yemek', porsiyon: '100 g', kalori: 100, protein: 10, karbonhidrat: 10, yag: 1 });
    await rest(admin, 'POST', 'master_egzersizler', { id: ids.exercise, ad: names.exercise, brans: 'Fitness' });
  });

  test.afterAll(async () => {
    if (memberId) await rest(admin, 'DELETE', `uyeler?id=eq.${memberId}`).catch(() => {}); // cascades to the workouts
    await rest(admin, 'DELETE', `master_besinler?id=eq.${ids.food}`).catch(() => {});
    await rest(admin, 'DELETE', `master_egzersizler?id=eq.${ids.exercise}`).catch(() => {});
  });

  const openMenu = async page => {
    const toggle = page.locator('.mobile-logo');
    if (await toggle.isVisible() && (await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  };
  const start = async page => {
    page.on('dialog', dialog => dialog.accept());
    await login(page, 'admin', env.adminEmail, env.adminPassword);
    await expect(page.locator('.member-card', { hasText: names.member })).toBeVisible({ timeout: 20000 });
  };
  const workouts = (page, title) => page.locator('#workout-history-tree .workout-item', { hasText: title });
  const dbWorkouts = title => rest(admin, 'GET', `antrenmanlar?select=id&member_id=eq.${memberId}&sablon=eq.${encodeURIComponent(title)}`);

  test('a workout saved offline shows at once, survives refreshes, and is sent on reconnect', async ({ page, context }) => {
    const title = `E2E Antrenman ${stamp}`;
    await start(page);
    await page.locator('.member-card', { hasText: names.member }).click();
    await page.locator('#btn-tab-workouts').click();
    await context.setOffline(true);
    await page.getByRole('button', { name: /Yeni Antrenman/ }).click();
    await page.locator('#w-name').fill(title);
    await page.locator('#modal-workout button[type="submit"]').click();

    await expect(workouts(page, title)).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#toast-region')).toContainText('Bağlantı yok. Değişiklik cihazda bekliyor; bağlantı gelince gönderilecek.');
    await expect(page.locator('#sync-status')).toContainText('1 değişiklik gönderilmeyi bekliyor');
    expect(await queueLength(page)).toBe(1);

    await refreshPath(page);
    await page.waitForTimeout(1500); // the refresh runs 300 ms after the event
    await expect(workouts(page, title)).toBeVisible();

    await context.setOffline(false);
    await expect.poll(() => queueLength(page), { timeout: 20000 }).toBe(0);
    await expect.poll(async () => (await dbWorkouts(title)).length, { timeout: 15000 }).toBe(1);
    await expect(workouts(page, title)).toHaveCount(1);
  });

  test('a change made offline after the token expired shows at once, belongs to this user and is sent once on reconnect', async ({ page, context }) => {
    test.setTimeout(120000);
    const title = `E2E Abgelaufen ${stamp}`;
    await start(page);
    await page.locator('.member-card', { hasText: names.member }).click();
    await page.locator('#btn-tab-workouts').click();
    const userId = await expireSavedToken(page);
    await context.setOffline(true);
    await page.getByRole('button', { name: /Yeni Antrenman/ }).click();
    await page.locator('#w-name').fill(title);
    await page.locator('#modal-workout button[type="submit"]').click();

    await expect(workouts(page, title)).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#modal-workout')).toBeHidden({ timeout: 10000 });
    expect(await queuedOwners(page)).toEqual([userId]);
    await expect(page.locator('#sync-pending-button')).toHaveText('1');

    await context.setOffline(false); // the refresh of the token is allowed now
    await expect.poll(() => queueLength(page), { timeout: 40000 }).toBe(0);
    await expect.poll(async () => (await dbWorkouts(title)).length, { timeout: 15000 }).toBe(1);
    expect(await page.evaluate(() => localStorage.getItem('trainerpro_sync_failed'))).toBeNull();
  });

  test('a deleted client leaves no history in the device cache', async ({ page }) => {
    const gone = `E2E Silinen ${stamp}`;
    const [{ id }] = await rest(admin, 'POST', 'uyeler', { ad_soyad: gone, trainer_id: 'burak-ozcan', kayit_tarihi: today() });
    await rest(admin, 'POST', 'olcumler', { id: stamp + 7, member_id: id, tarih: today(), weight: 81 });
    const cachedRows = () => page.evaluate(memberId => (JSON.parse(localStorage.getItem('trainerpro_cache'))?.measurements || []).filter(row => row.member_id === memberId).length, id);
    try {
      page.on('dialog', dialog => dialog.accept(dialog.type() === 'prompt' ? gone : undefined)); // the delete asks for the name
      await login(page, 'admin', env.adminEmail, env.adminPassword);
      const card = page.locator('.member-card', { hasText: gone });
      await expect(card).toBeVisible({ timeout: 20000 });
      await card.getByRole('button', { name: 'Sil' }).click(); // from the list: it loads the history first, then deletes
      await expect(card).toHaveCount(0, { timeout: 20000 });
      await refreshPath(page); // a sync copies the cache back and writes it again
      await page.waitForTimeout(2000);
      expect(await cachedRows()).toBe(0);
    } finally {
      await rest(admin, 'DELETE', `uyeler?id=eq.${id}`).catch(() => {});
    }
  });

  test('offline edit and delete show at once and are sent on reconnect', async ({ page, context }) => {
    await start(page);
    await openMenu(page);
    await page.locator('#btn-nutrition').click();
    const foodCard = page.locator('.card', { hasText: names.food });
    await expect(async () => {
      if (!(await foodCard.isVisible())) await page.locator('.acc-header', { hasText: /^\s*Yemek/ }).click();
      await foodCard.locator('.btn-edit').click({ timeout: 2000 });
    }).toPass({ timeout: 20000 });
    await context.setOffline(true);
    await page.locator('#new-f-cal').fill('321');
    await page.locator('#modal-new-food button[type="submit"]').click();
    await expect(foodCard).toContainText('321', { timeout: 10000 });

    await openMenu(page);
    await page.locator('#btn-programs').click();
    // The library lists exercises in closed groups; this one has no body part, so it is in "Genel".
    const result = page.locator('#ex-group-Genel .card', { hasText: names.exercise });
    await expect(async () => {
      if (!(await result.isVisible())) await page.locator('.acc-header', { hasText: /^\s*Genel/ }).click();
      await expect(result).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 20000 });
    await result.locator('.btn-delete').click();
    await expect(result).toBeHidden({ timeout: 10000 });
    expect(await queueLength(page)).toBe(2);

    await context.setOffline(false);
    await expect.poll(() => queueLength(page), { timeout: 20000 }).toBe(0);
    await expect.poll(async () => Number((await rest(admin, 'GET', `master_besinler?select=kalori&id=eq.${ids.food}`))[0].kalori), { timeout: 15000 }).toBe(321);
    await expect.poll(async () => (await rest(admin, 'GET', `master_egzersizler?select=id&id=eq.${ids.exercise}`)).length, { timeout: 15000 }).toBe(0);
  });

  test('the cache is written per user and expires; honest offline status', async ({ page, context }) => {
    await start(page);
    await expect(page.locator('#sync-status')).toHaveText('Çevrimiçi', { timeout: 20000 });
    const cache = await page.evaluate(() => JSON.parse(localStorage.getItem('trainerpro_cache')));
    expect(cache.userId).toBeTruthy();
    expect(cache.members.length).toBeGreaterThan(0);

    await context.setOffline(true); // the browser's own "offline" event, before any refresh
    await expect(page.locator('#sync-status')).toContainText(/^Çevrimdışı · Son güncelleme: \d{2}\D\d{2} \d{2}:\d{2}/, { timeout: 5000 });
    await expect(page.locator('#sync-status')).not.toContainText('Son veriler gösteriliyor');
    await refreshPath(page);
    await expect(page.locator('#sync-status')).toContainText(/^Çevrimdışı · Son güncelleme: \d{2}\D\d{2} \d{2}:\d{2}/, { timeout: 5000 });
    await expect(page.locator('.member-card').first()).toBeVisible();

    for (const [label, change] of [['another user', { userId: 'someone-else' }], ['15 days old', { lastSync: Date.now() - 15 * 864e5 }]]) {
      await page.evaluate(c => localStorage.setItem('trainerpro_cache', JSON.stringify(c)), { ...cache, ...change });
      await page.evaluate(() => { document.getElementById('sync-status').textContent = ''; }); // so a stale text cannot match
      await refreshPath(page);
      await expect(page.locator('#sync-status'), label).toHaveText('Çevrimdışı · Bu cihazda kayıtlı veri yok', { timeout: 5000 });
      expect(await page.evaluate(() => localStorage.getItem('trainerpro_cache')), label).toBeNull();
    }
  });

  test('a write that never gets an answer is queued within 20 s and sent later', async ({ page, context }) => {
    test.setTimeout(120000);
    const title = `E2E Hung ${stamp}`;
    await start(page);
    await page.locator('.member-card', { hasText: names.member }).click();
    await page.locator('#btn-tab-workouts').click();
    await page.getByRole('button', { name: /Yeni Antrenman/ }).click();
    await page.route('**/rest/v1/antrenmanlar*', route => { if (route.request().method() !== 'POST') route.fallback(); }); // POST is never answered
    await page.locator('#w-name').fill(title);
    await page.locator('#modal-workout button[type="submit"]').click();

    await expect(page.locator('#modal-workout')).toBeHidden({ timeout: 20000 });
    expect(await queueLength(page)).toBe(1);
    await expect(workouts(page, title)).toBeVisible();
    expect(await dbWorkouts(title)).toHaveLength(0);

    await page.unroute('**/rest/v1/antrenmanlar*');
    await context.setOffline(true);
    await context.setOffline(false); // fires "online": the queue is sent
    await expect.poll(() => queueLength(page), { timeout: 20000 }).toBe(0);
    await expect.poll(async () => (await dbWorkouts(title)).length, { timeout: 15000 }).toBe(1);
  });

  // Saves one workout offline, then moves it from the queue to the failed list the way the data service does after five
  // refusals (seeding is faster than five flushes), and announces it.
  const failOneWorkout = async (page, context, title) => {
    const card = page.locator('.member-card', { hasText: names.member });
    if (await card.isVisible()) await card.click(); // already on the profile on the second call
    await page.locator('#btn-tab-workouts').click();
    await context.setOffline(true);
    await page.getByRole('button', { name: /Yeni Antrenman/ }).click();
    await page.locator('#w-name').fill(title);
    await page.locator('#modal-workout button[type="submit"]').click();
    await expect(page.locator('#sync-pending-button')).toHaveText('1', { timeout: 10000 });
    await page.evaluate(() => {
      const [item] = JSON.parse(localStorage.getItem('trainerpro_sync_queue'));
      const failed = { ...item, status: 'failed', lastError: 'permission denied for table antrenmanlar' };
      localStorage.setItem('trainerpro_sync_queue', '[]');
      localStorage.setItem('trainerpro_sync_failed', JSON.stringify([failed]));
      window.dispatchEvent(new CustomEvent('trainerpro-sync-failed', { detail: { failed: [failed] } }));
    });
  };

  test('the pending button and list: waiting item, then empty after reconnect', async ({ page, context }) => {
    const title = `E2E Liste ${stamp}`;
    await start(page);
    await page.locator('.member-card', { hasText: names.member }).click();
    await page.locator('#btn-tab-workouts').click();
    await expect(page.locator('#sync-pending-button')).toBeHidden();
    await context.setOffline(true);
    await page.getByRole('button', { name: /Yeni Antrenman/ }).click();
    await page.locator('#w-name').fill(title);
    await page.locator('#modal-workout button[type="submit"]').click();
    const button = page.locator('#sync-pending-button');
    await expect(button).toHaveText('1', { timeout: 10000 });
    await expect(button).toHaveAttribute('aria-label', 'Bekleyen değişiklikler (1)');
    await button.click();
    await expect(page.locator('#modal-sync h2')).toHaveText('Bekleyen değişiklikler');
    await expect(page.locator('#sync-list')).toContainText('Gönderilmeyi bekleyenler');
    await expect(page.locator('#sync-list .sync-row')).toHaveText(/^Antrenman · Kayıt · \d{2}\D\d{2} \d{2}:\d{2}$/);
    await context.setOffline(false);
    await expect(button).toBeHidden({ timeout: 20000 });
    await expect(page.locator('#sync-list')).toHaveText('Bekleyen değişiklik yok.');
    await expect.poll(async () => (await dbWorkouts(title)).length, { timeout: 15000 }).toBe(1);
  });

  test('a failed change: toast, count, reason, retry sends it, delete sends nothing', async ({ page, context }) => {
    const retryTitle = `E2E Tekrar ${stamp}`;
    const deleteTitle = `E2E Sil ${stamp}`;
    await start(page);
    await failOneWorkout(page, context, retryTitle);
    await expect(page.locator('#toast-region')).toContainText('Bir değişiklik kaydedilemedi. Ayrıntılar için bekleyen değişiklikler listesine bakın.');
    await expect(page.locator('#sync-pending-button')).toHaveText('1');
    await page.locator('#sync-pending-button').click();
    await expect(page.locator('#sync-list')).toContainText('Kaydedilemeyenler');
    await expect(page.locator('#sync-list .sync-row')).toContainText('Antrenman · Kayıt');
    await expect(page.locator('#sync-list .sync-row')).toContainText('Bu işlem için yetkiniz yok.');
    await expect(page.locator('#sync-list')).not.toContainText('permission denied');
    await context.setOffline(false);
    await page.getByRole('button', { name: 'Tekrar dene' }).click();
    await expect.poll(async () => (await dbWorkouts(retryTitle)).length, { timeout: 15000 }).toBe(1);
    await expect(page.locator('#sync-list')).toHaveText('Bekleyen değişiklik yok.');
    await expect(page.locator('#sync-pending-button')).toBeHidden();

    await page.locator('#modal-sync .close').click();
    await failOneWorkout(page, context, deleteTitle);
    await context.setOffline(false);
    await page.locator('#sync-pending-button').click();
    await page.locator('#sync-list').getByRole('button', { name: 'Sil', exact: true }).click(); // the dialog handler in start() accepts the confirm
    await expect(page.locator('#sync-list')).toHaveText('Bekleyen değişiklik yok.');
    await expect(page.locator('#sync-pending-button')).toBeHidden();
    await page.waitForTimeout(2000);
    expect(await queueLength(page)).toBe(0);
    expect(await dbWorkouts(deleteTitle)).toHaveLength(0);
  });

  test('the login-expired toast is an alert', async ({ page }) => {
    await start(page);
    await page.evaluate(() => window.dispatchEvent(new Event('trainerpro-sync-auth')));
    const toast = page.locator('#toast-region [role="alert"]', { hasText: 'Oturum süresi doldu. Değişiklikleriniz cihazda bekliyor; lütfen tekrar giriş yapın.' });
    await expect(toast).toBeVisible();
  });
});

// The button must not cover the logo bar, the search bar or the client header (phone only).
test.describe('pending button layout (phone)', () => {
  test.beforeEach(({}, info) => test.skip(!info.project.name.startsWith('phone'), 'phone layout only'));
  // The session can be written a moment after the screen shows (CI flake 2026-11-13): wait for a stored user first.
  const seedFailed = async page => {
    const userId = await (await page.waitForFunction(() => Object.keys(localStorage)
      .filter(k => k.endsWith('-auth-token'))
      .map(k => JSON.parse(localStorage.getItem(k) || 'null')?.user?.id)
      .find(Boolean), null, { timeout: 15000 })).jsonValue();
    await page.evaluate(userId => {
      const failed = { queueId: 'layout-1', table: 'antrenmanlar', operation: 'upsert', createdAt: Date.now(), userId, status: 'failed', lastError: 'permission denied' };
      localStorage.setItem('trainerpro_sync_failed', JSON.stringify([failed]));
      window.dispatchEvent(new CustomEvent('trainerpro-sync-failed', { detail: { failed: [failed] } }));
    }, userId);
  };
  const apart = (a, b) => a.y + a.height <= b.y + 1 || b.y + b.height <= a.y + 1 || a.x + a.width <= b.x + 1 || b.x + b.width <= a.x + 1;
  for (const [role, email, password, covered, shot] of [
    ['admin', env.adminEmail, env.adminPassword, ['.mobile-brand', '.global-search-bar', '.fab'], 'trainer'],
    ['user', env.clientEmail, env.clientPassword, ['.member-portal-header'], 'client']
  ]) for (const notch of [0, 47, 59]) { // Chromium reports a notch of 0: simulate it as mobile-nav.spec.js does
    test(`${shot}: the button is at least 44 px and covers nothing (notch ${notch}px)`, async ({ page }, info) => {
      await page.route('**/style.css*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace(/env\(safe-area-inset-top\)/g, `${notch}px`) });
      });
      await login(page, role, email, password);
      await expect(page.locator(role === 'admin' ? '#app-wrapper' : '#member-portal')).toBeVisible({ timeout: 20000 });
      await page.waitForTimeout(1200);
      await seedFailed(page);
      const button = page.locator('#sync-pending-button');
      await expect(button).toBeVisible();
      const box = await button.boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      for (const selector of covered) expect(apart(box, await page.locator(selector).boundingBox()), selector).toBe(true);
      if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/${shot}-${info.project.name}-${notch}.png` });
      await page.evaluate(() => localStorage.removeItem('trainerpro_sync_failed'));
    });
  }

  // The button sits under modals and above the page: an open modal must stay fully clickable.
  const loginSeeded = async (page, role, email, password, ready) => {
    await login(page, role, email, password);
    await expect(page.locator(ready)).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(1200);
    await seedFailed(page);
    await expect(page.locator('#sync-pending-button')).toBeVisible();
    await expect(page.locator('#toast-region .toast')).toHaveCount(0, { timeout: 20000 }); // the failure toast floats over the button for a while
  };
  const topAtButton = (page, inside) => page.evaluate(selector => {
    const r = document.getElementById('sync-pending-button').getBoundingClientRect();
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return !!top && !!top.closest(selector);
  }, inside);

  test.describe('modal and portal', () => {
    test.describe.configure({ mode: 'serial' });
    let admin, memberId;
    const name = `E2E Katman ${stamp}`;
    test.beforeAll(async () => {
      admin = await signIn(env.adminEmail, env.adminPassword);
      [{ id: memberId }] = await rest(admin, 'POST', 'uyeler', { ad_soyad: name, trainer_id: 'burak-ozcan', kayit_tarihi: today() });
      await rest(admin, 'POST', 'olcumler', { id: stamp + 6, member_id: memberId, tarih: today(), weight: 80 });
    });
    test.afterAll(async () => { if (memberId) await rest(admin, 'DELETE', `uyeler?id=eq.${memberId}`).catch(() => {}); });

    test('trainer: the button is on top without a modal and under the workout modal', async ({ page }) => {
      await loginSeeded(page, 'admin', env.adminEmail, env.adminPassword, '#app-wrapper');
      await page.locator('.member-card', { hasText: name }).click();
      await page.locator('#btn-tab-workouts').click();
      expect(await topAtButton(page, '#sync-pending-button')).toBe(true);
      await page.getByRole('button', { name: /Yeni Antrenman/ }).click();
      await expect(page.locator('#modal-workout')).toBeVisible();
      expect(await topAtButton(page, '#modal-workout')).toBe(true);
      await page.getByRole('button', { name: '+ Egzersiz Ekle' }).click({ trial: true });
      await page.locator('#modal-workout button[type="submit"]').click({ trial: true });
    });

    test('client: Belgeler and the last control can be clicked with the button shown', async ({ page }) => {
      await loginSeeded(page, 'user', env.clientEmail, env.clientPassword, '#member-portal');
      await page.getByRole('button', { name: 'Belgeler', exact: true }).click({ trial: true });
      await page.locator('#member-portal :is(button, a, input, select, textarea):visible').last().click({ trial: true });
    });
  });
});

// The client portal: a tick or an answer made offline shows at once, the portal opens from its cache without a connection,
// and a client is never sent through the trainer's loader.
test.describe('offline core (client portal)', () => {
  test.describe.configure({ mode: 'serial' });
  let admin, memberId, workoutId, scheduleId;
  const names = { squat: `E2E Kalkış ${stamp}`, row: `E2E Çekiş ${stamp}` };
  const weekday = () => new Date().getDay() || 7;

  test.beforeAll(async () => {
    admin = await signIn(env.adminEmail, env.adminPassword);
    [{ id: memberId }] = await rest(admin, 'GET', `uyeler?select=id&email=eq.${encodeURIComponent(env.clientEmail)}`);
    [{ id: workoutId }] = await rest(admin, 'POST', 'antrenmanlar', {
      id: stamp + 20, member_id: memberId, tarih: today(), sablon: `E2E Portal ${stamp}`,
      setler: [{ ad: names.squat, tekrar: 10, set: 3 }, { ad: names.row, tekrar: 8, set: 3 }]
    });
    [{ id: scheduleId }] = await rest(admin, 'POST', 'weekly_program_schedule', {
      id: stamp + 21, member_id: memberId, day_of_week: weekday(), start_time: '09:30:00', end_time: '10:30:00', branch: 'Fitness'
    });
  });

  test.afterAll(async () => { // completions and attendance cascade with the workout and the schedule
    await rest(admin, 'DELETE', `antrenmanlar?id=eq.${workoutId}`).catch(() => {});
    await rest(admin, 'DELETE', `weekly_program_schedule?id=eq.${scheduleId}`).catch(() => {});
  });

  const start = async page => {
    page.on('dialog', dialog => dialog.accept());
    await login(page, 'user', env.clientEmail, env.clientPassword);
    await expect(page.getByText('Hoş geldiniz')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('#member-portal-status')).toHaveText('Salt okunur danışan paneli', { timeout: 20000 });
  };
  const freshLoad = page => page.evaluate(() => {
    document.getElementById('member-portal-content').replaceChildren();
    window.dispatchEvent(new CustomEvent('trainerpro-sync-queue', { detail: { pending: 0 } }));
  });
  const dbCompletions = () => rest(admin, 'GET', `workout_completions?select=completed&member_id=eq.${memberId}&workout_id=eq.${workoutId}&exercise_index=eq.0`);

  test('a tick made offline shows at once, unticking undoes it, and the last choice is sent on reconnect (trainer-only tables never read)', async ({ page, context }) => {
    const requested = [];
    page.on('request', request => requested.push(request.url()));
    await start(page);
    await page.locator('[data-portal-tab="workouts"]').click();
    const squat = page.locator('.member-exercise-item', { hasText: names.squat });
    await expect(squat.getByRole('button')).toHaveText('Tamamla');

    await context.setOffline(true);
    await squat.getByRole('button').click();
    await expect(squat.getByRole('button')).toHaveText('Tamamlandı ✓', { timeout: 3000 });
    await expect(page.locator('#sync-pending-button')).toHaveText('1');
    await expect(page.locator('#toast-region')).toContainText('Bağlantı yok. Değişiklik cihazda bekliyor');

    await squat.getByRole('button').click(); // untick
    await expect(squat.getByRole('button')).toHaveText('Tamamla', { timeout: 3000 });
    await expect(page.locator('#sync-pending-button')).toHaveText('2');
    const queue = await page.evaluate(() => JSON.parse(localStorage.getItem('trainerpro_sync_queue')));
    expect(queue.map(item => item.payload.completed)).toEqual([true, false]);

    requested.length = 0;
    await context.setOffline(false);
    await expect.poll(() => queueLength(page), { timeout: 20000 }).toBe(0);
    await expect.poll(dbCompletions, { timeout: 15000 }).toEqual([{ completed: false }]);
    await expect(squat.getByRole('button')).toHaveText('Tamamla');
    await expect(page.locator('#sync-pending-button')).toBeHidden();
    expect(requested.filter(url => /\/rest\/v1\/(programlar|master_besinler)/.test(url))).toEqual([]);
    expect(requested.some(url => url.includes('/rest/v1/antrenmanlar'))).toBe(true); // the portal reloaded once the queue was sent
  });

  test('a session answered offline shows at once and is saved on reconnect', async ({ page, context }) => {
    await start(page);
    await page.locator('[data-portal-tab="schedule"]').click();
    const session = page.locator('.member-calendar-session', { hasText: '09:30' });
    await expect(session.getByRole('button')).toHaveText('Katılacağım');
    await context.setOffline(true);
    await session.getByRole('button').click();
    await expect(session.getByRole('button')).toHaveText('Katılacağım ✓', { timeout: 3000 });
    await expect(page.locator('#sync-pending-button')).toHaveText('1');
    await context.setOffline(false);
    await expect.poll(() => queueLength(page), { timeout: 20000 }).toBe(0);
    await expect.poll(async () => (await rest(admin, 'GET', `schedule_attendance?select=status&member_id=eq.${memberId}&schedule_id=eq.${scheduleId}`)).map(row => row.status), { timeout: 15000 }).toEqual(['attending']);
    await expect(session.getByRole('button')).toHaveText('Katılacağım ✓');
  });

  test('a tick made offline after the token expired shows at once, belongs to this client and is sent once on reconnect', async ({ page, context }) => {
    test.setTimeout(120000);
    await start(page);
    await page.locator('[data-portal-tab="workouts"]').click();
    const row = page.locator('.member-exercise-item', { hasText: names.row });
    await expect(row.getByRole('button')).toHaveText('Tamamla');
    const userId = await expireSavedToken(page);
    await context.setOffline(true);
    await row.getByRole('button').click();
    await expect(row.getByRole('button')).toHaveText('Tamamlandı ✓', { timeout: 10000 });
    expect(await queuedOwners(page)).toEqual([userId]);
    await expect(page.locator('#sync-pending-button')).toHaveText('1');

    await context.setOffline(false);
    await expect.poll(() => queueLength(page), { timeout: 40000 }).toBe(0);
    await expect.poll(async () => (await rest(admin, 'GET', `workout_completions?select=completed&member_id=eq.${memberId}&workout_id=eq.${workoutId}&exercise_index=eq.1`)), { timeout: 15000 }).toEqual([{ completed: true }]);
    expect(await page.evaluate(() => localStorage.getItem('trainerpro_sync_failed'))).toBeNull();
  });

  test('the portal loader opens the cache at once when the token expired offline (no wait for the login check)', async ({ page, context }) => {
    await start(page);
    await expireSavedToken(page);
    await context.setOffline(true);
    // The queue-event handler only reloads while online and the loader then checks the flag again: the first read says online, later reads offline.
    await page.evaluate(() => {
      let reads = 0;
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => reads++ === 0 });
      window.dispatchEvent(new CustomEvent('trainerpro-sync-queue', { detail: { pending: 0 } }));
    });
    await expect(page.locator('#member-portal-status')).toContainText('Çevrimdışı · Son güncelleme:', { timeout: 8000 }); // without the fix the login check alone takes about 25 s
  });

  test('a fresh start without connection shows the cached portal, and says so without a cache', async ({ page }) => {
    await start(page);
    const cache = await page.evaluate(() => JSON.parse(localStorage.getItem('trainerpro_cache')));
    expect(cache.role).toBe('member');
    expect(cache.portal.member.id).toBe(memberId);

    // A real offline reload cannot work before the service-worker milestone (the page needs the network to open),
    // so: every read fails, the portal is emptied, and the app's own queue-event path runs the portal loader again.
    await page.route('**/rest/v1/**', route => route.abort());
    await freshLoad(page);
    await expect(page.locator('#member-portal-status')).toContainText('Çevrimdışı · Son güncelleme:', { timeout: 20000 });
    await page.locator('[data-portal-tab="workouts"]').click();
    await expect(page.locator('.member-exercise-item', { hasText: names.squat })).toBeVisible();
    await page.locator('[data-portal-tab="schedule"]').click();
    await expect(page.locator('.member-calendar-session', { hasText: '09:30' })).toBeVisible();

    await page.evaluate(() => localStorage.removeItem('trainerpro_cache'));
    await freshLoad(page);
    await expect(page.locator('#member-portal-status')).toHaveText('Bağlantı yok ve bu cihazda kayıtlı veri bulunmuyor.', { timeout: 20000 });
    await expect(page.locator('.member-exercise-item')).toHaveCount(0);
  });
});
