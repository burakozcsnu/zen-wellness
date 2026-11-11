// UI/UX guard: the rows that the "+ Egzersiz Ekle" and "+ Öğün" buttons add to the workout and diet forms
// have names for every field and buttons big enough to tap (these rows do not exist until the button is pressed).
const { test, expect, login } = require('./fixtures');
const { env, signIn, rest } = require('../helpers/api');

test('workout and diet rows: every field has a name, every control is at least 44 px', async ({ page }) => {
  const token = await signIn(env.adminEmail, env.adminPassword);
  const day = new Date().toLocaleDateString('en-CA');
  const name = `E2E Rows ${Date.now()}`;
  const [member] = await rest(token, 'POST', 'uyeler', { ad_soyad: name, brans: 'Fitness', cinsiyet: 'Kadın', trainer_id: 'burak-ozcan', kayit_tarihi: day });
  await rest(token, 'POST', 'olcumler', { id: Date.now(), member_id: member.id, tarih: day, weight: 60 }); // no monthly-measurement lock
  try {
    const open = () => page.evaluate(() => {
      const controls = [...document.querySelectorAll('.modal[aria-hidden="false"] select, .modal[aria-hidden="false"] input:not([type=hidden]), .modal[aria-hidden="false"] button')]
        .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
      const bad = controls.flatMap(el => {
        const r = el.getBoundingClientRect();
        const named = el.getAttribute('aria-label') || (el.id && document.querySelector(`label[for="${el.id}"]`)) || el.closest('label') || (el.tagName === 'BUTTON' && el.innerText.trim());
        const what = `${el.tagName}.${el.className}`;
        return [...(named ? [] : [`no name: ${what}`]), ...(r.height < 44 || (el.tagName === 'BUTTON' && r.width < 44) ? [`too small ${Math.round(r.width)}x${Math.round(r.height)}: ${what}`] : [])];
      });
      return { count: controls.length, bad };
    });
    page.on('dialog', dialog => dialog.accept());
    await login(page, 'admin', env.adminEmail, env.adminPassword);
    await page.locator('.member-card', { hasText: name }).click({ timeout: 20000 });

    await page.locator('#btn-tab-workouts').click();
    await page.getByRole('button', { name: /Yeni Antrenman/ }).click();
    await page.getByRole('button', { name: '+ Egzersiz Ekle' }).click();
    const workout = await open();
    expect(workout.count).toBeGreaterThan(10); // the form and its new row were really inspected
    expect(workout.bad).toEqual([]);
    await page.evaluate(() => window.closeModal('modal-workout'));

    await page.locator('#btn-tab-nutrition').click();
    await page.getByRole('button', { name: /Yeni Beslenme Planı/ }).click();
    await page.getByRole('button', { name: /Öğün.Supplement/ }).first().click();
    const diet = await open();
    expect(diet.count).toBeGreaterThan(10);
    expect(diet.bad).toEqual([]);
  } finally {
    await rest(token, 'DELETE', `uyeler?id=eq.${member.id}`);
  }
});
