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

test('trainer: controls that have no visible text still have a name for screen readers', async ({ page, env }) => {
  await login(page, 'admin', env.adminEmail, env.adminPassword);
  await expect(page.locator('#app-wrapper')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.fab')).toHaveAttribute('aria-label', 'Yeni kayıt ekle');
  await expect(page.locator('#global-search-keyword')).toHaveAttribute('aria-label', 'Sistemde ara');
  const unnamed = await page.locator('select[id^="filter-"]').evaluateAll(list => list.filter(el => !el.getAttribute('aria-label')).map(el => el.id));
  expect(unnamed).toEqual([]);
});

// UI/UX guard (v1.3.120): every visible control is at least 44x44 px and has a name, on every trainer view and modal.
test('trainer: controls are big enough to tap and have names, on every view and form', async ({ page, env }) => {
  await login(page, 'admin', env.adminEmail, env.adminPassword);
  await expect(page.locator('#app-wrapper')).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(1500);
  const problems = () => page.evaluate(() => {
    const shown = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const out = [];
    document.querySelectorAll('button, select, input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea').forEach(el => {
      if (!shown(el)) return;
      const r = el.getBoundingClientRect();
      const label = el.getAttribute('aria-label') || (el.id && document.querySelector(`label[for="${el.id}"]`)) || el.closest('label') || (el.tagName === 'BUTTON' && el.innerText.trim());
      const name = `${el.tagName}#${el.id}.${el.className} "${(el.innerText || '').trim().slice(0, 20)}"`;
      if (r.height < 44 || (el.tagName === 'BUTTON' && r.width < 44)) out.push(`too small ${Math.round(r.width)}x${Math.round(r.height)}: ${name}`);
      if (!label) out.push(`no name: ${name}`);
    });
    return out;
  });
  const found = [];
  for (const id of ['members', 'programs', 'nutrition', 'schedule']) {
    const toggle = page.locator('.mobile-logo');
    if (await toggle.isVisible() && (await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
    await page.locator(`#btn-${id}`).click();
    await page.waitForTimeout(700);
    found.push(...(await problems()).map(p => `${id}: ${p}`));
  }
  for (const modal of ['modal-member', 'modal-measurement', 'modal-new-food', 'modal-new-exercise', 'modal-program', 'modal-cardio']) {
    await page.evaluate(m => window.openModal(m), modal);
    await page.waitForTimeout(300);
    found.push(...(await problems()).map(p => `${modal}: ${p}`));
    await page.evaluate(m => window.closeModal(m), modal);
  }
  expect([...new Set(found)]).toEqual([]);
});
