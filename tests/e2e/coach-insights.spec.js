// Trainer "Koç özeti" card (adherence, weekly volume per muscle, personal records) and "Son antrenmanı tekrarla".
// Everything is seeded for one fake client with dates relative to today, and deleted afterwards.
const { test, expect, login } = require('./fixtures');
const { env, signIn, rest } = require('../helpers/api');

const stamp = Date.now();
const ymd = offset => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toLocaleDateString('en-CA'); };
const names = { member: `E2E Koç ${stamp}`, squat: `E2E Squat ${stamp}`, bench: `E2E Bench ${stamp}`, row: `E2E Row ${stamp}` };
const SCHEDULE_DAYS = [1, 4]; // Monday and Thursday

// Independent count of the expected adherence, by walking the calendar (does not use the app's domain code).
const expectedAdherence = (declinedDate, setDates) => {
  const isoDay = date => new Date(`${date}T12:00:00`).getDay() || 7;
  const todayText = ymd(0);
  const monday = ymd(-(isoDay(todayText) - 1) - 21);
  let planned = 0, done = 0;
  for (let week = 0; week < 4; week++) {
    const dates = Array.from({ length: 7 }, (_, i) => { const d = new Date(`${monday}T12:00:00`); d.setDate(d.getDate() + week * 7 + i); return d.toLocaleDateString('en-CA'); })
      .filter(date => date <= todayText);
    const weekPlanned = dates.filter(date => SCHEDULE_DAYS.includes(isoDay(date)) && date !== declinedDate).length;
    planned += weekPlanned;
    done += Math.min(new Set(dates.filter(date => setDates.includes(date))).size, weekPlanned);
  }
  return { planned, done };
};

test.describe('coach insights', () => {
  test.describe.configure({ mode: 'serial' });
  let admin, memberId, todayWorkoutId;
  const ids = { catalog: [stamp + 10, stamp + 11] };
  // The most recent past planned date is declined, so it must not count as planned.
  const declinedDate = (() => { for (let i = 1; i < 28; i++) { const d = ymd(-i); if (SCHEDULE_DAYS.includes(new Date(`${d}T12:00:00`).getDay() || 7)) return d; } })();
  const todaySets = [
    { ad: names.squat, set_no: 1, weight: '110,0', reps: '5', sure: '', tip: 'Normal', tempo: '3010', rest_seconds: 90, rpe: 8 }, // decimal comma, as older rows store it
    { ad: names.squat, set_no: 2, weight: '110', reps: '5', sure: '', tip: 'Dropset', tempo: '3010', rest_seconds: 90, rpe: 8 }
  ];

  test.beforeAll(async () => {
    admin = await signIn(env.adminEmail, env.adminPassword);
    [{ id: memberId }] = await rest(admin, 'POST', 'uyeler', { ad_soyad: names.member, trainer_id: 'burak-ozcan', kayit_tarihi: ymd(0) });
    await rest(admin, 'POST', 'olcumler', { id: stamp + 1, member_id: memberId, tarih: ymd(0), weight: 80 }); // unlocks the tabs
    await rest(admin, 'POST', 'master_egzersizler', [
      { id: ids.catalog[0], ad: names.squat, brans: 'Fitness', gruplar: JSON.stringify({ muscles: ['Quad', 'Glute'] }) },
      { id: ids.catalog[1], ad: names.bench, brans: 'Fitness', gruplar: JSON.stringify({ muscles: ['Göğüs'] }) }
    ]);
    const schedules = await rest(admin, 'POST', 'weekly_program_schedule', SCHEDULE_DAYS.map((day, i) => (
      { id: stamp + 2 + i, member_id: memberId, day_of_week: day, start_time: '09:00:00', end_time: '10:00:00', branch: 'Fitness',
        created_at: `${ymd(-35)}T08:00:00+03:00` }))); // existed for the whole 4-week window (days before created_at are not planned)
    const declinedSchedule = schedules.find(s => s.day_of_week === (new Date(`${declinedDate}T12:00:00`).getDay() || 7));
    await rest(admin, 'POST', 'schedule_attendance', { id: stamp + 4, member_id: memberId, schedule_id: declinedSchedule.id, occurrence_date: declinedDate, status: 'declined' });
    const workout = (id, tarih, sablon, setler) => ({ id, member_id: memberId, tarih, sablon, setler: JSON.stringify(setler), rpe: 8, tempo: '3010', rest_seconds: 90 });
    const row = (ad, weight, reps) => ({ ad, set_no: 1, weight, reps, sure: '', tip: 'Normal', tempo: '', rest_seconds: 60, rpe: null });
    await rest(admin, 'POST', 'antrenmanlar', [
      workout(stamp + 5, ymd(-14), 'E2E Eski', [row(names.squat, '100', '5'), row(names.bench, '80', '8')]),
      workout(stamp + 6, ymd(-7), 'E2E Geçen', [row(names.bench, '80,0', '8')]), // a tie with the best weight: not a record
      workout(stamp + 7, ymd(0), 'E2E Bugün', todaySets)
    ]);
    todayWorkoutId = stamp + 7;
    // A client session today: one finished set of an exercise outside the catalog, and a cancelled session that must be ignored.
    const now = new Date().toISOString();
    await rest(admin, 'POST', 'workout_sessions', [
      { id: stamp + 8, member_id: memberId, source: 'trainer_pro', activity_type: 'strength', status: 'completed', started_at: now, ended_at: now },
      { id: stamp + 9, member_id: memberId, source: 'trainer_pro', activity_type: 'strength', status: 'cancelled', started_at: now, ended_at: null }
    ]);
    await rest(admin, 'POST', 'workout_session_steps', [
      { id: stamp + 12, workout_session_id: stamp + 8, exercise_name: names.row, step_index: 0, reps: 10, weight: 50, completed: true, completed_at: now },
      { id: stamp + 13, workout_session_id: stamp + 9, exercise_name: names.squat, step_index: 0, reps: 1, weight: 200, completed: true, completed_at: now }
    ]);
  });

  test.afterAll(async () => {
    if (memberId) await rest(admin, 'DELETE', `uyeler?id=eq.${memberId}`).catch(() => {}); // cascades to everything of the member
    for (const id of ids.catalog) await rest(admin, 'DELETE', `master_egzersizler?id=eq.${id}`).catch(() => {});
  });

  const openClient = async page => {
    page.on('dialog', dialog => dialog.accept());
    await login(page, 'admin', env.adminEmail, env.adminPassword);
    await page.locator('.member-card', { hasText: names.member }).click({ timeout: 20000 });
    await expect(page.locator('#coach-insights')).toContainText('Koç özeti');
    await expect(page.locator('#coach-insights')).toBeVisible();
  };

  test('the card shows adherence, this week\'s volume and the records with the Yeni badge', async ({ page, problems }) => {
    await openClient(page);
    const card = page.locator('#coach-insights');
    const { planned, done } = expectedAdherence(declinedDate, [ymd(0), ymd(-7), ymd(-14)]);
    await expect(card.locator('.coach-adherence')).toHaveText(`${done}/${planned} antrenman · %${Math.round(done / planned * 100)}`);

    // Volume: the squat hits two muscles (2 sets, 1100 kg each); the row is not in the catalog (Diğer); the cancelled session is ignored.
    const volume = card.locator('.coach-volume-row');
    await expect(volume).toHaveCount(3);
    await expect(volume.nth(0)).toContainText('Glute');
    await expect(volume.nth(0)).toContainText('2 set');
    await expect(volume.nth(0)).toContainText('1100 kg');
    await expect(volume.nth(1)).toContainText('Quad');
    await expect(volume.nth(2)).toContainText('Diğer');
    await expect(volume.nth(2)).toContainText('1 set');
    await expect(volume.nth(2)).toContainText('500 kg');
    await expect(card.locator('.coach-bar > span').first()).toHaveCSS('width', /^[1-9]/);

    const records = card.locator('.coach-record-row');
    await expect(records).toHaveCount(3);
    await expect(records.nth(0)).toContainText(names.row);
    await expect(records.nth(0)).toContainText('50 kg × 10');
    await expect(records.nth(0)).toContainText('Tahmini 1TM 66,5 kg');
    await expect(records.nth(0).locator('.coach-badge')).toHaveCount(0); // first-ever entry is not new
    await expect(records.nth(1)).toContainText(names.squat);
    await expect(records.nth(1)).toContainText('110 kg × 5');
    await expect(records.nth(1)).toContainText('Tahmini 1TM 128,5 kg');
    await expect(records.nth(1).locator('.coach-badge')).toHaveText('Yeni');
    await expect(records.nth(2)).toContainText(names.bench);
    await expect(records.nth(2)).toContainText('80 kg × 8');
    await expect(records.nth(2).locator('.coach-badge')).toHaveCount(0);
    await expect(card.locator('.coach-more')).toHaveCount(0);
    expect(problems.filter(p => !p.includes('Failed to load resource'))).toEqual([]);
  });

  test('Son antrenmanı tekrarla fills the form and saves a new workout dated today only when saved', async ({ page }) => {
    await openClient(page);
    await page.locator('#btn-tab-workouts').click();
    const dbRows = () => rest(admin, 'GET', `antrenmanlar?select=id,tarih,sablon,setler,rpe,tempo,rest_seconds&member_id=eq.${memberId}&tarih=eq.${ymd(0)}`);
    expect(await dbRows()).toHaveLength(1);
    await page.getByRole('button', { name: 'Son antrenmanı tekrarla' }).click();
    await expect(page.locator('#modal-workout')).toBeVisible();
    await expect(page.locator('#w-date')).toHaveValue(ymd(0));
    await expect(page.locator('#w-name')).toHaveValue('E2E Bugün');
    await expect(page.locator('.set-row-wrapper')).toHaveCount(1);
    await expect(page.locator('.set-row-wrapper .s-name')).toHaveValue(names.squat);
    await expect(page.locator('.single-set-row')).toHaveCount(2);
    await expect(page.locator('.single-set-row .s-weight').first()).toHaveValue('110');
    await expect(page.locator('.single-set-row .s-reps').nth(1)).toHaveValue('5');
    await expect(page.locator('.single-set-row .s-tip').nth(1)).toHaveValue('Dropset');
    expect(await dbRows()).toHaveLength(1); // nothing saved yet

    await page.locator('#modal-workout button[type="submit"]').click();
    await expect.poll(async () => (await dbRows()).length, { timeout: 15000 }).toBe(2);
    const created = (await dbRows()).find(r => r.id !== todayWorkoutId);
    expect(created.sablon).toBe('E2E Bugün');
    // The form re-saves the parsed number: '110,0' comes back as '110'.
    expect(JSON.parse(created.setler)).toEqual(todaySets.map(set => ({ ...set, weight: set.weight === '110,0' ? '110' : set.weight })));
    expect([created.rpe, created.tempo, created.rest_seconds]).toEqual([8, '3010', 90]);
  });

  test('a client login shows no coach card', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());
    await login(page, 'user', env.clientEmail, env.clientPassword);
    await expect(page.getByText('Hoş geldiniz')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('#coach-insights')).toBeEmpty();
    await expect(page.getByText('Koç özeti')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Son antrenmanı tekrarla' })).toBeHidden();
  });

  test('at 320 px the card fits with no sideways scroll and the new buttons are at least 44 px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await openClient(page);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await overflow()).toBeLessThanOrEqual(0);
    const box = async locator => (await locator.boundingBox());
    await page.locator('#btn-tab-workouts').click();
    for (const button of [page.getByRole('button', { name: 'Son antrenmanı tekrarla' }), page.getByRole('button', { name: /Yeni Antrenman/ })]) {
      expect((await box(button)).height).toBeGreaterThanOrEqual(44);
    }
    expect(await overflow()).toBeLessThanOrEqual(0);
  });

  test('more than eight records: the rest hides behind Tümünü göster', async ({ page }) => {
    const extra = Array.from({ length: 7 }, (_, i) => ({ id: stamp + 100 + i, member_id: memberId, tarih: ymd(-20), sablon: `E2E Ek ${i}`,
      setler: JSON.stringify([{ ad: `E2E Ek ${i} ${stamp}`, set_no: 1, weight: '20', reps: '10', sure: '', tip: 'Normal' }]) }));
    await rest(admin, 'POST', 'antrenmanlar', extra);
    await openClient(page);
    const rows = page.locator('#coach-insights .coach-record-row:visible');
    await expect(rows).toHaveCount(8);
    const more = page.getByRole('button', { name: 'Tümünü göster' });
    expect((await more.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await more.click();
    await expect(rows).toHaveCount(10);
    await expect(more).toHaveCount(0);
  });
});
