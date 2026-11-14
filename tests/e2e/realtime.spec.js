// Live sync between two open sessions: a change made in one window shows up in the other without a reload.
const { test, expect, login, attachTestProject } = require('./fixtures');
const { env: testEnv, signIn, rest } = require('../helpers/api');

test('a client added in one trainer window appears in the other, and so does a rename', async ({ page, browser, env, problems }) => {
  page.on('dialog', dialog => dialog.accept());
  const name = `E2E Canlı ${Date.now()}`;
  const admin = await signIn(testEnv.adminEmail, testEnv.adminPassword);
  let memberId;

  // Window B: a second trainer session, already looking at the client list.
  const contextB = await browser.newContext({ baseURL: 'http://localhost:3111' });
  const pageB = await contextB.newPage();
  const problemsB = [];
  await attachTestProject(pageB, env, problemsB);
  await login(pageB, 'admin', env.adminEmail, env.adminPassword);
  await expect(pageB.locator('.member-card').first()).toBeVisible({ timeout: 20000 });
  await expect(pageB.locator('.member-card', { hasText: name })).toHaveCount(0);

  try {
    // Window A adds a client through the form.
    await login(page, 'admin', env.adminEmail, env.adminPassword);
    await expect(page.locator('.member-card').first()).toBeVisible({ timeout: 20000 });
    await page.locator('.fab').click();
    await page.locator('#m-name').fill(name);
    await page.locator('#m-reg-date').fill('2026-03-01');
    await page.locator('#modal-member button[type="submit"]').click();
    await expect(page.locator('.member-card', { hasText: name })).toBeVisible({ timeout: 15000 });
    [{ id: memberId }] = await rest(admin, 'GET', `uyeler?select=id&ad_soyad=eq.${encodeURIComponent(name)}`);

    // Window B was never touched: no reload, no click.
    await expect(pageB.locator('.member-card', { hasText: name })).toBeVisible({ timeout: 20000 });

    // A change that bypasses both windows (another device or the client themselves) also arrives.
    await rest(admin, 'PATCH', `uyeler?id=eq.${memberId}`, { ad_soyad: `${name} yeni ad` });
    await expect(pageB.locator('.member-card', { hasText: `${name} yeni ad` })).toBeVisible({ timeout: 20000 });
    await expect(page.locator('.member-card', { hasText: `${name} yeni ad` })).toBeVisible({ timeout: 20000 });

    // And a deletion disappears from both.
    await rest(admin, 'DELETE', `uyeler?id=eq.${memberId}`);
    memberId = null;
    await expect(pageB.locator('.member-card', { hasText: name })).toHaveCount(0, { timeout: 20000 });
    await expect(page.locator('.member-card', { hasText: name })).toHaveCount(0, { timeout: 20000 });
    expect(problems.filter(p => !p.includes('Failed to load resource'))).toEqual([]);
    expect(problemsB.filter(p => !p.includes('Failed to load resource'))).toEqual([]);
  } finally {
    if (memberId) await rest(admin, 'DELETE', `uyeler?id=eq.${memberId}`).catch(() => {});
    await contextB.close();
  }
});

test('a set the client logs reaches the open trainer profile without a reload, and another client\'s sets never show', async ({ page, env, problems }) => {
  const stamp = Date.now();
  const title = `E2E Kayıt ${stamp}`;
  const admin = await signIn(testEnv.adminEmail, testEnv.adminPassword);
  const client = await signIn(testEnv.clientEmail, testEnv.clientPassword);
  const [{ id: memberId }] = await rest(admin, 'GET', `uyeler?select=id&email=eq.${encodeURIComponent(testEnv.clientEmail)}`);
  const [other] = await rest(admin, 'GET', `uyeler?select=id&email=neq.${encodeURIComponent(testEnv.clientEmail)}&auth_user_id=not.is.null&limit=1`);
  const ids = { workout: stamp, mine: stamp + 1, other: stamp + 2 };
  const step = (n, weight) => ({ id: stamp + 10 + n, workout_session_id: ids.mine, step_index: n, exercise_name: 'E2E Squat', sets: 1, reps: 8, weight, completed: true, completed_at: new Date().toISOString() });
  const session = (id, member_id) => ({ id, member_id, source: 'trainer_pro', activity_type: 'traditional_strength', status: 'active', started_at: new Date().toISOString(), metadata: { workoutId: ids.workout } });
  const card = page.locator('#member-sessions-card');
  try {
    await rest(admin, 'POST', 'antrenmanlar', { id: ids.workout, member_id: memberId, tarih: '2099-12-30', sablon: title, setler: '[]' });
    await login(page, 'admin', env.adminEmail, env.adminPassword);
    await page.locator(`.member-card[onclick*="openProfile(${memberId})"]`).click({ timeout: 20000 });
    await page.locator('#btn-tab-workouts').click();
    await expect(card).toContainText('Danışan henüz antrenman kaydı girmedi.');

    // The other client's session (with a step) must not appear on this profile.
    expect(other, 'zen-test needs a second client with a login for the isolation check').toBeTruthy();
    await rest(admin, 'POST', 'workout_sessions', session(ids.other, other.id));
    await rest(admin, 'POST', 'workout_session_steps', { ...step(0, 99), id: stamp + 99, workout_session_id: ids.other });
    await rest(client, 'POST', 'workout_sessions', session(ids.mine, memberId));
    await page.waitForTimeout(1500); // the session event's own refresh finds no steps yet
    await rest(client, 'POST', 'workout_session_steps', [step(0, 60), step(1, '62.5')]);
    await expect(card).toContainText(title, { timeout: 10000 });
    await expect(card).toContainText('2 set');
    await expect(card).toContainText('Devam ediyor');
    await expect(card).toContainText('E2E Squat: 60 kg × 8 · 62,5 kg × 8');
    await expect(card).not.toContainText('99 kg');

    await rest(client, 'POST', 'workout_session_steps', step(2, 65));
    await expect(card).toContainText('3 set', { timeout: 10000 });
    expect(problems.filter(p => !p.includes('Failed to load resource'))).toEqual([]);
  } finally {
    for (const id of [ids.mine, ids.other]) await rest(admin, 'DELETE', `workout_sessions?id=eq.${id}`).catch(() => {});
    await rest(admin, 'DELETE', `antrenmanlar?id=eq.${ids.workout}`).catch(() => {});
  }
});
