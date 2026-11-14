// The phone's back button closes the top layer (modal, session screen, portal tab, trainer page) instead of leaving the app.
const { test, expect, login } = require('./fixtures');
const { env, signIn, rest } = require('../helpers/api');

const stamp = Date.now();
const stillThere = async (page, url) => {
  expect(page.url().split('#')[0]).toBe(url);
  await expect(page.locator('body')).not.toBeEmpty();
};

test.describe('back button', () => {
  test.describe.configure({ mode: 'serial' });
  let admin, memberId, workoutId;
  const title = `E2E Geri ${stamp}`;

  test.beforeAll(async () => {
    admin = await signIn(env.adminEmail, env.adminPassword);
    [{ id: memberId }] = await rest(admin, 'GET', `uyeler?select=id&email=eq.${encodeURIComponent(env.clientEmail)}`);
    [{ id: workoutId }] = await rest(admin, 'POST', 'antrenmanlar', {
      id: stamp, member_id: memberId, tarih: '2099-12-29', sablon: title, rest_seconds: 30,
      setler: JSON.stringify([{ ad: 'E2E Squat', set_no: 1, weight: '60', reps: '8', sure: '', tip: 'Normal', tempo: '', rest_seconds: 30, rpe: null }])
    });
  });
  test.afterAll(async () => {
    await rest(admin, 'DELETE', `workout_sessions?member_id=eq.${memberId}&metadata->>workoutId=eq.${workoutId}`).catch(() => {});
    await rest(admin, 'DELETE', `antrenmanlar?id=eq.${workoutId}`).catch(() => {});
  });

  test('trainer: modal, profile, and a modal closed by its button', async ({ page, problems }) => {
    await login(page, 'admin', env.adminEmail, env.adminPassword);
    await expect(page.locator('.member-card').first()).toBeVisible({ timeout: 20000 });
    const url = page.url().split('#')[0];

    await page.locator('.fab').click();
    await expect(page.locator('#modal-member')).toBeVisible();
    await page.goBack();
    await expect(page.locator('#modal-member')).toBeHidden();
    await expect(page.locator('#members-view')).toHaveClass(/active/);
    await stillThere(page, url);

    await page.locator('.member-card').first().click();
    await expect(page.locator('#profile-view')).toHaveClass(/active/, { timeout: 20000 });
    await page.goBack();
    await expect(page.locator('#members-view')).toHaveClass(/active/);
    await expect(page.locator('.member-card').first()).toBeVisible();

    // Opened and closed by its own button, then back: acts on the page below, not a no-op.
    await page.locator('.member-card').first().click();
    await expect(page.locator('#profile-view')).toHaveClass(/active/, { timeout: 20000 });
    await page.getByRole('button', { name: 'Profili düzenle' }).click();
    await expect(page.locator('#modal-member')).toBeVisible();
    await page.locator('#modal-member .close').click();
    await expect(page.locator('#modal-member')).toBeHidden();
    await page.goBack();
    await expect(page.locator('#members-view')).toHaveClass(/active/);
    await stillThere(page, url);
    expect(problems.filter(p => !p.includes('Failed to load resource'))).toEqual([]);
  });

  test('client: tab back to Özet, session screen closes and the session stays active', async ({ page, problems }) => {
    await login(page, 'user', env.clientEmail, env.clientPassword);
    await expect(page.getByText('Hoş geldiniz')).toBeVisible({ timeout: 20000 });
    const url = page.url().split('#')[0];

    await page.locator('[data-portal-tab="workouts"]').click();
    await expect(page.locator('[data-portal-tab="workouts"]')).toHaveClass(/active/);
    await page.goBack();
    await expect(page.locator('[data-portal-tab="overview"]')).toHaveClass(/active/);
    await stillThere(page, url);

    await page.locator('[data-portal-tab="workouts"]').click();
    await page.locator('.member-portal-list li', { hasText: title }).getByRole('button', { name: 'Antrenmanı Başlat' }).click();
    await expect(page.locator('#member-session')).toBeVisible();
    await page.goBack();
    await expect(page.locator('#member-session')).toBeHidden();
    await expect(page.locator('[data-portal-tab="workouts"]')).toHaveClass(/active/);
    const sessions = await rest(admin, 'GET', `workout_sessions?select=status&member_id=eq.${memberId}&metadata->>workoutId=eq.${workoutId}`);
    expect(sessions.map(s => s.status)).toEqual(['active']);

    await page.goBack(); // next layer down: the tab
    await expect(page.locator('[data-portal-tab="overview"]')).toHaveClass(/active/);
    await stillThere(page, url);
    expect(problems.filter(p => !p.includes('Failed to load resource'))).toEqual([]);
  });
});
