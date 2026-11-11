// Training and nutrition plans: the trainer builds them with the real forms, the client then sees them in their portal.
const { test, expect, login } = require('./fixtures');
const { env, signIn, rest } = require('../helpers/api');

const today = () => new Date().toLocaleDateString('en-CA');

test.describe('workout and diet plans', () => {
  test.describe.configure({ mode: 'serial' });
  const memberName = `E2E Plan ${Date.now()}`;
  const foodName = `E2E Yulaf ${Date.now()}`;
  let admin, memberId, foodId;

  test.beforeAll(async () => {
    admin = await signIn(env.adminEmail, env.adminPassword);
    const [member] = await rest(admin, 'POST', 'uyeler', { ad_soyad: memberName, brans: 'Fitness', cinsiyet: 'Kadın', trainer_id: 'burak-ozcan', kayit_tarihi: today() });
    memberId = member.id;
    await rest(admin, 'POST', 'olcumler', { id: Date.now(), member_id: memberId, tarih: today(), weight: 60 }); // no monthly-measurement lock
    foodId = Date.now() + 5;
    await rest(admin, 'POST', 'master_besinler', { id: foodId, ad: foodName, tip: 'Tahıl', porsiyon: '100 g', kalori: 370, protein: 13, karbonhidrat: 60, yag: 7 });
  });

  test.afterAll(async () => {
    if (memberId) await rest(admin, 'DELETE', `uyeler?id=eq.${memberId}`).catch(() => {});
    if (foodId) await rest(admin, 'DELETE', `master_besinler?id=eq.${foodId}`).catch(() => {});
  });

  test('the trainer saves a workout; it is stored with every set', async ({ page, problems }) => {
    page.on('dialog', dialog => dialog.accept());
    await login(page, 'admin', env.adminEmail, env.adminPassword);
    await page.locator('.member-card', { hasText: memberName }).click({ timeout: 20000 });
    await page.locator('#btn-tab-workouts').click();
    await page.getByRole('button', { name: /Yeni Antrenman/ }).click();
    await page.locator('#w-name').fill('E2E Üst Vücut');
    await page.locator('#w-rpe').fill('7');
    await page.locator('#w-rest').fill('90');

    await page.getByRole('button', { name: '+ Egzersiz Ekle' }).click();
    const block = page.locator('.set-row-wrapper').first();
    await block.locator('.s-name').selectOption({ index: 1 }); // first exercise of the library
    const exercise = await block.locator('.s-name').inputValue();
    await block.locator('.s-weight').first().fill('40');
    await block.locator('.s-reps').first().fill('12');
    await block.locator('.s-sure').first().fill('45');
    await page.getByRole('button', { name: '+ Bu Harekete Set Ekle' }).click(); // a second set of the same exercise
    await block.locator('.s-weight').nth(1).fill('45');
    await block.locator('.s-reps').nth(1).fill('10');
    await page.getByRole('button', { name: 'Antrenmanı Kaydet' }).click();

    await expect.poll(async () => (await rest(admin, 'GET', `antrenmanlar?select=id&member_id=eq.${memberId}`)).length, { timeout: 15000 }).toBe(1);
    const [workout] = await rest(admin, 'GET', `antrenmanlar?select=*&member_id=eq.${memberId}`);
    expect(workout).toMatchObject({ sablon: 'E2E Üst Vücut', rpe: 7, rest_seconds: 90 });
    const sets = typeof workout.setler === 'string' ? JSON.parse(workout.setler) : workout.setler;
    expect(sets).toHaveLength(2);
    expect(sets.map(set => [set.ad, set.set_no, Number(set.weight), Number(set.reps)])).toEqual([[exercise, 1, 40, 12], [exercise, 2, 45, 10]]);
    expect(problems.filter(p => !p.includes('Failed to load resource'))).toEqual([]);
  });

  test('the client sees that workout in their portal', async ({ page }) => {
    // The client portal belongs to the test client; hand them a copy of the workout through the trainer's data model.
    const [client] = await rest(admin, 'GET', `uyeler?select=id&email=eq.${encodeURIComponent(env.clientEmail)}`);
    const [original] = await rest(admin, 'GET', `antrenmanlar?select=*&member_id=eq.${memberId}`);
    const [copy] = await rest(admin, 'POST', 'antrenmanlar', { id: Date.now(), member_id: client.id, tarih: today(), sablon: original.sablon, setler: original.setler });
    try {
      await login(page, 'user', env.clientEmail, env.clientPassword);
      await expect(page.getByText('Hoş geldiniz')).toBeVisible({ timeout: 20000 });
      await page.locator('[data-portal-tab="workouts"]').click();
      await expect(page.locator('[data-portal-section="workouts"]')).toContainText('E2E Üst Vücut');
    } finally {
      await rest(admin, 'DELETE', `antrenmanlar?id=eq.${copy.id}`);
    }
  });

  test('the trainer builds a diet plan from the food library; totals are saved', async ({ page, problems }) => {
    page.on('dialog', dialog => dialog.accept());
    await login(page, 'admin', env.adminEmail, env.adminPassword);
    await page.locator('.member-card', { hasText: memberName }).click({ timeout: 20000 });
    await page.locator('#btn-tab-nutrition').click();
    await page.getByRole('button', { name: /Yeni Beslenme Planı/ }).click();
    await page.locator('#d-name').fill('E2E Haftalık Plan');
    await page.getByRole('button', { name: /Öğün.Supplement/ }).first().click();
    await page.locator('.m-meal-name').first().selectOption('Kahvaltı');
    const search = page.locator('.m-search').first();
    await search.fill(foodName.slice(0, 12));
    await page.locator('.m-search-results div', { hasText: foodName }).first().click();
    await page.locator('.m-qty').first().fill('2'); // two portions: values scale
    await expect(page.locator('#diet-total-cals')).not.toHaveText(/^0/);
    await page.locator('#modal-diet button[type="submit"]').click();

    await expect.poll(async () => (await rest(admin, 'GET', `beslenme_planlari?select=id&member_id=eq.${memberId}`)).length, { timeout: 15000 }).toBe(1);
    const [plan] = await rest(admin, 'GET', `beslenme_planlari?select=*&member_id=eq.${memberId}`);
    expect(plan.plan_adi).toBe('E2E Haftalık Plan');
    const meals = typeof plan.ogunler === 'string' ? JSON.parse(plan.ogunler) : plan.ogunler;
    expect(meals).toHaveLength(1);
    expect(meals[0]).toMatchObject({ ogun_adi: 'Kahvaltı', ad: foodName });
    expect(Number(meals[0].miktar)).toBe(2);
    expect(Number(meals[0].kalori)).toBeGreaterThan(0);
    expect(problems.filter(p => !p.includes('Failed to load resource'))).toEqual([]);
  });
});
