// A new release is offered with a "new version" bar instead of silently mixing old and new files.
const fs = require('fs');
const { test, expect } = require('./fixtures');
const { env, signIn, rest } = require('../helpers/api');
const { startAppServer } = require('../helpers/app-server');

const appVersion = fs.readFileSync('script.js', 'utf8').match(/APP_VERSION = '([^']+)'/)[1];
const nextVersion = `${appVersion}-next`;
// Only the cache name changes: the page on disk still asks for ?v=<appVersion> files, so the file URLs must stay.
const nextSw = fs.readFileSync('sw.js', 'utf8')
  .replace(`SHELL_VERSION = '${appVersion}'`, `SHELL_VERSION = '${nextVersion}'`)
  .replace('const V = `?v=${SHELL_VERSION}`', `const V = '?v=${appVersion}'`);
const controlled = page => page.waitForFunction(() => navigator.serviceWorker.ready.then(() => !!navigator.serviceWorker.controller));
// null while the page is navigating (the reload after Yenile).
const cacheNames = page => page.evaluate(() => caches.keys()).catch(() => null);
// The splash (z 10000) covers the bar until the app is entered, by design: enter as a visitor does, so the bar must be clickable.
const enterApp = async (page, signedIn = false) => {
  await page.locator('.brand-splash-logo').click({ force: true }); // endless breathing animation never counts as stable
  await page.locator('.portal-role-admin').click();
  if (signedIn) return expect(page.locator('#brand-splash')).toBeHidden({ timeout: 20000 });
  await page.locator('#auth-email').fill(env.adminEmail);
  await page.locator('#auth-password').fill(env.adminPassword);
  await page.locator('#modal-auth button[type="submit"]').click();
  await expect(page.locator('#brand-splash')).toBeHidden({ timeout: 20000 });
};
const checkForUpdate = page => page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });

test.describe('new version prompt', () => {
  let server, release;
  test.beforeEach(async () => {
    release = false;
    server = await startAppServer(() => release ? nextSw : null);
  });
  test.afterEach(() => server.close());

  test('a first install shows no bar', async ({ page }) => {
    release = true; // the very first worker is the new one: nothing to replace, nothing to offer
    await page.goto(server.url);
    await controlled(page);
    await page.waitForTimeout(1000);
    await expect(page.locator('#update-bar')).toHaveCount(0);
  });

  test('Sonra hides the bar until the next load; Yenile reloads once and the new worker takes over', async ({ page }) => {
    let loads = 0;
    await page.goto(server.url);
    await enterApp(page);
    await controlled(page);
    expect(await cacheNames(page)).toEqual([`zen-shell-${appVersion}`]);
    release = true;
    await checkForUpdate(page);
    const bar = page.locator('#update-bar');
    await expect(bar).toContainText('Yeni sürüm hazır.');
    for (const name of ['Yenile', 'Sonra']) {
      expect((await bar.getByRole('button', { name }).boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
    await bar.getByRole('button', { name: 'Sonra' }).click();
    await expect(bar).toHaveCount(0);

    await page.reload(); // the waiting worker is still there: the bar comes back on the next load
    await enterApp(page, true);
    await expect(bar).toBeVisible({ timeout: 10000 });
    page.on('load', () => loads++);
    await bar.getByRole('button', { name: 'Yenile' }).click();
    await expect.poll(() => cacheNames(page), { timeout: 20000 }).toEqual([`zen-shell-${nextVersion}`]);
    await expect(page.locator('#update-bar')).toHaveCount(0);
    await page.waitForTimeout(1500);
    expect(loads).toBe(1);
    expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  });

  test('Yenile in a second tab still reloads after the first tab already took the update', async ({ page, context }) => {
    await page.goto(server.url);
    await enterApp(page);
    await controlled(page);
    const other = await context.newPage();
    await other.goto(server.url);
    await enterApp(other, true);
    await controlled(other);
    release = true;
    await checkForUpdate(page);
    for (const p of [page, other]) await expect(p.locator('#update-bar')).toBeVisible({ timeout: 10000 });
    await page.locator('#update-bar').getByRole('button', { name: 'Yenile' }).click();
    await expect.poll(() => cacheNames(page), { timeout: 20000 }).toEqual([`zen-shell-${nextVersion}`]);
    // The other tab's bar is stale now (nothing waits any more): its Yenile must still load the new version.
    let loads = 0;
    other.on('load', () => loads++);
    const stale = other.locator('#update-bar');
    if (await stale.count()) await stale.getByRole('button', { name: 'Yenile' }).click();
    await expect.poll(() => loads, { timeout: 10000 }).toBe(1);
    await expect(other.locator('#update-bar')).toHaveCount(0);
  });

  test('an unsent change survives Yenile', async ({ page, context }) => {
    const stamp = Date.now();
    const title = `E2E Güncelleme ${stamp}`;
    const name = `E2E Güncelleme Üye ${stamp}`;
    const admin = await signIn(env.adminEmail, env.adminPassword);
    const [{ id: memberId }] = await rest(admin, 'POST', 'uyeler', { ad_soyad: name, trainer_id: 'burak-ozcan', kayit_tarihi: new Date().toLocaleDateString('en-CA') });
    try {
      // The app locks the other tabs until this month has a measurement.
      await rest(admin, 'POST', 'olcumler', { id: stamp + 1, member_id: memberId, tarih: new Date().toLocaleDateString('en-CA'), weight: 80 });
      await page.goto(server.url);
      await page.locator('.brand-splash-logo').click({ force: true });
      await page.locator('.portal-role-admin').click();
      await page.locator('#auth-email').fill(env.adminEmail);
      await page.locator('#auth-password').fill(env.adminPassword);
      await page.locator('#modal-auth button[type="submit"]').click();
      await expect(page.locator('.member-card', { hasText: name })).toBeVisible({ timeout: 20000 });
      await controlled(page);
      release = true;
      await checkForUpdate(page);
      await expect(page.locator('#update-bar')).toBeVisible({ timeout: 10000 });
      await page.locator('.member-card', { hasText: name }).click();
      await page.locator('#btn-tab-workouts').click();
      await expect(page.getByRole('button', { name: /Yeni Antrenman/ })).toBeVisible({ timeout: 20000 });
      await context.setOffline(true);
      await page.getByRole('button', { name: /Yeni Antrenman/ }).click();
      await page.locator('#w-name').fill(title);
      await page.locator('#modal-workout button[type="submit"]').click();
      await expect(page.locator('#sync-pending-button')).toHaveText('1', { timeout: 10000 });
      const reloaded = page.waitForEvent('load', { timeout: 20000 });
      await page.locator('#update-bar').getByRole('button', { name: 'Yenile' }).click();
      await reloaded;
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('trainerpro_sync_queue') || '[]').length)).toBe(1);
      await page.locator('.brand-splash-logo').click({ force: true });
      await page.locator('.portal-role-admin').click();
      await expect(page.locator('#sync-pending-button')).toHaveText('1', { timeout: 20000 });
    } finally {
      await rest(admin, 'DELETE', `uyeler?id=eq.${memberId}`).catch(() => {}); // cascades to the measurement
    }
  });
});
