// Page transitions: view changes go through document.startViewTransition when the browser has it and the user has not
// asked for reduced motion. The change must land exactly once either way, and with no API the app works as before.
const { test, expect, login } = require('./fixtures');
const { env } = require('../helpers/api');

// Counts startViewTransition calls and how often the app's update callback really ran.
const spy = page => page.addInitScript(() => {
  window.__vt = { calls: 0, runs: 0 };
  const original = Document.prototype.startViewTransition;
  if (!original) return;
  Document.prototype.startViewTransition = function (callback) {
    window.__vt.calls++;
    return original.call(this, (...args) => { window.__vt.runs++; return callback(...args); });
  };
});
const counts = page => page.evaluate(() => window.__vt);

const trainerFlow = async (page, problems) => {
  await login(page, 'admin', env.adminEmail, env.adminPassword);
  await expect(page.locator('.member-card').first()).toBeVisible({ timeout: 20000 });
  await page.locator('.member-card').first().click();
  await expect(page.locator('#profile-view')).toHaveClass(/active/);
  await expect(page.locator('#members-view')).not.toHaveClass(/active/);
  await page.locator('#btn-tab-measurements').click();
  await expect(page.locator('#tab-measurements')).toHaveClass(/active/);
  await expect(page.locator('#btn-tab-measurements')).toHaveClass(/active/);
  await page.locator('.btn-back').click();
  await expect(page.locator('#members-view')).toHaveClass(/active/);
  await expect(page.locator('#profile-view')).not.toHaveClass(/active/);
  expect(problems.filter(p => !p.includes('Failed to load resource'))).toEqual([]);
};

const clientFlow = async (page, problems) => {
  await login(page, 'user', env.clientEmail, env.clientPassword);
  await expect(page.getByText('Hoş geldiniz')).toBeVisible({ timeout: 20000 });
  await page.locator('[data-portal-tab="workouts"]').click();
  await expect(page.locator('[data-portal-section="workouts"]')).toBeVisible();
  await expect(page.locator('[data-portal-section="overview"]')).toBeHidden();
  await page.goBack(); // the back button returns to the previous portal tab
  await expect(page.locator('[data-portal-section="overview"]')).toBeVisible();
  expect(problems.filter(p => !p.includes('Failed to load resource'))).toEqual([]);
};

test.describe('page transitions', () => {
  test('supported: views land on the right page and every update runs exactly once', async ({ page, problems }) => {
    await spy(page);
    await trainerFlow(page, problems);
    expect(await page.evaluate(() => 'startViewTransition' in document)).toBe(true);
    const t = await counts(page);
    expect(t.calls).toBeGreaterThanOrEqual(3);
    expect(t.runs).toBe(t.calls);
  });

  // Portal tabs are deliberately not animated: with a transition, Playwright's WebKit crashed on the Ölçümler tab.
  test('supported: client portal tabs change instantly, with no transition', async ({ page, problems }) => {
    await spy(page);
    await clientFlow(page, problems);
    await page.locator('[data-portal-tab="workouts"]').dblclick();
    await expect(page.locator('[data-portal-section="workouts"]')).toBeVisible();
    expect(await counts(page)).toEqual({ calls: 0, runs: 0 });
  });

  test.describe('reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });
    test('startViewTransition is never called and the views still change', async ({ page, problems }) => {
      await spy(page);
      await trainerFlow(page, problems);
      expect((await counts(page)).calls).toBe(0);
    });
  });

  test.describe('API missing', () => {
    test('the trainer and client flows work as before', async ({ page, problems }) => {
      await page.addInitScript(() => { delete Document.prototype.startViewTransition; });
      await trainerFlow(page, problems);
      expect(await page.evaluate(() => 'startViewTransition' in document)).toBe(false);
    });
    test('client portal works as before', async ({ page, problems }) => {
      await page.addInitScript(() => { delete Document.prototype.startViewTransition; });
      await clientFlow(page, problems);
    });
  });
});
