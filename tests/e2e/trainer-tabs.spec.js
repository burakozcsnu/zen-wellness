// Trainer client profile: exactly one tab looks selected, also when the monthly-measurement lock sends the trainer to "Ölçümler".
const { test, expect, login } = require('./fixtures');
const { env, signIn, rest } = require('../helpers/api');

const today = () => new Date().toLocaleDateString('en-CA');

test.describe('trainer profile tabs', () => {
  test.describe.configure({ mode: 'serial' });
  const name = `E2E Sekme ${Date.now()}`;
  let admin, memberId;

  test.beforeAll(async () => {
    admin = await signIn(env.adminEmail, env.adminPassword);
    // No measurement at all: the profile opens locked on "Ölçümler".
    [{ id: memberId }] = await rest(admin, 'POST', 'uyeler', { ad_soyad: name, brans: 'Fitness', cinsiyet: 'Erkek', trainer_id: 'burak-ozcan', kayit_tarihi: today() });
  });
  test.afterAll(async () => {
    if (memberId) await rest(admin, 'DELETE', `uyeler?id=eq.${memberId}`).catch(() => {});
  });

  // The tabs that are drawn as selected: the class and the look (outline colour) must agree on exactly one button.
  const selected = page => page.locator('#btn-tab-analytics').locator('xpath=..').locator('.tab-btn').evaluateAll(list => ({
    byClass: list.filter(b => b.classList.contains('active')).map(b => b.id),
    byLook: list.filter(b => getComputedStyle(b).borderTopColor !== 'rgba(0, 0, 0, 0)').map(b => b.id)
  }));

  test('a client without a measurement opens on Ölçümler with only that tab highlighted', async ({ page, problems }) => {
    await login(page, 'admin', env.adminEmail, env.adminPassword);
    await page.locator('.member-card', { hasText: name }).click({ timeout: 20000 });
    await expect(page.locator('#tab-measurements')).toBeVisible();
    await expect(page.locator('#btn-tab-measurements')).toHaveClass(/active/);
    // A pointer resting on another tab (on a phone: the last tap stays "hovered") must not make it look selected.
    await page.locator('#btn-tab-analytics').hover();
    await expect.poll(() => selected(page)).toEqual({ byClass: ['btn-tab-measurements'], byLook: ['btn-tab-measurements'] });
    // The lock holds: another tab is refused and the highlight stays.
    await page.locator('#btn-tab-workouts').click();
    await expect(page.locator('#tab-measurements')).toBeVisible();
    expect((await selected(page)).byClass).toEqual(['btn-tab-measurements']);
    expect(problems.filter(p => !p.includes('Failed to load resource'))).toEqual([]);
  });

  test('after the measurement exists, switching tabs moves the highlight (always one)', async ({ page }) => {
    await rest(admin, 'POST', 'olcumler', { id: Date.now(), member_id: memberId, tarih: today(), weight: 77 });
    await login(page, 'admin', env.adminEmail, env.adminPassword);
    await page.locator('.member-card', { hasText: name }).click({ timeout: 20000 });
    await expect(page.locator('#btn-tab-analytics')).toHaveClass(/active/);
    for (const id of ['workouts', 'measurements', 'nutrition', 'analytics']) {
      await page.locator(`#btn-tab-${id}`).click();
      await page.mouse.move(0, 0);
      await expect.poll(() => selected(page), { message: id }).toEqual({ byClass: [`btn-tab-${id}`], byLook: [`btn-tab-${id}`] });
    }
  });
});
