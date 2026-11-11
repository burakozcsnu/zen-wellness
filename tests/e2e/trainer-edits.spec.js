// Editing what already exists, as the trainer does it: a workout template, the exercise and food libraries, the undo log
// ("Geri Al") and offline mode. Every check reads the TEST database afterwards.
const { test, expect, login } = require('./fixtures');
const { env, signIn, rest } = require('../helpers/api');

const today = () => new Date().toLocaleDateString('en-CA');
const stamp = Date.now();

test.describe('trainer edits existing data', () => {
  test.describe.configure({ mode: 'serial' });
  let admin, noBranchId;
  const ids = { exercise: stamp + 1, program: stamp + 2, food: stamp + 3 };
  const names = { exercise: `E2E Hareket ${stamp}`, program: `E2E Şablon ${stamp}`, food: `E2E Besin ${stamp}` };

  test.beforeAll(async () => {
    admin = await signIn(env.adminEmail, env.adminPassword);
    // A client without a branch used to crash the global search for everybody (brans.toLowerCase on null).
    [{ id: noBranchId }] = await rest(admin, 'POST', 'uyeler', { ad_soyad: `E2E Branşsız ${stamp}`, trainer_id: 'burak-ozcan', kayit_tarihi: today() });
    await rest(admin, 'POST', 'master_egzersizler', { id: ids.exercise, ad: names.exercise, brans: 'Fitness' });
    await rest(admin, 'POST', 'programlar', { id: ids.program, program_adi: names.program, detaylar: JSON.stringify([{ ad: names.exercise }]) });
    await rest(admin, 'POST', 'master_besinler', { id: ids.food, ad: names.food, tip: 'Yemek', porsiyon: '100 g', kalori: 100, protein: 10, karbonhidrat: 10, yag: 1 });
  });

  test.afterAll(async () => {
    if (noBranchId) await rest(admin, 'DELETE', `uyeler?id=eq.${noBranchId}`).catch(() => {});
    await rest(admin, 'DELETE', `programlar?id=eq.${ids.program}`).catch(() => {});
    await rest(admin, 'DELETE', `master_egzersizler?id=eq.${ids.exercise}`).catch(() => {});
    await rest(admin, 'DELETE', `master_besinler?id=eq.${ids.food}`).catch(() => {});
  });

  // On a phone the sidebar is a drawer behind the logo.
  const openMenu = async page => {
    const toggle = page.locator('.mobile-logo');
    if (await toggle.isVisible() && (await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  };
  const clickUndo = async page => { await openMenu(page); await page.locator('.sidebar .btn-undo').click(); };
  const open = async (page, nav) => {
    page.on('dialog', dialog => dialog.accept());
    await login(page, 'admin', env.adminEmail, env.adminPassword);
    await expect(page.locator('.member-card').first().or(page.locator('#members-view'))).toBeVisible({ timeout: 20000 });
    await openMenu(page);
    await page.locator(`#btn-${nav}`).click();
  };
  // Open the group and click in one retried step: the list re-renders (and re-closes) when the first sync ends.
  const foodAction = (page, button) => expect(async () => {
    const card = page.locator('.card', { hasText: names.food });
    if (!(await card.isVisible())) await page.locator('.acc-header', { hasText: /^\s*Yemek/ }).click();
    await card.locator(button).click({ timeout: 2000 });
  }).toPass({ timeout: 20000 });
  const row = async (table, id) => (await rest(admin, 'GET', `${table}?select=*&id=eq.${id}`))[0];

  test('edit a workout template: the new name is saved and the exercises stay', async ({ page, problems }) => {
    await open(page, 'programs');
    const card = page.locator('.card', { hasText: names.program });
    await expect(async () => {
      if (!(await card.isVisible())) await page.locator('.acc-header', { hasText: 'Fitness Şablonları' }).click();
      await card.locator('.btn-edit').click({ timeout: 2000 });
    }).toPass({ timeout: 20000 });
    await expect(page.locator('#p-name')).toHaveValue(names.program);
    await page.locator('#p-name').fill(`${names.program} v2`);
    await page.locator('#modal-program button[type="submit"]').click();
    await expect.poll(async () => (await row('programlar', ids.program)).program_adi, { timeout: 15000 }).toBe(`${names.program} v2`);
    expect(JSON.parse((await row('programlar', ids.program)).detaylar)).toEqual([{ ad: names.exercise }]);
    expect(problems.filter(p => !p.includes('Failed to load resource'))).toEqual([]);
  });

  test('edit an exercise in the library (found by search, even with a branchless client in the data)', async ({ page, problems }) => {
    await open(page, 'programs');
    const search = page.getByPlaceholder(/Sistemde ara/);
    const result = page.locator('.card', { hasText: names.exercise }).first();
    // The library has 600+ exercises in closed groups: search finds it (retry: the list may still be loading).
    await expect(async () => {
      await search.fill('');
      await search.fill(names.exercise);
      await expect(result).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 20000 });
    await result.click(); // a search result opens the edit form
    await expect(page.locator('#new-ex-name')).toHaveValue(names.exercise);
    await page.locator('#new-ex-name').fill(`${names.exercise} v2`);
    await page.locator('#modal-new-exercise button[type="submit"]').click();
    await expect.poll(async () => (await row('master_egzersizler', ids.exercise)).ad, { timeout: 15000 }).toBe(`${names.exercise} v2`);
    expect(problems.filter(p => p.startsWith('pageerror'))).toEqual([]);
  });

  test('edit a food, then undo it with "Geri Al": the old values come back', async ({ page }) => {
    await open(page, 'nutrition');
    await foodAction(page, '.btn-edit');
    await expect(page.locator('#new-f-cal')).toHaveValue('100');
    await page.locator('#new-f-cal').fill('250');
    await page.locator('#modal-new-food button[type="submit"]').click();
    await expect.poll(async () => Number((await row('master_besinler', ids.food)).kalori), { timeout: 15000 }).toBe(250);

    await clickUndo(page);
    await expect(page.locator('#undo-log-list')).toContainText(`Besin: ${names.food}`);
    await page.locator('#undo-log-list .card').first().click(); // the dialog handler accepts the confirmation
    await expect.poll(async () => Number((await row('master_besinler', ids.food)).kalori), { timeout: 15000 }).toBe(100);
  });

  test('undo of a delete puts the row back; a failed undo says so instead of claiming success', async ({ page }) => {
    const dialogs = [];
    await open(page, 'nutrition');
    page.removeAllListeners('dialog');
    page.on('dialog', dialog => { dialogs.push(dialog.message()); dialog.accept(); });
    await foodAction(page, '.btn-delete');
    await expect.poll(async () => (await rest(admin, 'GET', `master_besinler?select=id&id=eq.${ids.food}`)).length, { timeout: 15000 }).toBe(0);

    // First undo attempt: the database refuses (simulated). The screen must report a failure.
    await page.route('**/rest/v1/master_besinler*', route => route.request().method() === 'POST' ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boom"}' }) : route.continue());
    await clickUndo(page);
    await page.locator('#undo-log-list .card').first().click();
    await expect.poll(() => dialogs.some(message => message.includes('hata oluştu')), { timeout: 15000 }).toBe(true);
    expect(dialogs.some(message => message.includes('başarıyla geri alındı'))).toBe(false);
    expect((await rest(admin, 'GET', `master_besinler?select=id&id=eq.${ids.food}`)).length).toBe(0);

    // Second attempt, database healthy again: the row is restored.
    await page.unroute('**/rest/v1/master_besinler*');
    await clickUndo(page);
    await page.locator('#undo-log-list .card').first().click();
    await expect.poll(async () => (await rest(admin, 'GET', `master_besinler?select=id&id=eq.${ids.food}`)).length, { timeout: 15000 }).toBe(1);
  });

  test('offline: an edit made without internet waits in the queue and is saved when the connection returns', async ({ page, context }) => {
    await open(page, 'nutrition');
    await context.setOffline(true);
    await foodAction(page, '.btn-edit');
    await page.locator('#new-f-cal').fill('321');
    await page.locator('#modal-new-food button[type="submit"]').click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('trainerpro_sync_queue') || '[]').length), { timeout: 10000 }).toBe(1);
    expect(Number((await row('master_besinler', ids.food)).kalori)).toBe(100); // nothing reached the database yet
    await expect(page.locator('#sync-status')).toContainText('Çevrimdışı');

    await context.setOffline(false);
    await expect.poll(async () => Number((await row('master_besinler', ids.food)).kalori), { timeout: 20000 }).toBe(321);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('trainerpro_sync_queue') || '[]').length), { timeout: 10000 }).toBe(0);
  });
});

test.describe('client data export', () => {
  test('"Verilerimi Dışa Aktar" downloads a file holding only that client\'s own data', async ({ page }) => {
    await login(page, 'user', env.clientEmail, env.clientPassword);
    await expect(page.getByText('Hoş geldiniz')).toBeVisible({ timeout: 20000 });
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Verilerimi Dışa Aktar' }).click()]);
    expect(download.suggestedFilename()).toBe(`trainer-pro-veriler-${new Date().toISOString().slice(0, 10)}.json`);
    const data = JSON.parse(require('fs').readFileSync(await download.path(), 'utf8'));
    expect(Object.keys(data).sort()).toEqual(['exportedAt', 'healthMetrics', 'measurements', 'profile', 'schedules', 'workoutSessions', 'workouts']);
    expect(data.profile.email).toBe(env.clientEmail);
    for (const key of ['measurements', 'workouts', 'schedules', 'healthMetrics', 'workoutSessions']) {
      for (const item of data[key]) expect(item.member_id).toBe(data.profile.id);
    }
  });
});
