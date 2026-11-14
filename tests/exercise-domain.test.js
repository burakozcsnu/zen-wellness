// Pure set-logging helpers in exercise-domain.js.
process.env.TZ = 'Europe/Istanbul';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const context = { window: {}, Date, Math, String, Number, JSON, Array, Map, Object, Boolean, Infinity, Set };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'exercise-domain.js'), 'utf8'), context);
const d = context.window.TrainerProExerciseDomain;
const plain = value => JSON.parse(JSON.stringify(value));

test('parseNumber accepts comma, dot, spaces and numbers; rejects the rest', () => {
  assert.equal(d.parseNumber('62,5'), 62.5);
  assert.equal(d.parseNumber('62.5'), 62.5);
  assert.equal(d.parseNumber(' 60 '), 60);
  assert.equal(d.parseNumber(8), 8);
  assert.equal(d.parseNumber('0'), 0);
  for (const bad of ['', null, undefined, 'abc', '-5', -5, '5kg', NaN]) assert.equal(d.parseNumber(bad), null, String(bad));
});

test('planSets reads the trainer shape (array or string), one entry per set', () => {
  const plan = [
    { ad: 'E2E Squat', set_no: 1, weight: '60', reps: '8', sure: '', rest_seconds: 90 },
    { ad: 'E2E Squat', set_no: 2, weight: '62,5', reps: '6', sure: '' },
    { ad: 'E2E Plank', set_no: 1, weight: '', reps: '', sure: '30' }
  ];
  const expected = [
    { stepIndex: 0, exerciseName: 'E2E Squat', setNo: 1, targetWeight: 60, targetReps: 8, targetSeconds: null, restSeconds: 90 },
    { stepIndex: 1, exerciseName: 'E2E Squat', setNo: 2, targetWeight: 62.5, targetReps: 6, targetSeconds: null, restSeconds: null },
    { stepIndex: 2, exerciseName: 'E2E Plank', setNo: 1, targetWeight: null, targetReps: null, targetSeconds: 30, restSeconds: null }
  ];
  assert.deepEqual(plain(d.planSets(plan)), expected);
  assert.deepEqual(plain(d.planSets(JSON.stringify(plan))), expected);
});

test('planSets expands the older shape into one entry per set (at least one)', () => {
  const plan = d.planSets([{ ad: 'E2E Row', set: 3, tekrar: 10 }, { ad: 'E2E Row 2', tekrar: '12' }, { ad: 'E2E Row', set: 0, tekrar: 5 }]);
  assert.deepEqual(plain(plan.map(item => [item.stepIndex, item.exerciseName, item.setNo, item.targetReps])),
    [[0, 'E2E Row', 1, 10], [1, 'E2E Row', 2, 10], [2, 'E2E Row', 3, 10], [3, 'E2E Row 2', 1, 12], [4, 'E2E Row', 4, 5]]);
});

test('planSets gives [] for bad JSON, empty and non-lists', () => {
  for (const bad of ['{oops', '', '[]', null, undefined, 5, {}]) assert.deepEqual(plain(d.planSets(bad)), [], String(bad));
});

test('groupSteps groups by exercise in step order, numbering the sets', () => {
  const steps = [
    { id: 3, step_index: 2, exercise_name: 'E2E Row', weight: 40, reps: 10, duration_seconds: null },
    { id: 1, step_index: 0, exercise_name: 'E2E Squat', weight: 60, reps: 8, duration_seconds: null },
    { id: 2, step_index: 1, exercise_name: 'e2e squat', weight: 62.5, reps: 6, duration_seconds: null }
  ];
  const groups = plain(d.groupSteps(steps));
  assert.deepEqual(groups.map(group => [group.exerciseName, group.sets.map(set => [set.setNo, set.id, set.stepIndex])]),
    [['E2E Squat', [[1, 1, 0], [2, 2, 1]]], ['E2E Row', [[1, 3, 2]]]]);
  assert.deepEqual(plain(d.groupSteps([])), []);
});

test('lastNumbers takes the most recent other session with that exercise', () => {
  const sessions = [
    { id: 1, started_at: '2026-11-01T10:00:00Z' },
    { id: 2, started_at: '2026-11-05T10:00:00Z' },
    { id: 3, started_at: '2026-11-09T10:00:00Z' },
    { id: 4, started_at: '2026-11-10T10:00:00Z' }
  ];
  const steps = [
    { workout_session_id: 1, exercise_name: 'E2E Squat', step_index: 0, weight: 50, reps: 10, duration_seconds: null },
    { workout_session_id: 2, exercise_name: 'E2E Squat', step_index: 0, weight: 60, reps: 8, duration_seconds: null },
    { workout_session_id: 2, exercise_name: 'E2E Squat', step_index: 1, weight: 62.5, reps: 6, duration_seconds: null },
    { workout_session_id: 3, exercise_name: 'E2E Row', step_index: 0, weight: 30, reps: 12, duration_seconds: null },
    { workout_session_id: 4, exercise_name: 'E2E Squat', step_index: 0, weight: 99, reps: 1, duration_seconds: null }
  ];
  assert.deepEqual(plain(d.lastNumbers(sessions, steps, ' e2e SQUAT ', 2, 4)), { weight: 62.5, reps: 6, durationSeconds: null });
  assert.deepEqual(plain(d.lastNumbers(sessions, steps, 'E2E Squat', 1, 4)), { weight: 60, reps: 8, durationSeconds: null });
  assert.deepEqual(plain(d.lastNumbers(sessions, steps, 'E2E Squat', 5, 4)), { weight: 62.5, reps: 6, durationSeconds: null }, 'falls back to the last set');
  assert.equal(d.lastNumbers(sessions, steps, 'E2E Squat', 1, 2) && d.lastNumbers(sessions, steps, 'E2E Squat', 1, 2).weight, 99, 'the excluded session is skipped, newest other wins');
  assert.equal(d.lastNumbers(sessions, steps, 'E2E Lunge', 1, 4), null);
});

test('restRemaining never goes below 0 and formatClock is m:ss', () => {
  assert.equal(d.restRemaining(10000, 7500), 3);
  assert.equal(d.restRemaining(10000, 10000), 0);
  assert.equal(d.restRemaining(10000, 20000), 0);
  assert.equal(d.formatClock(0), '0:00');
  assert.equal(d.formatClock(65), '1:05');
  assert.equal(d.formatClock(600), '10:00');
});

test('formatSet writes sets the Turkish way', () => {
  assert.equal(d.formatSet(60, 8, null), '60 kg × 8');
  assert.equal(d.formatSet('62,5', '8', ''), '62,5 kg × 8');
  assert.equal(d.formatSet(null, 8, null), '8 tekrar');
  assert.equal(d.formatSet(null, null, 30), '30 sn');
  assert.equal(d.formatSet(60, null, 30), '60 kg × 30 sn');
  assert.equal(d.formatSet(null, null, null), '');
  assert.equal(d.formatSet('', '', ''), '');
});

// --- Coach insights ---
const set = (date, name, weight, reps) => ({ date, name, key: name.toLocaleLowerCase('tr'), weight, reps });
const TODAY = '2026-11-14'; // a Saturday; its week starts Monday 2026-11-09

test('weekStartOf gives the Monday; Sunday belongs to the week that began the Monday before', () => {
  assert.equal(d.weekStartOf('2026-11-09'), '2026-11-09');
  assert.equal(d.weekStartOf('2026-11-14'), '2026-11-09');
  assert.equal(d.weekStartOf('2026-11-15'), '2026-11-09');
  assert.equal(d.weekStartOf('2026-11-16'), '2026-11-16');
  assert.equal(d.weekStartOf('2026-01-01'), '2025-12-29');
});

test('estimateOneRepMax: Epley, rounded to 0.5, with limits', () => {
  assert.equal(d.estimateOneRepMax(100, 5), 116.5); // 116.67 -> 116.5
  assert.equal(d.estimateOneRepMax('62,5', '8'), 79); // 79.17 -> 79
  assert.equal(d.estimateOneRepMax(100, 1), 100);
  assert.equal(d.estimateOneRepMax(100, 12), 140);
  assert.equal(d.estimateOneRepMax(100, 13), null);
  assert.equal(d.estimateOneRepMax(100, 0), null);
  assert.equal(d.estimateOneRepMax(0, 5), null);
  assert.equal(d.estimateOneRepMax(null, 5), null);
  assert.equal(d.estimateOneRepMax(100, null), null);
});

test('performedSets reads trainer rows: decimal comma, JSON string, legacy shape, empty sets skipped', () => {
  const workouts = [
    { tarih: '2026-11-10', setler: [{ ad: 'E2E Squat', weight: '62,5', reps: '8' }, { ad: 'E2E Squat' }, { ad: 'E2E Plank', sure: '30' }] },
    { tarih: '2026-11-11', setler: JSON.stringify([{ ad: 'E2E Row', set: 2, tekrar: 10 }]) }
  ];
  assert.deepEqual(plain(d.performedSets(workouts, [], [])), [
    { date: '2026-11-10', name: 'E2E Squat', key: 'e2e squat', weight: 62.5, reps: 8 },
    { date: '2026-11-11', name: 'E2E Row', key: 'e2e row', weight: null, reps: 10 },
    { date: '2026-11-11', name: 'E2E Row', key: 'e2e row', weight: null, reps: 10 }
  ]);
});

test('performedSets reads session steps: skips incomplete, cancelled and unknown sessions; local date', () => {
  const sessions = [
    { id: 's1', status: 'completed', started_at: '2026-11-10T08:00:00Z' },
    { id: 's2', status: 'cancelled', started_at: '2026-11-10T08:00:00Z' },
    { id: 's3', status: 'active', started_at: '2026-11-12T09:00:00Z' }
  ];
  const steps = [
    { workout_session_id: 's1', exercise_name: 'E2E Bench', weight: 50, reps: 5, completed: true, completed_at: '2026-11-10T21:30:00Z' }, // 00:30 next day in Istanbul
    { workout_session_id: 's1', exercise_name: 'E2E Bench', weight: 50, reps: 5, completed: false },
    { workout_session_id: 's2', exercise_name: 'E2E Bench', weight: 90, reps: 5, completed: true },
    { workout_session_id: 'nope', exercise_name: 'E2E Bench', weight: 90, reps: 5, completed: true },
    { workout_session_id: 's3', exercise_name: 'E2E Bench', weight: null, reps: 12, completed: true, completed_at: null },
    { workout_session_id: 's3', exercise_name: 'E2E Bench', weight: null, reps: null, completed: true }
  ];
  assert.deepEqual(plain(d.performedSets([], sessions, steps)), [
    { date: '2026-11-11', name: 'E2E Bench', key: 'e2e bench', weight: 50, reps: 5 },
    { date: '2026-11-12', name: 'E2E Bench', key: 'e2e bench', weight: null, reps: 12 }
  ]);
});

test('personalRecords: best weight, best e1RM, sorted by last record date then name', () => {
  const sets = [
    set('2026-10-01', 'E2E Squat', 100, 5), set('2026-10-20', 'E2E Squat', 100, 8),
    set('2026-10-05', 'E2E Bench', 60, 10), set('2026-10-05', 'E2E Deadlift', 120, 3),
    set('2026-10-06', 'E2E Plank', null, 30), set('2026-10-06', 'E2E Run', 0, 10)
  ];
  const result = plain(d.personalRecords(sets, TODAY));
  assert.deepEqual(result.map(r => r.name), ['E2E Squat', 'E2E Bench', 'E2E Deadlift']); // Bench/Deadlift tie on date -> name
  assert.deepEqual(result[0].bestWeight, { value: 100, reps: 8, date: '2026-10-20' }); // equal weight: more reps wins
  assert.deepEqual(result[0].bestE1rm, { value: 126.5, date: '2026-10-20' }); // 100 x 8 = 126.67
  assert.equal(result[0].lastRecordDate, '2026-10-20');
  assert.equal(result[2].bestE1rm.value, 132); // 120 x 3
  assert.equal(result[0].isNew, false);
});

test('personalRecords: e1RM is null when every set is above 12 reps', () => {
  const [record] = d.personalRecords([set('2026-10-01', 'E2E Curl', 20, 15)], TODAY);
  assert.equal(record.bestE1rm, null);
  assert.equal(record.bestWeight.value, 20);
});

test('personalRecords isNew: higher weight or higher e1RM inside the 7 days, strictly', () => {
  const old = set('2026-10-01', 'E2E Squat', 100, 5);
  const isNew = extra => d.personalRecords([old, ...extra], TODAY)[0].isNew;
  assert.equal(isNew([set('2026-11-12', 'E2E Squat', 105, 3)]), true); // heavier
  assert.equal(isNew([set('2026-11-12', 'E2E Squat', 100, 8)]), true); // same weight, better e1RM
  assert.equal(isNew([set('2026-11-08', 'E2E Squat', 105, 3)]), true); // first day of the window
  assert.equal(isNew([set('2026-11-07', 'E2E Squat', 105, 3)]), false); // just outside the window
  assert.equal(isNew([set('2026-11-12', 'E2E Squat', 100, 5)]), false); // tie for best weight
  assert.equal(isNew([set('2026-11-12', 'E2E Squat', 90, 5)]), false); // lower
  assert.equal(isNew([set('2026-11-15', 'E2E Squat', 200, 5)]), false); // future date is ignored
});

test('personalRecords isNew: an e1RM is not new when the earlier history had no e1RM (all above 12 reps)', () => {
  const sets = [set('2026-10-01', 'E2E Curl', 60, 15), set('2026-11-12', 'E2E Curl', 50, 10)];
  assert.equal(d.personalRecords(sets, TODAY)[0].isNew, false);
});

test('adherence: a schedule row counts as planned only from the day it was created', () => {
  const schedules = [{ id: 'a', day_of_week: 1, created_at: '2026-11-02T09:00:00+03:00' }]; // Monday 2 Nov
  const result = d.adherence(schedules, [], [], TODAY);
  assert.equal(result.planned, 2); // Mondays 2 and 9 Nov; 19 and 26 Oct were before the row existed
});

test('personalRecords: a first-ever entry is not new', () => {
  assert.equal(d.personalRecords([set('2026-11-12', 'E2E Squat', 100, 5)], TODAY)[0].isNew, false);
});

test('weeklyVolume: sets and tonnage per muscle, multi-muscle, unmapped, week bounds, sort', () => {
  const muscleMap = new Map([['e2e squat', ['Quad', 'Glute']], ['e2e bench', ['Göğüs']], ['e2e empty', []]]);
  const sets = [
    set('2026-11-09', 'E2E Squat', 100, 5), set('2026-11-15', 'E2E Squat', 100, 5),
    set('2026-11-10', 'E2E Bench', 60, 10), set('2026-11-10', 'E2E Bench', null, 10),
    set('2026-11-11', 'E2E Mystery', 10, 10), set('2026-11-11', 'E2E Empty', 10, 10),
    set('2026-11-08', 'E2E Bench', 999, 9), set('2026-11-16', 'E2E Bench', 999, 9) // outside the week
  ];
  assert.deepEqual(plain(d.weeklyVolume(sets, muscleMap, '2026-11-09')), [
    { muscle: 'Diğer', sets: 2, tonnage: 200 },
    { muscle: 'Glute', sets: 2, tonnage: 1000 },
    { muscle: 'Göğüs', sets: 2, tonnage: 600 },
    { muscle: 'Quad', sets: 2, tonnage: 1000 }
  ]);
  assert.deepEqual(plain(d.weeklyVolume([], muscleMap, '2026-11-09')), []);
  const more = d.weeklyVolume([set('2026-11-09', 'E2E Bench', 10, 1), set('2026-11-10', 'E2E Bench', 10, 1), set('2026-11-10', 'E2E Squat', 10, 1)], muscleMap, '2026-11-09');
  assert.equal(more[0].muscle, 'Göğüs'); // most sets first
});

test('adherence: planned from the schedule, declined removed, done capped, current week only up to today', () => {
  const schedules = [{ id: 'a', day_of_week: 1 }, { id: 'b', day_of_week: 3 }, { id: 'c', day_of_week: 7 }];
  const attendance = [
    { schedule_id: 'a', occurrence_date: '2026-11-02', status: 'declined' },
    { schedule_id: 'b', occurrence_date: '2026-11-04', status: 'attended' }, // not declined: still planned
    { schedule_id: 'b', occurrence_date: '2026-11-11', status: 'declined' }
  ];
  const sets = [
    set('2026-10-19', 'E2E Squat', 50, 5), set('2026-10-19', 'E2E Bench', 50, 5), // one date, two sets
    set('2026-10-21', 'E2E Squat', 50, 5), set('2026-10-23', 'E2E Squat', 50, 5),
    set('2026-11-04', 'E2E Squat', 50, 5), set('2026-11-09', 'E2E Squat', 50, 5)
  ];
  const result = plain(d.adherence(schedules, attendance, sets, TODAY));
  assert.deepEqual(result.perWeek, [
    { weekStart: '2026-10-19', planned: 3, done: 3 },
    { weekStart: '2026-10-26', planned: 3, done: 0 },
    { weekStart: '2026-11-02', planned: 2, done: 1 }, // Mon declined; Wed and Sun planned
    { weekStart: '2026-11-09', planned: 1, done: 1 } // Mon only: Wed declined, Sun is after today
  ]);
  assert.equal(result.planned, 9);
  assert.equal(result.done, 5);
  assert.equal(result.ratio, 5 / 9);
});

test('adherence: done never exceeds planned; Sunday counts in the week that began on Monday; ratio null when nothing planned', () => {
  const extra = [set('2026-11-02', 'E2E Squat', 50, 5), set('2026-11-03', 'E2E Squat', 50, 5), set('2026-11-04', 'E2E Squat', 50, 5)];
  assert.equal(d.adherence([{ id: 'a', day_of_week: 1 }], [], extra, '2026-11-08', 1).perWeek[0].done, 1);
  const sunday = plain(d.adherence([{ id: 'c', day_of_week: 7 }], [], [set('2026-11-08', 'E2E Squat', 50, 5)], '2026-11-08', 1));
  assert.deepEqual(sunday.perWeek, [{ weekStart: '2026-11-02', planned: 1, done: 1 }]);
  const monday = plain(d.adherence([{ id: 'c', day_of_week: 7 }], [], [], '2026-11-09', 1));
  assert.deepEqual(monday.perWeek, [{ weekStart: '2026-11-09', planned: 0, done: 0 }]);
  assert.equal(monday.ratio, null);
});

test('lastWorkout: latest tarih, tie goes to the highest id, empty gives null', () => {
  const rows = [{ id: 1, tarih: '2026-11-01' }, { id: 5, tarih: '2026-11-10' }, { id: 9, tarih: '2026-11-10' }, { id: 12, tarih: '2026-11-02' }];
  assert.equal(d.lastWorkout(rows).id, 9);
  assert.equal(d.lastWorkout([]), null);
});
