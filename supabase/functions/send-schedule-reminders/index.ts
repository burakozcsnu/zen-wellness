import webpush from 'npm:web-push@3.6.7';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('DATABASE_SECRET_KEY')
    || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@zenwellnessclub.com';
const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
const timezone = Deno.env.get('SCHEDULE_TIMEZONE') || 'Europe/Istanbul';
const cronSecret = Deno.env.get('CRON_SECRET');

if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey || !cronSecret) {
    throw new Error('SUPABASE_URL, DATABASE_SECRET_KEY, VAPID_* and CRON_SECRET are required.');
}

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

const headers = {
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
    'Content-Type': 'application/json'
};

const getParts = (date: Date) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
}).formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));

const dayMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const occurrenceKey = (date: Date) => {
    const parts = getParts(date);
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
};

const scheduleOccurrence = (dayOfWeek: number, time: string, now: Date) => {
    for (let offset = 0; offset <= 7; offset += 1) {
        const candidate = new Date(now.getTime() + offset * 86400000);
        const parts = getParts(candidate);
        if (dayMap[parts.weekday] !== dayOfWeek) continue;
        const candidateKey = `${parts.year}-${parts.month}-${parts.day}T${time.slice(0, 5)}`;
        for (let minuteOffset = -180; minuteOffset <= 180; minuteOffset += 30) {
            const probe = new Date(candidate.getTime() + minuteOffset * 60000);
            if (occurrenceKey(probe) === candidateKey) return probe;
        }
    }
    return null;
};

const fetchJson = async (path: string, options: RequestInit = {}) => {
    const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
        ...options,
        headers: { ...headers, ...options.headers }
    });
    if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
    return response.json();
};

Deno.serve(async request => {
    if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
        return new Response('Unauthorized', { status: 401 });
    }

    const now = new Date();
    const schedules = await fetchJson('weekly_program_schedule?select=*');
    const subscriptions = await fetchJson('push_subscriptions?select=*');
    let sent = 0;
    const scheduleNotifications = await fetchJson(
        'schedule_notifications?select=id,member_id,message,action&push_sent_at=is.null&order=created_at.asc&limit=100'
    );

    for (const schedule of schedules) {
        const occurrence = scheduleOccurrence(schedule.day_of_week, schedule.start_time, now);
        if (!occurrence) continue;
        const remaining = occurrence.getTime() - now.getTime();
        const reminder = remaining >= 86370000 && remaining <= 86430000
            ? { type: 'day-before', label: '1 gün sonra' }
            : remaining >= 3570000 && remaining <= 3630000
                ? { type: 'hour-before', label: '1 saat sonra' }
                : null;
        if (!reminder) continue;

        for (const subscription of subscriptions.filter((item: any) => item.member_id === schedule.member_id)) {
            const existing = await fetchJson(
                `push_reminder_deliveries?subscription_id=eq.${subscription.id}&schedule_id=eq.${schedule.id}&occurrence_key=eq.${encodeURIComponent(occurrenceKey(occurrence))}&reminder_type=eq.${reminder.type}&select=id`
            );
            if (existing.length) continue;
            const payload = JSON.stringify({
                title: 'Zen Wellness Club seans hatırlatması',
                body: `${schedule.start_time.slice(0, 5)} · ${schedule.branch} seansınız ${reminder.label}.`,
                tag: `schedule-${schedule.id}-${reminder.type}`,
                // Relative: the service worker resolves it against its own scope (the app's address).
                url: './'
            });
            try {
                await webpush.sendNotification({
                    endpoint: subscription.endpoint,
                    keys: { p256dh: subscription.p256dh, auth: subscription.auth }
                }, payload);
                await fetchJson('push_reminder_deliveries', {
                    method: 'POST',
                    headers: { Prefer: 'return=minimal' },
                    body: JSON.stringify({
                        id: Date.now() + sent,
                        subscription_id: subscription.id,
                        schedule_id: schedule.id,
                        occurrence_key: occurrenceKey(occurrence),
                        reminder_type: reminder.type
                    })
                });
                sent += 1;
            } catch (error) {
                console.error('Push delivery failed:', error);
            }
        }
    }
    for (const notification of scheduleNotifications) {
        for (const subscription of subscriptions.filter((item: any) => item.member_id === notification.member_id)) {
            try {
                await webpush.sendNotification({
                    endpoint: subscription.endpoint,
                    keys: { p256dh: subscription.p256dh, auth: subscription.auth }
                }, JSON.stringify({
                    title: 'Zen Wellness Club program güncellemesi',
                    body: notification.message,
                    tag: `schedule-notification-${notification.id}`,
                    url: './'
                }));
                sent += 1;
            } catch (error) {
                console.error('Schedule update push failed:', error);
            }
        }
        await fetchJson(`schedule_notifications?id=eq.${notification.id}`, {
            method: 'PATCH',
            headers: { Prefer: 'return=minimal' },
            body: JSON.stringify({ push_sent_at: new Date().toISOString() })
        });
    }
    return new Response(JSON.stringify({ sent }), {
        headers: { 'Content-Type': 'application/json' }
    });
});
