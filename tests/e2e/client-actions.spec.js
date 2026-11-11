// What a client does in their own portal, from the button to the database: tick exercises, confirm attendance, notification opt-in.
const { test, expect, login } = require('./fixtures');
const { env, signIn, rest } = require('../helpers/api');

const today = () => new Date().toLocaleDateString('en-CA'); // same local date the app uses
const weekday = () => new Date().getDay() || 7; // 1=Mon..7=Sun, as the app stores it

test.describe('client portal actions', () => {
  test.describe.configure({ mode: 'serial' });
  let admin, memberId, workoutId, scheduleId;
  const created = [];

  test.beforeAll(async () => {
    admin = await signIn(env.adminEmail, env.adminPassword);
    [{ id: memberId }] = await rest(admin, 'GET', `uyeler?select=id&email=eq.${encodeURIComponent(env.clientEmail)}`);
    // A workout dated today with two exercises, and a session on today's weekday: the trainer's side of the story.
    const [workout] = await rest(admin, 'POST', 'antrenmanlar', {
      id: Date.now(), member_id: memberId, tarih: today(), sablon: 'E2E Antrenman',
      setler: [{ ad: 'E2E Squat', tekrar: 10, set: 3 }, { ad: 'E2E Row', tekrar: 8, set: 3 }]
    });
    workoutId = workout.id;
    created.push(['antrenmanlar', workoutId]);
    const [schedule] = await rest(admin, 'POST', 'weekly_program_schedule', {
      id: Date.now() + 1, member_id: memberId, day_of_week: weekday(), start_time: '10:00:00', end_time: '11:00:00', branch: 'Fitness'
    });
    scheduleId = schedule.id;
    created.push(['weekly_program_schedule', scheduleId]);
    // The monthly-measurement rule must not get in the way for the trainer; the client portal does not enforce it.
  });

  test.afterAll(async () => {
    // Completions and attendance cascade with the workout and the schedule.
    for (const [table, id] of created.reverse()) await rest(admin, 'DELETE', `${table}?id=eq.${id}`).catch(() => {});
  });

  test('ticking an exercise saves it, and ticking again undoes it', async ({ page, problems }) => {
    page.on('dialog', dialog => dialog.accept());
    await login(page, 'user', env.clientEmail, env.clientPassword);
    await expect(page.getByText('Hoş geldiniz')).toBeVisible({ timeout: 20000 });
    await page.locator('[data-portal-tab="workouts"]').click();
    const squat = page.locator('.member-exercise-item', { hasText: 'E2E Squat' });
    const row = page.locator('.member-exercise-item', { hasText: 'E2E Row' });
    await expect(squat.getByRole('button')).toHaveText('Tamamla');

    await squat.getByRole('button').click();
    await expect(squat.getByRole('button')).toHaveText('Tamamlandı ✓');
    let completions = await rest(admin, 'GET', `workout_completions?select=exercise_index,completed,completion_date&member_id=eq.${memberId}&workout_id=eq.${workoutId}`);
    expect(completions).toEqual([{ exercise_index: 0, completed: true, completion_date: today() }]);
    await expect(row.getByRole('button')).toHaveText('Tamamla'); // the other exercise is untouched

    await squat.getByRole('button').click(); // untick
    await expect(squat.getByRole('button')).toHaveText('Tamamla');
    completions = await rest(admin, 'GET', `workout_completions?select=completed&member_id=eq.${memberId}&workout_id=eq.${workoutId}&exercise_index=eq.0`);
    expect(completions).toEqual([{ completed: false }]);
    expect(problems.filter(p => !p.includes('Failed to load resource'))).toEqual([]);
  });

  test('confirming and declining a session is saved for that day', async ({ page }) => {
    page.on('dialog', dialog => dialog.accept());
    await login(page, 'user', env.clientEmail, env.clientPassword);
    await expect(page.getByText('Hoş geldiniz')).toBeVisible({ timeout: 20000 });
    await page.locator('[data-portal-tab="schedule"]').click();
    const session = page.locator('.member-calendar-session', { hasText: '10:00' });
    await expect(session.getByRole('button')).toHaveText('Katılacağım');

    await session.getByRole('button').click();
    await expect(session.getByRole('button')).toHaveText('Katılacağım ✓');
    let rows = await rest(admin, 'GET', `schedule_attendance?select=status,occurrence_date&member_id=eq.${memberId}&schedule_id=eq.${scheduleId}`);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('attending');
    expect(rows[0].occurrence_date).toBe(today()); // today's weekday: the next occurrence is today

    await session.getByRole('button').click(); // changes to "won't attend"
    await expect(session.getByRole('button')).toHaveText('Katılmayacağım');
    rows = await rest(admin, 'GET', `schedule_attendance?select=status&member_id=eq.${memberId}&schedule_id=eq.${scheduleId}`);
    expect(rows).toEqual([{ status: 'declined' }]);
  });

  test('notification opt-in answers with a clear message and never crashes the portal', async ({ page, context }) => {
    // Headless Chromium has no real push service, so a subscription cannot succeed here; what matters is the behavior.
    await context.grantPermissions(['notifications']);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await login(page, 'user', env.clientEmail, env.clientPassword);
    await expect(page.getByText('Hoş geldiniz')).toBeVisible({ timeout: 20000 });
    await page.getByRole('button', { name: 'Bildirimleri etkinleştir' }).click();
    const status = page.locator('#member-notification-status');
    await expect(status).not.toBeEmpty({ timeout: 20000 });
    console.log(`  notification status shown: "${(await status.textContent()).trim()}"`);
    expect(errors).toEqual([]);
    await expect(page.getByText('Hoş geldiniz')).toBeVisible(); // portal still alive
  });
});
