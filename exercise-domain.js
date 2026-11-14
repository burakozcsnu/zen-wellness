// @ts-check
(function () {
    'use strict';

    const parseGroups = (exercise) => {
        if (!exercise?.gruplar) return {};
        if (typeof exercise.gruplar === 'object') return exercise.gruplar;
        try {
            return JSON.parse(exercise.gruplar);
        } catch (error) {
            console.warn('[Exercise domain] Invalid exercise metadata:', exercise.ad, error);
            return {};
        }
    };

    const normalize = (exercise) => {
        const groups = parseGroups(exercise);
        return {
            ...groups,
            bodyPart: exercise.body_part || groups.bodyPart || '',
            classification: exercise.classifications?.length
                ? exercise.classifications
                : (groups.classification || []),
            style: exercise.style || groups.style || '',
            drill: exercise.drill || groups.drill || '',
            rank: groups.rank || '',
            level: exercise.difficulty || groups.level || '',
            branch: exercise.brans || groups.branch || 'Fitness',
            muscles: groups.muscles || [],
            styles: groups.styles || [],
            equipment: groups.equipment || ''
        };
    };

    const matchesFilters = (exercise, filters) => {
        const metadata = normalize(exercise);
        const equipment = metadata.equipment.split(',').map(item => item.trim());
        return (!filters.bodyPart || metadata.bodyPart === filters.bodyPart) &&
            (!filters.classification || metadata.classification.includes(filters.classification)) &&
            (!filters.muscle || metadata.muscles.includes(filters.muscle)) &&
            (!filters.branch || metadata.branch === filters.branch) &&
            (!filters.yogaStyle || metadata.styles.includes(filters.yogaStyle)) &&
            (!filters.karateDrill || metadata.drill === filters.karateDrill) &&
            (!filters.karateRank || metadata.rank === filters.karateRank) &&
            (!filters.karateStyle || metadata.style === filters.karateStyle) &&
            (!filters.equipment || equipment.includes(filters.equipment));
    };

    // --- Set logging helpers (pure) ---
    const nameKey = name => String(name || '').trim().toLocaleLowerCase('tr');

    // "62,5" / "62.5" / " 60 " / 60 -> number; empty, text and negative values -> null.
    const parseNumber = value => {
        if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
        if (typeof value !== 'string') return null;
        const text = value.trim().replace(',', '.');
        return /^\d+(\.\d+)?$/.test(text) ? Number(text) : null;
    };

    // The plan (antrenmanlar.setler) as one entry per set. Trainer shape: one element per set; older shape: { ad, set, tekrar }.
    const planSets = setler => {
        let list = setler;
        if (typeof list === 'string') {
            try { list = JSON.parse(list); } catch (error) { return []; }
        }
        if (!Array.isArray(list)) return [];
        const counts = {};
        const result = [];
        list.forEach(item => {
            if (!item || typeof item !== 'object') return;
            const exerciseName = String(item.ad || '').trim();
            const older = item.set_no === undefined && item.reps === undefined && item.weight === undefined && item.sure === undefined
                && (item.set !== undefined || item.tekrar !== undefined);
            const copies = older ? Math.max(1, Math.floor(parseNumber(item.set) || 1)) : 1;
            for (let i = 0; i < copies; i++) {
                const key = nameKey(exerciseName);
                counts[key] = (counts[key] || 0) + 1;
                result.push({
                    stepIndex: result.length,
                    exerciseName,
                    setNo: counts[key],
                    targetWeight: older ? null : parseNumber(item.weight),
                    targetReps: parseNumber(older ? item.tekrar : item.reps),
                    targetSeconds: older ? null : parseNumber(item.sure),
                    restSeconds: parseNumber(item.rest_seconds)
                });
            }
        });
        return result;
    };

    // Logged rows grouped by exercise (first appearance); the set number is the position inside the exercise.
    const groupSteps = steps => {
        const groups = new Map();
        [...(steps || [])].sort((a, b) => a.step_index - b.step_index).forEach(step => {
            const key = nameKey(step.exercise_name);
            if (!groups.has(key)) groups.set(key, { exerciseName: step.exercise_name, sets: [] });
            const group = groups.get(key);
            group.sets.push({ setNo: group.sets.length + 1, weight: step.weight, reps: step.reps,
                durationSeconds: step.duration_seconds, stepIndex: step.step_index, id: step.id });
        });
        return [...groups.values()];
    };

    // What the client lifted last time for this exercise (same set number, else that session's last set of it).
    const lastNumbers = (sessions, steps, exerciseName, setNo, excludeSessionId) => {
        const key = nameKey(exerciseName);
        const recent = [...(sessions || [])].filter(session => String(session.id) !== String(excludeSessionId))
            .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
        for (const session of recent) {
            const sets = (steps || []).filter(step => String(step.workout_session_id) === String(session.id) && nameKey(step.exercise_name) === key)
                .sort((a, b) => a.step_index - b.step_index);
            if (!sets.length) continue;
            const pick = sets[setNo - 1] || sets[sets.length - 1];
            return { weight: pick.weight, reps: pick.reps, durationSeconds: pick.duration_seconds };
        }
        return null;
    };

    const restRemaining = (endsAtMs, nowMs) => Math.max(0, Math.ceil((endsAtMs - nowMs) / 1000));
    const formatClock = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

    // Turkish number text: decimal comma, no trailing zeros.
    const formatNumber = value => String(Number(Number(value).toFixed(2))).replace('.', ',');
    const formatSet = (weight, reps, seconds) => {
        const w = parseNumber(weight);
        const r = parseNumber(reps);
        const s = parseNumber(seconds);
        const left = w ? `${formatNumber(w)} kg` : '';
        let right = '';
        if (r !== null) right = left ? formatNumber(r) : `${formatNumber(r)} tekrar`;
        else if (s !== null) right = `${formatNumber(s)} sn`;
        return [left, right].filter(Boolean).join(' × ');
    };

    // --- Coach insights (pure): performed sets, personal records, weekly volume, adherence ---
    const DAY_MS = 86400000;
    const pad2 = n => String(n).padStart(2, '0');
    const localDate = value => {
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
    };
    // Calendar arithmetic on 'YYYY-MM-DD' strings through UTC, so DST never shifts a day.
    const utcMs = text => { const [y, m, day] = text.split('-').map(Number); return Date.UTC(y, m - 1, day); };
    const addDays = (text, days) => new Date(utcMs(text) + days * DAY_MS).toISOString().slice(0, 10);
    const weekStartOf = date => {
        const text = typeof date === 'string' ? date.slice(0, 10) : localDate(date);
        return addDays(text, -((new Date(utcMs(text)).getUTCDay() + 6) % 7));
    };

    // Epley; 1 rep is the weight itself; no estimate outside 1..12 reps or without a positive weight.
    const estimateOneRepMax = (weight, reps) => {
        const w = parseNumber(weight);
        const r = parseNumber(reps);
        if (!(w > 0) || !(r >= 1) || r > 12) return null;
        return Math.round((r === 1 ? w : w * (1 + r / 30)) * 2) / 2;
    };

    // Sets from trainer-entered workouts and from client session steps, as one flat list.
    const performedSets = (workouts, sessions, steps) => {
        const result = [];
        const add = (date, name, weight, reps) => {
            if (date && (weight !== null || reps !== null)) result.push({ date, name, key: nameKey(name), weight, reps });
        };
        (workouts || []).forEach(workout => {
            const date = String(workout.tarih || '').slice(0, 10);
            planSets(workout.setler).forEach(set => add(date, set.exerciseName, set.targetWeight, set.targetReps));
        });
        const byId = new Map((sessions || []).map(session => [String(session.id), session]));
        (steps || []).forEach(step => {
            const session = byId.get(String(step.workout_session_id));
            if (!step.completed || !session || (session.status !== 'completed' && session.status !== 'active')) return;
            add(localDate(step.completed_at || session.started_at), step.exercise_name, parseNumber(step.weight), parseNumber(step.reps));
        });
        return result;
    };

    // Earliest set that reached the highest value of `score` (a later tie does not move the record).
    const bestBy = (sets, score) => sets.reduce((best, set) => {
        const value = score(set);
        if (value === null) return best;
        return !best || value > best.value || (value === best.value && set.date < best.date) ? { value, set } : best;
    }, null);
    const maxOf = (sets, score) => sets.reduce((max, set) => Math.max(max, score(set) ?? -Infinity), -Infinity);

    const personalRecords = (sets, today) => {
        const windowStart = addDays(today, -6);
        const groups = new Map();
        (sets || []).filter(set => set.weight > 0 && set.date <= today).forEach(set => {
            if (!groups.has(set.key)) groups.set(set.key, []);
            groups.get(set.key).push(set);
        });
        const e1rmOf = set => estimateOneRepMax(set.weight, set.reps);
        const records = [...groups.values()].map(list => {
            // Heaviest set; at equal weight the most reps (100 kg x 8 beats 100 kg x 3); then the earliest date.
            const top = list.reduce((best, set) => {
                if (!best) return set;
                const order = set.weight - best.weight || (set.reps || 0) - (best.reps || 0) || best.date.localeCompare(set.date);
                return order > 0 ? set : best;
            }, null);
            const weight = { value: top.weight, set: top };
            const e1rm = bestBy(list, e1rmOf);
            const before = list.filter(set => set.date < windowStart);
            const recent = list.filter(set => set.date >= windowStart);
            // An e1RM only counts as beaten when the earlier history had one (sets above 12 reps have none).
            const beats = (score) => { const old = maxOf(before, score); return Number.isFinite(old) && maxOf(recent, score) > old; };
            const isNew = before.length > 0 && recent.length > 0 && (beats(set => set.weight) || beats(e1rmOf));
            return {
                name: weight.set.name,
                key: weight.set.key,
                bestWeight: { value: weight.value, reps: weight.set.reps, date: weight.set.date },
                bestE1rm: e1rm ? { value: e1rm.value, date: e1rm.set.date } : null,
                isNew,
                lastRecordDate: e1rm && e1rm.set.date > weight.set.date ? e1rm.set.date : weight.set.date
            };
        });
        return records.sort((a, b) => b.lastRecordDate.localeCompare(a.lastRecordDate) || a.name.localeCompare(b.name, 'tr'));
    };

    const weeklyVolume = (sets, muscleMap, weekStart) => {
        const weekEnd = addDays(weekStart, 6);
        const totals = new Map();
        (sets || []).filter(set => set.date >= weekStart && set.date <= weekEnd).forEach(set => {
            const muscles = muscleMap?.get(set.key);
            // A set counts fully for every muscle it hits (the usual "sets per muscle" convention).
            (muscles && muscles.length ? muscles : ['Diğer']).forEach(muscle => {
                const row = totals.get(muscle) || { muscle, sets: 0, tonnage: 0 };
                row.sets += 1;
                row.tonnage += set.weight !== null && set.reps !== null ? set.weight * set.reps : 0;
                totals.set(muscle, row);
            });
        });
        return [...totals.values()].sort((a, b) => b.sets - a.sets || a.muscle.localeCompare(b.muscle, 'tr'));
    };

    const adherence = (schedules, attendance, sets, today, weeks = 4) => {
        const declined = new Set((attendance || []).filter(row => row.status === 'declined')
            .map(row => `${row.schedule_id}|${String(row.occurrence_date).slice(0, 10)}`));
        const perWeek = [];
        for (let i = weeks - 1; i >= 0; i--) {
            const weekStart = addDays(weekStartOf(today), -7 * i);
            const doneDates = new Set();
            let planned = 0;
            for (let day = 0; day < 7; day++) {
                const date = addDays(weekStart, day);
                if (date > today) break;
                // A schedule row is planned only from the day it was created.
                planned += (schedules || []).filter(s => Number(s.day_of_week) === day + 1 && !declined.has(`${s.id}|${date}`) &&
                    !(s.created_at && localDate(s.created_at) > date)).length;
                if ((sets || []).some(set => set.date === date)) doneDates.add(date);
            }
            perWeek.push({ weekStart, planned, done: Math.min(doneDates.size, planned) });
        }
        const planned = perWeek.reduce((sum, week) => sum + week.planned, 0);
        const done = perWeek.reduce((sum, week) => sum + week.done, 0);
        return { planned, done, ratio: planned ? done / planned : null, perWeek };
    };

    const lastWorkout = workouts => (workouts || []).reduce((best, row) => {
        if (!best) return row;
        const byDate = String(row.tarih).localeCompare(String(best.tarih));
        const byId = Number(row.id) - Number(best.id) || String(row.id).localeCompare(String(best.id));
        return (byDate || byId) > 0 ? row : best;
    }, null);

    window.TrainerProExerciseDomain = { normalize, matchesFilters, parseNumber, planSets, groupSteps, lastNumbers, restRemaining, formatClock, formatNumber, formatSet,
        performedSets, estimateOneRepMax, personalRecords, weeklyVolume, adherence, lastWorkout, weekStartOf };
})();
