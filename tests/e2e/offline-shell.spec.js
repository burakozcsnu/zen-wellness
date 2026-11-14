// The app opens with no signal: the service worker's shell cache, the last device copy, and the kill switch.
const fs = require('fs');
const { test, expect, login } = require('./fixtures');
const { env } = require('../helpers/api');
const { startAppServer } = require('../helpers/app-server');

const appVersion = fs.readFileSync('script.js', 'utf8').match(/APP_VERSION = '([^']+)'/)[1];
const killSwitch = fs.readFileSync('docs/service-worker.md', 'utf8').match(/```js\n([\s\S]*?)```/)[1];

// Waits until the worker controls this page (the shell is cached by then).
const controlled = page => page.waitForFunction(() => navigator.serviceWorker.ready.then(() => !!navigator.serviceWorker.controller));
const cacheUrls = page => page.evaluate(async () => {
  const urls = [];
  for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) urls.push(request.url);
  return urls;
});
// The app always starts on the splash; the saved session is picked up when the role button is tapped.
const reopen = async (page, role) => {
  await page.reload();
  await page.locator('.brand-splash-logo').click({ force: true });
  await page.locator(role === 'admin' ? '.portal-role-admin' : '.portal-role:not(.portal-role-admin)').click();
};
const loginScreen = page => expect(page.locator('.brand-splash-logo')).toBeVisible({ timeout: 20000 });

test.describe('opens without signal', () => {
  test('the shell is cached under one versioned name, same-origin only, and a reload offline shows the login screen', async ({ page, context }) => {
    await page.goto('/');
    await controlled(page);
    expect(await page.evaluate(() => caches.keys())).toEqual([`zen-shell-${appVersion}`]);
    const origin = new URL(page.url()).origin;
    const urls = await cacheUrls(page);
    expect(urls.length).toBeGreaterThan(5);
    expect(urls.filter(url => !url.startsWith(origin + '/'))).toEqual([]);
    expect(urls.some(url => url.endsWith('/sw.js'))).toBe(false);
    await context.setOffline(true);
    await page.reload();
    await loginScreen(page);
  });

  test('trainer: an offline reload shows the member list from the device copy', async ({ page, context }) => {
    await login(page, 'admin', env.adminEmail, env.adminPassword);
    await expect(page.locator('.member-card').first()).toBeVisible({ timeout: 20000 });
    await controlled(page);
    await context.setOffline(true);
    await reopen(page, 'admin');
    await expect(page.locator('.member-card').first()).toBeVisible({ timeout: 20000 });
    await expect(page.locator('#sync-status')).toContainText('Çevrimdışı');
  });

  test('client: an offline reload shows the portal', async ({ page, context }) => {
    await login(page, 'user', env.clientEmail, env.clientPassword);
    await expect(page.getByText('Hoş geldiniz')).toBeVisible({ timeout: 20000 });
    await controlled(page);
    await context.setOffline(true);
    await reopen(page, 'user');
    await expect(page.getByText('Hoş geldiniz')).toBeVisible({ timeout: 20000 });
  });

  test('a logout made offline, then a reload, shows the login screen', async ({ page, context }) => {
    page.on('dialog', dialog => dialog.accept());
    await login(page, 'admin', env.adminEmail, env.adminPassword);
    await expect(page.locator('.member-card').first()).toBeVisible({ timeout: 20000 });
    await controlled(page);
    await context.setOffline(true);
    await page.evaluate(() => window.handleAdminLogout());
    await loginScreen(page); // the app reloads itself after a failed sign-out
  });

  test('kill switch: the doc code deletes the caches, removes the worker and the app still works online', async ({ page }) => {
    let swapped = false;
    const server = await startAppServer(() => swapped ? killSwitch : null);
    try {
      await page.goto(server.url);
      await controlled(page);
      swapped = true;
      await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
      await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), { timeout: 20000 }).toBe(0);
      await expect.poll(() => page.evaluate(() => caches.keys()), { timeout: 20000 }).toEqual([]);
      await loginScreen(page); // the page was reloaded by the kill switch and works without a worker
      expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(false);
    } finally {
      server.close();
    }
  });
});
