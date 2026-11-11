// Click-through wizard: logs in as each role and clicks every navigation item and tab,
// failing on any page error, console error, failed request or HTTP 5xx.
const { test, expect, login } = require('./fixtures');

test('logged-out splash loads cleanly', async ({ page, problems }) => {
  await page.goto('/');
  await expect(page.locator('#brand-splash')).toBeVisible();
  await page.locator('.brand-splash-logo').click({ force: true }); // endless breathing animation never counts as stable
  await expect(page.locator('#portal-roles')).toBeVisible();
  expect(problems).toEqual([]);
});

test('trainer: every sidebar view opens without errors', async ({ page, env, problems }) => {
  await login(page, 'admin', env.adminEmail, env.adminPassword);
  await expect(page.locator('#app-wrapper')).toBeVisible({ timeout: 15000 });
  const buttons = page.locator('.sidebar .nav-btn');
  const count = await buttons.count();
  expect(count).toBeGreaterThan(3);
  for (let i = 0; i < count; i++) {
    const button = buttons.nth(i);
    if (!(await button.isVisible())) continue;
    // On phones the sidebar is a slide-in drawer: open it first, like a real user.
    const menuToggle = page.locator('.mobile-logo');
    if (await menuToggle.isVisible() && (await menuToggle.getAttribute('aria-expanded')) !== 'true') {
      await menuToggle.click();
      await expect(page.locator('.sidebar')).toHaveClass(/mobile-open/);
      await page.waitForTimeout(300);
    }
    await button.click();
    await page.waitForTimeout(400);
  }
  expect(problems).toEqual([]);
});

test('client: every portal tab opens without errors', async ({ page, env, problems }) => {
  await login(page, 'user', env.clientEmail, env.clientPassword);
  await expect(page.locator('#member-portal')).toBeVisible({ timeout: 15000 });
  const tabs = page.locator('[data-portal-tab]');
  const count = await tabs.count();
  expect(count).toBeGreaterThan(3);
  for (let i = 0; i < count; i++) {
    await tabs.nth(i).click();
    await page.waitForTimeout(300);
  }
  expect(problems).toEqual([]);
});
