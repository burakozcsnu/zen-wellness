// Trainer write flows, from the form on screen to the row in the database: add a client, add a measurement, upload a document.
const { test, expect, login } = require('./fixtures');
const { env, signIn, rest, fileExists } = require('../helpers/api');

const PDF = Buffer.from('%PDF-1.1\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');

test.describe('trainer writes data through the UI', () => {
  test.describe.configure({ mode: 'serial' });
  const name = `E2E Danışan ${Date.now()}`;
  let admin, memberId;

  test.beforeAll(async () => { admin = await signIn(env.adminEmail, env.adminPassword); });

  // Test data is removed afterwards (cascades to the member's measurements and documents).
  test.afterAll(async () => {
    if (memberId) await rest(admin, 'DELETE', `uyeler?id=eq.${memberId}`);
  });

  test('add a new client', async ({ page, problems }) => {
    page.on('dialog', dialog => dialog.accept());
    await login(page, 'admin', env.adminEmail, env.adminPassword);
    await expect(page.locator('.member-card').first()).toBeVisible({ timeout: 20000 });
    await page.locator('.fab').click();
    await page.locator('#m-name').fill(name);
    await page.locator('#m-height').fill('181');
    await page.locator('#m-reg-date').fill('2026-01-15');
    await page.locator('#modal-member button[type="submit"]').click();

    await expect(page.locator('.member-card', { hasText: name })).toBeVisible({ timeout: 15000 });
    const rows = await rest(admin, 'GET', `uyeler?select=*&ad_soyad=eq.${encodeURIComponent(name)}`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ boy: 181, brans: 'Fitness', trainer_id: 'burak-ozcan', kayit_tarihi: '2026-01-15' });
    memberId = rows[0].id;
    expect(problems.filter(p => !p.includes('Failed to load resource'))).toEqual([]);
  });

  test('add a measurement to that client', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());
    await login(page, 'admin', env.adminEmail, env.adminPassword);
    await page.locator('.member-card', { hasText: name }).click({ timeout: 20000 });
    await page.locator('#btn-tab-measurements').click();
    await page.getByRole('button', { name: /Yeni Ölçüm/ }).click();
    // The date field is pre-filled with today; the app locks the other tabs until this month has a measurement.
    await page.locator('#m-weight').fill('82.4');
    await page.locator('#m-fat').fill('18.5');
    await page.locator('#modal-measurement button[type="submit"]').click();

    await expect.poll(async () => (await rest(admin, 'GET', `olcumler?select=weight,fat,tarih&member_id=eq.${memberId}`)).length, { timeout: 15000 }).toBe(1);
    const [row] = await rest(admin, 'GET', `olcumler?select=weight,fat,tarih&member_id=eq.${memberId}`);
    expect(row).toMatchObject({ weight: 82.4, fat: 18.5, tarih: new Date().toLocaleDateString('en-CA') });
  });

  test('upload a document and find it in the archive', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());
    await login(page, 'admin', env.adminEmail, env.adminPassword);
    const alerts = [];
    page.on('dialog', dialog => alerts.push(dialog.message()));
    await page.locator('.member-card', { hasText: name }).click({ timeout: 20000 });
    await page.locator('#btn-tab-documents').click();
    expect(alerts.filter(message => message.includes('ölçüm zorunludur'))).toEqual([]);
    await page.locator('#doc-name').fill('E2E Kan Testi');
    await page.locator('#doc-type').selectOption('Kan Testi');
    await page.locator('#doc-file').setInputFiles({ name: 'kan testi.pdf', mimeType: 'application/pdf', buffer: PDF });
    await page.locator('#tab-documents button[type="submit"]').click();

    await expect.poll(async () => (await rest(admin, 'GET', `dokumanlar?select=id&member_id=eq.${memberId}`)).length, { timeout: 15000 }).toBe(1);
    const [doc] = await rest(admin, 'GET', `dokumanlar?select=*&member_id=eq.${memberId}`);
    expect(doc).toMatchObject({ adi: 'E2E Kan Testi', tip: 'Kan Testi' });
    expect(doc.yol.startsWith(`${memberId}/`)).toBe(true);
    expect(await fileExists(admin, 'dokumanlar', doc.yol)).toBe(true);
    await expect(page.locator('#tab-documents')).toContainText('E2E Kan Testi');
  });
});
