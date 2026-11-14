// Icons load, and the iPhone "add to home screen" card shows once on an iPhone-like browser only.
const { test, expect, login } = require('./fixtures');
const { env } = require('../helpers/api');

test.use({ dismissIosHint: false });

test('manifest icons and the splash logo load', async ({ page, request }) => {
  await page.goto('/');
  const manifestUrl = new URL(await page.locator('link[rel="manifest"]').getAttribute('href'), page.url());
  const manifest = await (await request.get(manifestUrl.href)).json();
  for (const icon of manifest.icons) expect((await request.get(new URL(icon.src, manifestUrl).href)).status(), icon.src).toBe(200);
  const logo = await request.get(new URL(await page.locator('.brand-splash-logo img').getAttribute('src'), page.url()).href);
  expect(logo.status()).toBe(200);
  expect((await logo.body()).length).toBeLessThan(80 * 1024);
});

test('iPhone hint: shown after login, gone after Tamam, not again; never on desktop', async ({ page }, testInfo) => {
  await login(page, 'admin', env.adminEmail, env.adminPassword);
  const hint = page.locator('#ios-hint');
  if (testInfo.project.name === 'desktop') {
    await expect(page.locator('#brand-splash')).toBeHidden({ timeout: 20000 });
    await expect(hint).toHaveCount(0);
    return;
  }
  await expect(hint).toContainText('Uygulamayı ana ekrana ekleyin');
  const ok = hint.getByRole('button', { name: 'Tamam' });
  expect((await ok.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await ok.click();
  await expect(hint).toHaveCount(0);
  await page.reload(); // still signed in: the role button enters the app
  await page.locator('.brand-splash-logo').click({ force: true });
  await page.locator('.portal-role-admin').click();
  await expect(page.locator('#brand-splash')).toBeHidden({ timeout: 20000 });
  await expect(hint).toHaveCount(0);
});

test('no hint when the app is installed (standalone)', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true, configurable: true }));
  await login(page, 'admin', env.adminEmail, env.adminPassword);
  await expect(page.locator('#brand-splash')).toBeHidden({ timeout: 20000 });
  await expect(page.locator('#ios-hint')).toHaveCount(0);
});
