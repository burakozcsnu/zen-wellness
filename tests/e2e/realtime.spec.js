// Live sync between two open sessions: a change made in one window shows up in the other without a reload.
const { test, expect, login, attachTestProject } = require('./fixtures');
const { env: testEnv, signIn, rest } = require('../helpers/api');

test('a client added in one trainer window appears in the other, and so does a rename', async ({ page, browser, env, problems }) => {
  page.on('dialog', dialog => dialog.accept());
  const name = `E2E Canlı ${Date.now()}`;
  const admin = await signIn(testEnv.adminEmail, testEnv.adminPassword);
  let memberId;

  // Window B: a second trainer session, already looking at the client list.
  const contextB = await browser.newContext({ baseURL: 'http://localhost:3111' });
  const pageB = await contextB.newPage();
  const problemsB = [];
  await attachTestProject(pageB, env, problemsB);
  await login(pageB, 'admin', env.adminEmail, env.adminPassword);
  await expect(pageB.locator('.member-card').first()).toBeVisible({ timeout: 20000 });
  await expect(pageB.locator('.member-card', { hasText: name })).toHaveCount(0);

  try {
    // Window A adds a client through the form.
    await login(page, 'admin', env.adminEmail, env.adminPassword);
    await expect(page.locator('.member-card').first()).toBeVisible({ timeout: 20000 });
    await page.locator('.fab').click();
    await page.locator('#m-name').fill(name);
    await page.locator('#m-reg-date').fill('2026-03-01');
    await page.locator('#modal-member button[type="submit"]').click();
    await expect(page.locator('.member-card', { hasText: name })).toBeVisible({ timeout: 15000 });
    [{ id: memberId }] = await rest(admin, 'GET', `uyeler?select=id&ad_soyad=eq.${encodeURIComponent(name)}`);

    // Window B was never touched: no reload, no click.
    await expect(pageB.locator('.member-card', { hasText: name })).toBeVisible({ timeout: 20000 });

    // A change that bypasses both windows (another device or the client themselves) also arrives.
    await rest(admin, 'PATCH', `uyeler?id=eq.${memberId}`, { ad_soyad: `${name} yeni ad` });
    await expect(pageB.locator('.member-card', { hasText: `${name} yeni ad` })).toBeVisible({ timeout: 20000 });
    await expect(page.locator('.member-card', { hasText: `${name} yeni ad` })).toBeVisible({ timeout: 20000 });

    // And a deletion disappears from both.
    await rest(admin, 'DELETE', `uyeler?id=eq.${memberId}`);
    memberId = null;
    await expect(pageB.locator('.member-card', { hasText: name })).toHaveCount(0, { timeout: 20000 });
    await expect(page.locator('.member-card', { hasText: name })).toHaveCount(0, { timeout: 20000 });
    expect(problems.filter(p => !p.includes('Failed to load resource'))).toEqual([]);
    expect(problemsB.filter(p => !p.includes('Failed to load resource'))).toEqual([]);
  } finally {
    if (memberId) await rest(admin, 'DELETE', `uyeler?id=eq.${memberId}`).catch(() => {});
    await contextB.close();
  }
});
