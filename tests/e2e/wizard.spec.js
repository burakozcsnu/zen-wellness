// New client onboarding ("Akıllı Değerlendirme") with the KVKK consent step, checked from the screen down to the database.
const { test, expect, login } = require('./fixtures');
const { env, signIn, rest, fileExists } = require('../helpers/api');

const NEW_EMAIL = process.env.ZEN_TESTDB_NEWCLIENT_EMAIL;
const NEW_PASSWORD = process.env.ZEN_TESTDB_NEWCLIENT_PASSWORD;

// Answers whatever question the wizard is showing, then moves on.
async function answerCurrentQuestion(page) {
  if (await page.locator('#assessment-consent').count()) await page.locator('#assessment-consent').check();
  else if (await page.locator('#assessment-height').count()) {
    await page.locator('#assessment-height').fill('172');
    await page.locator('#assessment-weight').fill('68.5');
  } else if (await page.locator('input[name="assessment-option"]').count()) await page.locator('.assessment-option').first().click();
  else {
    const input = page.locator('#assessment-answer');
    const type = await input.evaluate(node => (node.tagName === 'TEXTAREA' ? 'textarea' : node.type));
    await input.fill({ date: '1990-05-17', tel: '05321234567', text: 'Yeni Test Danışan', textarea: 'Yok' }[type]);
  }
  await page.locator('#assessment-next').click();
}

test.describe('onboarding wizard with KVKK consent', () => {
  let admin, memberId;

  test.beforeAll(async () => {
    admin = await signIn(env.adminEmail, env.adminPassword);
    const [member] = await rest(admin, 'GET', `uyeler?select=id&email=eq.${encodeURIComponent(NEW_EMAIL)}`);
    memberId = member.id;
    // Start every run from "assessment not done yet".
    await rest(admin, 'PATCH', `uyeler?id=eq.${memberId}`, { degerlendirme_tamamlandi: false, degerlendirme_verileri: {}, degerlendirme_tarihi: null });
    await rest(admin, 'DELETE', `olcumler?member_id=eq.${memberId}`);
  });

  test('consent comes first, nothing is saved without it, and the receipt lands in Dökümanlar', async ({ page, problems }) => {
    page.on('dialog', dialog => dialog.accept());
    const receiptsBefore = (await rest(admin, 'GET', `dokumanlar?select=id&member_id=eq.${memberId}&tip=eq.KVKK`)).length;

    await login(page, 'user', NEW_EMAIL, NEW_PASSWORD);
    await expect(page.locator('#member-assessment')).toBeVisible({ timeout: 20000 });

    // 1. The first screen is the consent text, and the client cannot skip it.
    await expect(page.locator('#assessment-question h2')).toContainText('Açık Rıza');
    await page.locator('#assessment-next').click();
    await expect(page.locator('#assessment-error')).toHaveText('Lütfen bu soruyu yanıtlayın.');
    await expect(page.locator('#assessment-question h2')).toContainText('Açık Rıza');

    // 2. Nothing has been written yet: no health data without consent.
    const [untouched] = await rest(admin, 'GET', `uyeler?select=degerlendirme_tamamlandi&id=eq.${memberId}`);
    expect(untouched.degerlendirme_tamamlandi).toBe(false);
    expect(await rest(admin, 'GET', `dokumanlar?select=id&member_id=eq.${memberId}&tip=eq.KVKK`)).toHaveLength(receiptsBefore);

    // 3. Accept and answer all 11 questions.
    for (let step = 0; step < 12; step++) {
      if (await page.locator('#member-assessment').isHidden()) break;
      await answerCurrentQuestion(page);
      await page.waitForTimeout(250);
    }
    await expect(page.locator('#member-assessment')).toBeHidden({ timeout: 20000 });

    // 4. The database holds everything: receipt row + file, completed assessment, first measurement.
    const receipts = await rest(admin, 'GET', `dokumanlar?select=*&member_id=eq.${memberId}&tip=eq.KVKK&order=id.desc`);
    expect(receipts).toHaveLength(receiptsBefore + 1);
    expect(receipts[0].yol).toMatch(new RegExp(`^${memberId}/kvkk_riza_\\d+\\.txt$`));
    expect(await fileExists(admin, 'dokumanlar', receipts[0].yol)).toBe(true);
    const [member] = await rest(admin, 'GET', `uyeler?select=*&id=eq.${memberId}`);
    expect(member.degerlendirme_tamamlandi).toBe(true);
    expect(member.degerlendirme_verileri.kvkk_riza).toMatchObject({ accepted: true, version: 'taslak-1' });
    expect(member.boy).toBe(172);
    const measurements = await rest(admin, 'GET', `olcumler?select=weight&member_id=eq.${memberId}`);
    expect(measurements.map(m => m.weight)).toEqual([68.5]);

    // 5. The client sees the receipt in their Belgeler list.
    await page.locator('[data-portal-tab="documents"]').click();
    await expect(page.locator('[data-portal-section="documents"]')).toContainText('KVKK Açık Rıza Kaydı');
    expect(problems.filter(p => !p.includes('Failed to load resource'))).toEqual([]);
  });

  test('the trainer sees that consent was given', async ({ page }) => {
    await login(page, 'admin', env.adminEmail, env.adminPassword);
    await expect(page.locator('.member-card').first()).toBeVisible({ timeout: 20000 });
    await page.evaluate(id => window.openAssessmentDetails(id), memberId);
    await expect(page.locator('#detail-body')).toContainText('KVKK açık rıza');
    await expect(page.locator('#detail-body')).toContainText('Verildi · taslak-1');
  });
});
