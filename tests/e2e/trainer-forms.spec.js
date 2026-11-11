// More trainer flows, screen to database: weekly schedule (create + delete + client notification), edit a client,
// delete a measurement and a document, and delete a client completely (KVKK), including the confirmation counts.
const { test, expect, login } = require('./fixtures');
const { env, signIn, rest, fileExists } = require('../helpers/api');

const PDF = Buffer.from('%PDF-1.1\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');
const today = () => new Date().toLocaleDateString('en-CA');

async function uploadFile(token, filePath) {
  const response = await fetch(`${env.url}/storage/v1/object/dokumanlar/${filePath}`, {
    method: 'POST', headers: { apikey: env.publishableKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/pdf' }, body: PDF
  });
  if (!response.ok) throw new Error(`storage upload failed: HTTP ${response.status}`);
}

test.describe('trainer forms and deletes', () => {
  test.describe.configure({ mode: 'serial' });
  const name = `E2E Form ${Date.now()}`;
  let admin, memberId, measurementId, documentPath;

  test.beforeAll(async () => {
    admin = await signIn(env.adminEmail, env.adminPassword);
    const [member] = await rest(admin, 'POST', 'uyeler', { ad_soyad: name, brans: 'Fitness', cinsiyet: 'Erkek', trainer_id: 'burak-ozcan', kayit_tarihi: today() });
    memberId = member.id;
    // This month's measurement keeps the "monthly measurement required" lock off the other tabs.
    const [measurement] = await rest(admin, 'POST', 'olcumler', { id: Date.now(), member_id: memberId, tarih: today(), weight: 77 });
    measurementId = measurement.id;
    documentPath = `${memberId}/${Date.now()}_e2e.pdf`;
    await uploadFile(admin, documentPath);
    await rest(admin, 'POST', 'dokumanlar', { member_id: memberId, adi: 'E2E Belge', yol: documentPath, tip: 'Diğer' });
  });

  test.afterAll(async () => {
    if (memberId) await rest(admin, 'DELETE', `uyeler?id=eq.${memberId}`).catch(() => {});
  });

  test('add a weekly session for a client, then delete it', async ({ page, problems }) => {
    page.on('dialog', dialog => dialog.accept());
    await login(page, 'admin', env.adminEmail, env.adminPassword);
    await expect(page.locator('.member-card').first()).toBeVisible({ timeout: 20000 });
    if (await page.locator('.mobile-logo').isVisible()) await page.locator('.mobile-logo').click();
    await page.getByRole('button', { name: /Haftalık Program/ }).click();
    await page.getByRole('button', { name: '+ Programa ekle' }).click();
    await page.locator('#schedule-member').selectOption({ label: name });
    const row = page.locator('[data-schedule-row]').first();
    await row.locator('[data-schedule-day]').selectOption('3');
    await row.locator('[data-schedule-start]').selectOption('09:00');
    await row.locator('[data-schedule-end]').selectOption('10:00');
    await row.locator('[data-schedule-branch]').selectOption('Yoga');
    await page.locator('#modal-schedule button[type="submit"]').click();

    await expect.poll(async () => (await rest(admin, 'GET', `weekly_program_schedule?select=*&member_id=eq.${memberId}`)).length, { timeout: 15000 }).toBe(1);
    const [session] = await rest(admin, 'GET', `weekly_program_schedule?select=*&member_id=eq.${memberId}`);
    expect(session).toMatchObject({ day_of_week: 3, start_time: '09:00:00', end_time: '10:00:00', branch: 'Yoga', trainer_id: 'burak-ozcan' });
    // The client is told about the new session (this is what drives the push notification).
    const notes = await rest(admin, 'GET', `schedule_notifications?select=action,message&member_id=eq.${memberId}`);
    expect(notes.map(n => n.action)).toContain('created');

    // Delete it through the editor.
    await page.locator(`[onclick*="openScheduleEditor(${session.id})"]`).first().click();
    await page.locator('#schedule-delete').click();
    await expect.poll(async () => (await rest(admin, 'GET', `weekly_program_schedule?select=id&member_id=eq.${memberId}`)).length, { timeout: 15000 }).toBe(0);
    // The app records the notification right after removing the row, so wait for it.
    await expect.poll(async () => (await rest(admin, 'GET', `schedule_notifications?select=action&member_id=eq.${memberId}`)).map(n => n.action), { timeout: 15000 }).toContain('deleted');
    expect(problems.filter(p => !p.includes('Failed to load resource'))).toEqual([]);
  });

  test('edit a client', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());
    await login(page, 'admin', env.adminEmail, env.adminPassword);
    await page.locator('.member-card', { hasText: name }).click({ timeout: 20000 });
    await page.getByRole('button', { name: 'Profili düzenle' }).click();
    await page.locator('#m-name').fill(`${name} (düzenlendi)`);
    await page.locator('#m-height').fill('190');
    await page.locator('#modal-member button[type="submit"]').click();
    await expect.poll(async () => (await rest(admin, 'GET', `uyeler?select=ad_soyad,boy&id=eq.${memberId}`))[0].boy, { timeout: 15000 }).toBe(190);
    expect((await rest(admin, 'GET', `uyeler?select=ad_soyad&id=eq.${memberId}`))[0].ad_soyad).toBe(`${name} (düzenlendi)`);
    await expect(page.locator('#prof-name')).toContainText('(düzenlendi)');
  });

  test('delete a measurement', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());
    await login(page, 'admin', env.adminEmail, env.adminPassword);
    await page.locator('.member-card', { hasText: name }).click({ timeout: 20000 });
    await page.locator('#btn-tab-measurements').click();
    await page.locator('#tab-measurements .btn-delete').first().click();
    await expect.poll(async () => (await rest(admin, 'GET', `olcumler?select=id&id=eq.${measurementId}`)).length, { timeout: 15000 }).toBe(0);
  });

  test('delete a document: the row and the stored file both go', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());
    expect(await fileExists(admin, 'dokumanlar', documentPath)).toBe(true);
    await rest(admin, 'POST', 'olcumler', { id: Date.now(), member_id: memberId, tarih: today(), weight: 77 }); // keep this month covered
    await login(page, 'admin', env.adminEmail, env.adminPassword);
    await page.locator('.member-card', { hasText: name }).click({ timeout: 20000 });
    await page.locator('#btn-tab-documents').click();
    await page.getByText('Döküman Arşivi').click(); // the archive is a collapsed section
    await expect(page.locator('#tab-documents')).toContainText('E2E Belge');
    await page.locator('#tab-documents .btn-delete').first().click();
    await expect.poll(async () => (await rest(admin, 'GET', `dokumanlar?select=id&member_id=eq.${memberId}`)).length, { timeout: 15000 }).toBe(0);
    await expect.poll(() => fileExists(admin, 'dokumanlar', documentPath), { timeout: 15000 }).toBe(false);
  });

  test('delete a client completely, after typing their name', async ({ page }) => {
    // Give the client one more of everything so the confirmation counts and the cascade are visible.
    documentPath = `${memberId}/${Date.now()}_last.pdf`;
    await uploadFile(admin, documentPath);
    await rest(admin, 'POST', 'dokumanlar', { member_id: memberId, adi: 'Son Belge', yol: documentPath, tip: 'Diğer' });
    const prompts = [];
    page.on('dialog', async dialog => {
      if (dialog.type() === 'prompt') { prompts.push(dialog.message()); await dialog.accept(`${name} (düzenlendi)`); } else await dialog.accept();
    });
    await login(page, 'admin', env.adminEmail, env.adminPassword);
    await page.locator('.member-card', { hasText: name }).getByRole('button', { name: 'Sil' }).click({ timeout: 20000 });
    await expect.poll(async () => (await rest(admin, 'GET', `uyeler?select=id&id=eq.${memberId}`)).length, { timeout: 20000 }).toBe(0);
    // The confirmation showed the REAL counts (history is loaded on demand, so this checks the lazy loading).
    expect(prompts[0]).toContain('1 ölçüm');
    expect(prompts[0]).toContain('1 belge');
    // Everything linked is gone: rows (cascade) and files.
    expect(await rest(admin, 'GET', `olcumler?select=id&member_id=eq.${memberId}`)).toHaveLength(0);
    expect(await rest(admin, 'GET', `dokumanlar?select=id&member_id=eq.${memberId}`)).toHaveLength(0);
    expect(await fileExists(admin, 'dokumanlar', documentPath)).toBe(false);
    memberId = null;
  });
});
