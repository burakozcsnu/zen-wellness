// Trainer forms give honest feedback: no pop-ups, "kaydedildi" only when the change was really sent, no double save,
// and a conflicted change in the pending list cannot be retried.
const { test, expect, login } = require('./fixtures');
const { env, signIn, rest } = require('../helpers/api');

const stamp = Date.now();
const today = () => new Date().toLocaleDateString('en-CA');

test.describe('trainer save feedback', () => {
  test.describe.configure({ mode: 'serial' });
  let admin, memberId;
  const name = `E2E Geri Bildirim ${stamp}`;

  test.beforeAll(async () => {
    admin = await signIn(env.adminEmail, env.adminPassword);
    [{ id: memberId }] = await rest(admin, 'POST', 'uyeler', { ad_soyad: name, trainer_id: 'burak-ozcan', kayit_tarihi: today() });
    await rest(admin, 'POST', 'olcumler', { id: stamp + 1, member_id: memberId, tarih: today(), weight: 80 }); // unlocks the tabs
  });
  test.afterAll(async () => { if (memberId) await rest(admin, 'DELETE', `uyeler?id=eq.${memberId}`).catch(() => {}); });

  const start = async page => {
    await login(page, 'admin', env.adminEmail, env.adminPassword);
    await expect(page.locator('.member-card', { hasText: name })).toBeVisible({ timeout: 20000 });
  };
  const openWorkoutForm = async (page, title) => {
    await page.locator('.member-card', { hasText: name }).click();
    await page.locator('#btn-tab-workouts').click();
    await page.getByRole('button', { name: /Yeni Antrenman/ }).click();
    await page.locator('#w-name').fill(title);
  };
  const dbWorkouts = title => rest(admin, 'GET', `antrenmanlar?select=id&member_id=eq.${memberId}&sablon=eq.${encodeURIComponent(title)}`);

  test('a change that was only queued shows the waiting message and no "kaydedildi"', async ({ page, context }) => {
    const title = `E2E Kuyruk ${stamp}`;
    await start(page);
    await openWorkoutForm(page, title);
    await context.setOffline(true);
    await page.locator('#modal-workout button[type="submit"]').click();
    await expect(page.locator('#toast-region')).toContainText('Bağlantı yok. Değişiklik cihazda bekliyor');
    await expect(page.locator('#modal-workout')).toBeHidden({ timeout: 15000 }); // the save finished: the success message would be shown by now
    expect(await page.locator('#toast-region').innerText()).not.toContain('kaydedildi'); // plain read: the toast is added in the same tick that closes the modal
    await context.setOffline(false);
    await expect.poll(async () => (await dbWorkouts(title)).length, { timeout: 20000 }).toBe(1); // sent on reconnect
  });

  test('a sent change shows "Antrenman kaydedildi!" and a double click on a slow save creates one row', async ({ page }) => {
    const title = `E2E Çift ${stamp}`;
    await start(page);
    await openWorkoutForm(page, title);
    await page.route('**/rest/v1/antrenmanlar*', async route => {
      if (route.request().method() === 'POST') await new Promise(resolve => setTimeout(resolve, 1500));
      await route.fallback();
    });
    const submit = page.locator('#modal-workout button[type="submit"]');
    await submit.dblclick();
    await expect(submit).toBeDisabled();
    await expect(page.locator('#toast-region')).toContainText('Antrenman kaydedildi!', { timeout: 15000 });
    await expect(submit).toBeEnabled();
    expect(await dbWorkouts(title)).toHaveLength(1);
  });

  test('a conflicted change in the pending list has Sil but no Tekrar dene', async ({ page }) => {
    await start(page);
    await page.evaluate(() => {
      const key = Object.keys(localStorage).find(k => /^sb-.*-auth-token$/.test(k));
      const userId = JSON.parse(localStorage.getItem(key)).user.id;
      const item = { queueId: 'e2e-conflict', userId, table: 'antrenmanlar', operation: 'upsert', payload: { id: 1 }, createdAt: Date.now(), status: 'conflict', lastError: 'conflict' };
      localStorage.setItem('trainerpro_sync_failed', JSON.stringify([item]));
      window.dispatchEvent(new CustomEvent('trainerpro-sync-failed', { detail: { failed: [item] } }));
    });
    await page.locator('#sync-pending-button').click();
    const row = page.locator('#sync-list .sync-row');
    await expect(row).toContainText('Bu kayıt başka bir cihazda değiştirilmiş.');
    await expect(row.getByRole('button', { name: 'Sil', exact: true })).toBeVisible();
    await expect(row.getByRole('button', { name: 'Tekrar dene' })).toHaveCount(0);
    await page.evaluate(() => localStorage.removeItem('trainerpro_sync_failed'));
  });

  test('a refused form value shows a toast and no pop-up', async ({ page, problems }) => {
    await start(page);
    await page.evaluate(() => window.nav('schedule-view'));
    await page.evaluate(() => window.openScheduleEditor());
    await page.locator('#schedule-member').selectOption({ label: name });
    await page.locator('[data-schedule-start]').first().selectOption('10:00');
    await page.locator('[data-schedule-end]').first().selectOption('09:00');
    await page.locator('#modal-schedule button[type="submit"]').click();
    await expect(page.locator('#toast-region')).toContainText('Bitiş saati başlangıç saatinden sonra olmalıdır.');
    expect(problems.filter(p => p.startsWith('alert dialog'))).toEqual([]);
  });
});
