import webpush from 'npm:web-push@3.6.7';

// Pushes "rest is over" to a member's devices when the app is locked and its own timer is frozen.
// Deployed with --no-verify-jwt: this function checks the caller itself (user token, or the chain secret).
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('DATABASE_SECRET_KEY')
    || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@zenwellnessclub.com';
const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
const cronSecret = Deno.env.get('CRON_SECRET');
const GRACE_MS = 3000; // the visible app cancels the alert in this window after the rest ends
const SLEEP_STEP_MS = 60000; // documented limit is 150 s of wall clock, but on zen-test a 120 s step never handed over (100 s did): keep a wide margin
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

if (!supabaseUrl || !serviceRoleKey || !vapidPublicKey || !vapidPrivateKey || !cronSecret) {
    throw new Error('SUPABASE_URL, DATABASE_SECRET_KEY, VAPID_* and CRON_SECRET are required.');
}

webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

const headers = {
    Authorization: `Bearer ${serviceRoleKey}`,
    apikey: serviceRoleKey,
    'Content-Type': 'application/json'
};

const fetchJson = async (path: string, options: RequestInit = {}) => {
    const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
        ...options,
        headers: { ...headers, ...options.headers }
    });
    if (!response.ok) throw new Error(`${path.split('?')[0]}: ${response.status}`);
    const text = await response.text();
    return text ? JSON.parse(text) : null;
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const reply = (status: number, text: string) => new Response(text, { status });

const sendPush = async (subscription: any, payload: string) => {
    try {
        await webpush.sendNotification({
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth }
        }, payload);
    } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        // Log only the subscription id and status: endpoints and keys identify a person's device.
        console.error(`Push failed for subscription ${subscription.id}: status ${status ?? 'none'}`);
        if (status !== 404 && status !== 410) return;
        await fetchJson(`push_subscriptions?id=eq.${subscription.id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
            .catch(deleteError => console.error('Removing expired subscription failed:', String(deleteError)));
    }
};

const waitAndSend = async (memberId: number, alertId: string, dueAt: number) => {
    try {
        const remaining = dueAt + GRACE_MS - Date.now();
        if (remaining > SLEEP_STEP_MS) {
            await sleep(SLEEP_STEP_MS);
            const response = await fetch(`${supabaseUrl}/functions/v1/rest-alert`, {
                method: 'POST',
                headers: { ...headers, 'x-rest-alert-chain': cronSecret },
                body: JSON.stringify({ alert_id: alertId, member_id: memberId })
            });
            if (!response.ok) console.error(`Chained call failed: status ${response.status}`);
            return;
        }
        await sleep(Math.max(remaining, 0));
        // Atomic claim: only the call that flips sent_at from null sends; a cancelled or replaced alert matches no row.
        const claimed = await fetchJson(
            `rest_alerts?member_id=eq.${memberId}&alert_id=eq.${alertId}&sent_at=is.null`,
            { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ sent_at: new Date().toISOString() }) }
        );
        if (!claimed?.length) return;
        const subscriptions = await fetchJson(`push_subscriptions?select=*&member_id=eq.${memberId}`);
        const payload = JSON.stringify({ title: 'Dinlenme bitti', body: 'Sıradaki sete geçebilirsin.', tag: 'rest-end', url: './' });
        for (const subscription of subscriptions) await sendPush(subscription, payload);
    } catch (error) {
        console.error('Rest alert failed:', String(error));
    }
};

Deno.serve(async request => {
    if (request.method !== 'POST') return reply(405, 'Method not allowed');
    let body: any;
    try { body = await request.json(); } catch { return reply(400, 'Bad request'); }
    const alertId = body?.alert_id;
    if (typeof alertId !== 'string' || !UUID.test(alertId)) return reply(400, 'Bad request');

    let memberId: number;
    if (request.headers.get('x-rest-alert-chain')) {
        if (request.headers.get('x-rest-alert-chain') !== cronSecret) return reply(401, 'Unauthorized');
        memberId = Number(body.member_id);
        if (!Number.isSafeInteger(memberId)) return reply(400, 'Bad request');
    } else {
        const token = (request.headers.get('authorization') || '').replace(/^Bearer /i, '');
        if (!token) return reply(401, 'Unauthorized');
        const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${token}` } });
        if (!userResponse.ok) return reply(401, 'Unauthorized');
        const user = await userResponse.json();
        const members = await fetchJson(`uyeler?select=id&auth_user_id=eq.${encodeURIComponent(user.id)}`);
        if (!members?.length) return reply(403, 'Forbidden');
        memberId = members[0].id;
    }

    const [row] = await fetchJson(`rest_alerts?select=alert_id,due_at,sent_at&member_id=eq.${memberId}`) || [];
    const dueAt = row ? new Date(row.due_at).getTime() : NaN;
    const now = Date.now();
    if (!row || row.alert_id !== alertId || row.sent_at || !(dueAt >= now - 5000 && dueAt <= now + 15 * 60000)) {
        return reply(409, 'No such pending alert');
    }
    EdgeRuntime.waitUntil(waitAndSend(memberId, alertId, dueAt));
    return reply(202, 'Accepted');
});
