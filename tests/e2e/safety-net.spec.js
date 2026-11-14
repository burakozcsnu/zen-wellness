// Logout safety net: unsent changes are announced, and personal data leaves the device on logout.
const { test, expect, login } = require('./fixtures');
const { env, signIn, rest } = require('../helpers/api');

const stamp = Date.now();
const foodId = stamp + 3;
const foodName = `E2E Besin ${stamp}`;
const stored = (page, key) => page.evaluate(k => localStorage.getItem(k), key);
const queueLength = page => page.evaluate(() => JSON.parse(localStorage.getItem('trainerpro_sync_queue') || '[]').length);

test.describe('logout safety net', () => {
  let admin;

  test.beforeAll(async () => {
    admin = await signIn(env.adminEmail, env.adminPassword);
    await rest(admin, 'POST', 'master_besinler', { id: foodId, ad: foodName, tip: 'Yemek', porsiyon: '100 g', kalori: 100, protein: 10, karbonhidrat: 10, yag: 1 });
  });

  test.afterAll(async () => {
    await rest(admin, 'DELETE', `master_besinler?id=eq.${foodId}`).catch(() => {});
  });

  const openNutrition = async page => {
    await login(page, 'admin', env.adminEmail, env.adminPassword);
    await expect(page.locator('.member-card').first().or(page.locator('#members-view'))).toBeVisible({ timeout: 20000 });
    const toggle = page.locator('.mobile-logo');
    if (await toggle.isVisible() && (await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    await page.locator('#btn-nutrition').click();
  };
  const clickLogout = async page => {
    const toggle = page.locator('.mobile-logo');
    if (await toggle.isVisible() && (await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    await page.getByRole('button', { name: /Çıkış Yap/ }).first().click();
  };

  test('unsent change: cancelling keeps the session and queue, confirming removes personal data; nothing pending logs out silently', async ({ page }) => {
    const dialogs = [];
    let accept = false;
    page.on('dialog', dialog => { dialogs.push(dialog.message()); return accept ? dialog.accept() : dialog.dismiss(); });
    await openNutrition(page);
    // Writes to the food table fail like a lost connection, so the edit is queued while login and logout still work.
    await page.route('**/rest/v1/master_besinler*', route => route.request().method() === 'GET' ? route.fallback() : route.abort('connectionfailed'));
    await expect(async () => {
      const card = page.locator('.card', { hasText: foodName });
      if (!(await card.isVisible())) await page.locator('.acc-header', { hasText: /^\s*Yemek/ }).click();
      await card.locator('.btn-edit').click({ timeout: 2000 });
    }).toPass({ timeout: 20000 });
    await page.locator('#new-f-cal').fill('321');
    await page.locator('#modal-new-food button[type="submit"]').click();
    await expect.poll(() => queueLength(page), { timeout: 10000 }).toBe(1);

    // Cancel: stays logged in, queue untouched.
    await clickLogout(page);
    await expect.poll(() => dialogs.length).toBe(1);
    expect(dialogs[0]).toBe('Gönderilmemiş 1 değişiklik var. Çıkış yaparsanız bu değişiklikler silinir. Yine de çıkış yapılsın mı?');
    await expect(page.locator('#btn-nutrition')).toBeAttached();
    expect(await queueLength(page)).toBe(1);

    // Confirm: logged out, nothing personal left behind.
    accept = true;
    await clickLogout(page);
    await expect(page.locator('#brand-splash')).toBeVisible({ timeout: 20000 });
    for (const key of ['trainerpro_sync_queue', 'trainerpro_sync_failed', 'trainerpro_cache']) {
      expect(await stored(page, key), key).toBeNull();
    }

    // Nothing pending: no dialog at all.
    dialogs.length = 0;
    await login(page, 'admin', env.adminEmail, env.adminPassword);
    await expect(page.locator('.member-card').first().or(page.locator('#members-view'))).toBeVisible({ timeout: 20000 });
    await clickLogout(page);
    await expect(page.locator('#brand-splash')).toBeVisible({ timeout: 20000 });
    expect(dialogs).toEqual([]);
  });

  test('logout with no connection still logs out on this device and removes personal data', async ({ page, context }) => {
    page.on('dialog', dialog => dialog.accept());
    await openNutrition(page);
    const sessionKey = await page.evaluate(() => Object.keys(localStorage).find(k => /^sb-.*-auth-token$/.test(k)));
    expect(sessionKey).toBeTruthy();
    await context.setOffline(true);
    await expect(async () => {
      const card = page.locator('.card', { hasText: foodName });
      if (!(await card.isVisible())) await page.locator('.acc-header', { hasText: /^\s*Yemek/ }).click();
      await card.locator('.btn-edit').click({ timeout: 2000 });
    }).toPass({ timeout: 20000 });
    await page.locator('#new-f-cal').fill('322');
    await page.locator('#modal-new-food button[type="submit"]').click();
    await expect.poll(() => queueLength(page), { timeout: 10000 }).toBe(1);

    // The server call fails, so the app removes the session locally and reloads (an offline reload shows the browser's error page).
    const reloaded = page.waitForEvent('framenavigated');
    await clickLogout(page);
    await reloaded;
    await context.setOffline(false);
    await page.goto('/');
    await expect(page.locator('#brand-splash')).toBeVisible({ timeout: 20000 });
    await page.locator('.brand-splash-logo').click({ force: true });
    await page.locator('.portal-role-admin').click();
    await expect(page.locator('#modal-auth')).toBeVisible(); // asks for the password again: no session left
    for (const key of ['trainerpro_sync_queue', 'trainerpro_sync_failed', 'trainerpro_cache', sessionKey]) {
      expect(await stored(page, key), key).toBeNull();
    }
  });
});

const ERROR_TOAST = 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.';

test.describe('visible errors', () => {
  test('an uncaught error shows the Turkish toast and it goes away', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => setTimeout(() => { throw new Error('itest boom'); }));
    const toast = page.locator('#toast-region .toast-error');
    await expect(toast).toHaveText(ERROR_TOAST);
    await expect(toast).toHaveAttribute('role', 'alert');
    await expect(toast).toBeHidden({ timeout: 9000 });
  });

  test('an unhandled rejection shows the Turkish toast', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => { Promise.reject(new Error('itest rejected')); });
    const toast = page.locator('#toast-region .toast-error');
    await expect(toast).toHaveText(ERROR_TOAST);
    await expect(toast).toHaveAttribute('role', 'alert');
    await expect(toast).toBeHidden({ timeout: 9000 });
  });

  test('at most three toasts are shown and a duplicate is shown once', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => { ['a', 'b', 'c', 'd'].forEach(m => window.showToast(m)); });
    await expect(page.locator('#toast-region .toast')).toHaveText(['b', 'c', 'd']);
    await page.evaluate(() => { window.showToast('d'); window.showToast('d', 'success'); });
    await expect(page.locator('#toast-region .toast', { hasText: /^d$/ })).toHaveCount(1);
    await page.locator('#toast-region .toast').first().click(); // a tap removes it at once
    await expect(page.locator('#toast-region .toast')).toHaveCount(2);
  });
});

test.describe('version tag', () => {
  test('shows the real app version', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#version-tag')).toHaveText('v1.3.128 - Zen Wellness Club');
  });
});

test.describe('chart point colours', () => {
  const BASE = '#e4ba94', BETTER = '#35d07f', WORSE = '#ff5b67';
  let admin, memberId;
  const day = offset => { const d = new Date(); d.setDate(d.getDate() - offset); return d.toLocaleDateString('en-CA'); };

  test.beforeAll(async () => {
    admin = await signIn(env.adminEmail, env.adminPassword);
    [{ id: memberId }] = await rest(admin, 'POST', 'uyeler', { ad_soyad: `E2E Grafik ${stamp}`, boy: 170, brans: 'Fitness', trainer_id: 'burak-ozcan', kayit_tarihi: '2026-01-15' });
    // fat 20 -> 18 (down) -> 19 (up); weight 80 -> 78 -> 79
    const rows = [[90, 20, 80], [60, 18, 78], [0, 19, 79]].map(([ago, fat, weight]) => ({ member_id: memberId, tarih: day(ago), fat, weight }));
    await rest(admin, 'POST', 'olcumler', rows);
  });

  test.afterAll(async () => {
    if (memberId) await rest(admin, 'DELETE', `uyeler?id=eq.${memberId}`).catch(() => {});
  });

  const colours = async (page, metric) => {
    await page.locator('#chart-sub-cat').selectOption(metric);
    return page.evaluate(() => Chart.getChart(document.getElementById('mainChart')).data.datasets[0].pointBackgroundColor);
  };

  test('green means better: body fat down is green, up is red; weight has no direction', async ({ page }) => {
    await login(page, 'admin', env.adminEmail, env.adminPassword);
    await page.locator('.member-card', { hasText: `E2E Grafik ${stamp}` }).click({ timeout: 20000 });
    await page.locator('#chart-cat').selectOption('olcum');
    expect(await colours(page, 'fat')).toEqual([BASE, BETTER, WORSE]);
    expect(await colours(page, 'weight')).toEqual([BASE, BASE, BASE]);
  });

  test('exercise weight up is green, down is red; a set without weight makes no point and is skipped in the comparison', async ({ page }) => {
    const ids = [1, 2, 3, 4, 5].map(n => stamp + 100 + n);
    // 50 -> 60 -> (no weight) -> 55: the empty set must not become a 0 point
    const rows = [[50, 90], [60, 60], [null, 30], [55, 0]].map(([weight, ago], i) => ({
      id: ids[i], member_id: memberId, tarih: day(ago), sablon: 'E2E Grafik',
      setler: [{ ad: 'E2E Grafik Hareket', reps: 8, ...(weight === null ? {} : { weight }) }]
    }));
    await rest(admin, 'POST', 'antrenmanlar', rows);
    try {
      await login(page, 'admin', env.adminEmail, env.adminPassword);
      await page.locator('.member-card', { hasText: `E2E Grafik ${stamp}` }).click({ timeout: 20000 });
      await page.locator('#chart-cat').selectOption('antrenman');
      await page.locator('#chart-sub-cat').selectOption('E2E Grafik Hareket');
      const chart = await page.evaluate(() => {
        const dataset = Chart.getChart(document.getElementById('mainChart')).data.datasets[0];
        return { data: dataset.data, colours: dataset.pointBackgroundColor };
      });
      expect(chart.data).toEqual([50, 60, null, 55]);
      expect(chart.colours).toEqual([BASE, BETTER, BASE, WORSE]);
    } finally {
      await rest(admin, 'DELETE', `antrenmanlar?id=in.(${ids.join(',')})`).catch(() => {});
    }
  });
});

test.describe('toast and add button', () => {
  test('on a phone a toast does not cover the add button', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'phone layout only');
    await login(page, 'admin', env.adminEmail, env.adminPassword);
    await expect(page.locator('.fab')).toBeVisible({ timeout: 20000 });
    await page.evaluate(() => window.showToast('E2E toast'));
    const toast = page.locator('#toast-region .toast');
    await expect(toast).toBeVisible();
    const [fab, toastBox] = [await page.locator('.fab').boundingBox(), await toast.boundingBox()];
    expect(toastBox.y + toastBox.height).toBeLessThanOrEqual(fab.y);
  });
});

test.describe('logout with a pending write', () => {
  test('a client who logs out with an unsent change gets no console error and no 401', async ({ page }) => {
    const admin = await signIn(env.adminEmail, env.adminPassword);
    const [{ id: memberId }] = await rest(admin, 'GET', `uyeler?select=id&email=eq.${encodeURIComponent(env.clientEmail)}`);
    const workoutId = stamp + 200;
    await rest(admin, 'POST', 'antrenmanlar', { id: workoutId, member_id: memberId, tarih: new Date().toLocaleDateString('en-CA'), sablon: 'E2E Cikis', setler: [{ ad: 'E2E Cikis Hareket', tekrar: 10, set: 3 }] });
    try {
      const bad = [];
      page.on('console', message => { if (message.type() === 'error') bad.push(`console: ${message.text()}`); });
      page.on('response', response => { if (response.status() === 401) bad.push(`401: ${response.url()}`); });
      page.on('dialog', dialog => dialog.accept());
      await login(page, 'user', env.clientEmail, env.clientPassword);
      await expect(page.getByText('Hoş geldiniz')).toBeVisible({ timeout: 20000 });
      await page.locator('[data-portal-tab="workouts"]').click({ timeout: 20000 });
      const item = page.locator('.member-exercise-item', { hasText: 'E2E Cikis Hareket' });
      await expect(item).toBeVisible();
      // The write fails like a lost connection, so it stays queued.
      await page.route('**/rest/v1/workout_completions*', route => route.request().method() === 'GET' ? route.fallback() : route.abort('connectionfailed'));
      await item.getByRole('button').click();
      await expect.poll(() => queueLength(page), { timeout: 10000 }).toBe(1);
      bad.length = 0; // only what happens from the logout on counts
      await page.getByRole('button', { name: /Çıkış Yap/ }).first().click();
      await expect(page.locator('#brand-splash')).toBeVisible({ timeout: 20000 });
      await page.waitForTimeout(3000);
      expect(bad.filter(b => !b.includes('connectionfailed') && !b.includes('Failed to load resource: net::ERR'))).toEqual([]);
    } finally {
      await rest(admin, 'DELETE', `antrenmanlar?id=eq.${workoutId}`).catch(() => {});
    }
  });
});
