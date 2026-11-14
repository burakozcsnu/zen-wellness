// @ts-check
(function () {
    'use strict';

    // How browsers word "no connection": Chrome, Safari/iOS, Firefox, older Safari.
    // A request that timed out or was aborted counts as "no connection" too.
    const NETWORK_ERROR = /Failed to fetch|Load failed|NetworkError|network connection was lost|AbortError|TimeoutError|signal timed out|operation was aborted|signal is aborted|Fetch is aborted|user aborted a request/i;
    const AUTH_ERROR = /JWT|token is expired/i;
    const isAuthError = error => Boolean(error) && (error.status === 401 || error.code === 'PGRST301' || error.code === 'PGRST303' || AUTH_ERROR.test(error.message || ''));
    const MAX_ATTEMPTS = 5;
    const RETRY_MS = 30000;
    let lastId = 0;
    const pad = value => String(value).padStart(2, '0');

    window.TrainerProDataService = {
        // New record number: the millisecond timestamp, nudged forward when needed so this
        // device never hands out the same number twice (several rows saved at once).
        newId() {
            lastId = Math.max(Date.now(), lastId + 1);
            return lastId;
        },

        // YYYY-MM-DD in the device's own time zone. toISOString() would give the UTC date,
        // which in Turkey is still "yesterday" between 00:00 and 03:00.
        localDate(date = new Date()) {
            return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
        },

        // Rows as they will look once the queued changes are sent. Pure: never touches its input.
        applyPending(rows, table, mutations) {
            let out = Array.isArray(rows) ? [...rows] : [];
            for (const m of mutations || []) {
                if (m.table !== table) continue;
                if (m.operation === 'update') {
                    out = out.map(row => (row.id == m.id ? { ...row, ...m.payload } : row));
                } else if (m.operation === 'delete') {
                    out = out.filter(row => row.id != m.id);
                } else if (m.operation === 'upsert' || m.operation === 'insert') {
                    const cols = m.operation === 'upsert' && m.onConflict ? m.onConflict.split(',').map(c => c.trim()) : null;
                    for (const object of Array.isArray(m.payload) ? m.payload : [m.payload]) {
                        const same = row => (cols ? cols.every(c => row[c] == object[c]) : row.id == object.id);
                        const at = out.findIndex(same);
                        if (at === -1) out.push({ ...object });
                        else out[at] = { ...out[at], ...object };
                    }
                }
            }
            return out;
        },

        create(client) {
            if (!client) throw new Error('Supabase client is required.');
            const queueKey = 'trainerpro_sync_queue';
            // Changes that failed for good are kept here (never deleted) so they can be recovered.
            const failedKey = 'trainerpro_sync_failed';
            const readList = key => {
                try {
                    return JSON.parse(localStorage.getItem(key) || '[]');
                } catch (error) {
                    console.error(`[Data service] Could not read ${key}:`, error);
                    return [];
                }
            };
            const readQueue = () => readList(queueKey);
            const saveFailed = list => (list.length ? localStorage.setItem(failedKey, JSON.stringify(list)) : localStorage.removeItem(failedKey));
            const writeQueue = queue => localStorage.setItem(queueKey, JSON.stringify(queue));
            const getOnline = () => typeof navigator === 'undefined' || navigator.onLine;
            const pendingEvent = detail => window.dispatchEvent(new CustomEvent('trainerpro-sync-queue', { detail }));
            const countFor = (queue, userId) => queue.filter(item => item.userId === userId).length;
            const isNetworkError = error => Boolean(error) && NETWORK_ERROR.test(error.message || String(error));
            const newQueueId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const currentUserId = async () => {
                try {
                    const { data } = await client.auth.getSession();
                    return data?.session?.user?.id || null;
                } catch (error) {
                    console.error('[Data service] Could not read session:', error);
                    return null;
                }
            };
            // Last user the auth events reported: labelling a queued change must not need getSession(), which answers nothing once the token expired offline.
            let knownUserId = null;
            let flushing = false;
            let retryTimer = null;

            const scheduleRetry = () => {
                if (retryTimer) return;
                retryTimer = setTimeout(() => {
                    retryTimer = null;
                    flushQueue().catch(error => console.error('[Data service] Queue retry failed:', error));
                }, RETRY_MS);
            };

            // Each queued change is labelled with the user who made it and only ever runs
            // under that user's login. queueId is the queue's own ticket; mutation.id stays
            // the id of the database row to update or delete.
            const enqueue = async mutation => {
                const queue = readQueue();
                queue.push({
                    ...mutation,
                    queueId: newQueueId(),
                    userId: knownUserId || await currentUserId(),
                    createdAt: new Date().toISOString(),
                    attempts: 0
                });
                writeQueue(queue);
                pendingEvent({ pending: countFor(queue, queue[queue.length - 1].userId), queued: true });
                scheduleRetry();
                return { data: null, error: null, queued: true };
            };

            const execute = async mutation => {
                try {
                    let query = client.from(mutation.table);
                    if (mutation.operation === 'upsert') {
                        query = query.upsert(mutation.payload, mutation.onConflict ? { onConflict: mutation.onConflict } : undefined);
                    }
                    if (mutation.operation === 'insert') query = query.insert(mutation.payload);
                    if (mutation.operation === 'delete') query = query.delete().eq('id', mutation.id);
                    if (mutation.operation === 'update') {
                        query = query.update(mutation.payload).eq('id', mutation.id);
                        if (mutation.expectedUpdatedAt) query = query.eq('updated_at', mutation.expectedUpdatedAt);
                    }
                    const { data, error } = await query.select?.();
                    if (!error && mutation.expectedUpdatedAt && (!data || data.length === 0)) {
                        return { data: null, error: new Error('SYNC_CONFLICT'), conflict: true };
                    }
                    return { data, error, queued: false };
                } catch (error) {
                    return { data: null, error, queued: false };
                }
            };

            const flushQueue = async () => {
                if (flushing || !getOnline()) return;
                if (!readQueue().length) return;
                const userId = await currentUserId();
                if (!userId) return; // Logged out: keep every change for its owner's next login.
                if (flushing) return;
                flushing = true;
                let ownPending = 0;
                let authExpired = false;
                let networkDown = false;
                try {
                    const queue = readQueue();
                    const snapshotIds = new Set(queue.filter(item => item.queueId).map(item => item.queueId));
                    const remaining = [];
                    const failed = [];
                    let processed = 0;
                    for (const mutation of queue) {
                        if (!mutation.userId) {
                            // Nobody owns it: sending it under whoever is logged in could write to the wrong account.
                            failed.push({ ...mutation, status: 'failed', lastError: 'No owner recorded; not sent.' });
                            continue;
                        }
                        if (mutation.userId !== userId) {
                            remaining.push(mutation);
                            continue;
                        }
                        if (authExpired || networkDown) {
                            remaining.push(mutation);
                            continue;
                        }
                        processed += 1;
                        if (!mutation.queueId) {
                            // Queued before 1.3.116: its "id" was overwritten by the ticket number,
                            // so the row to update or delete is unknown. Inserts still carry their data.
                            mutation.queueId = newQueueId();
                            if (mutation.operation === 'update' || mutation.operation === 'delete') {
                                failed.push({ ...mutation, lastError: 'Queued before version 1.3.116; target record unknown.' });
                                continue;
                            }
                        }
                        const result = await execute(mutation);
                        if (!result.error) continue;
                        // Only the row's own primary key already existing means an earlier attempt stored it; other unique constraints are real failures.
                        if (result.error.code === '23505' && mutation.operation === 'insert'
                            && (/_pkey"/.test(result.error.message || '') || /^Key \(id\)=/.test(result.error.details || ''))) continue;
                        if (!result.conflict && isAuthError(result.error)) {
                            authExpired = true; // Not a real failure: keep it and wait for the next login.
                            remaining.push(mutation);
                            continue;
                        }
                        if (!result.conflict && isNetworkError(result.error)) {
                            networkDown = true; // Connection problem: not a real attempt; stop so later changes cannot overtake this one.
                            remaining.push(mutation);
                            continue;
                        }
                        mutation.attempts = (mutation.attempts || 0) + 1;
                        mutation.lastError = result.error.message;
                        if (result.conflict || mutation.attempts >= MAX_ATTEMPTS) {
                            mutation.status = result.conflict ? 'conflict' : 'failed';
                            failed.push(mutation);
                        } else {
                            remaining.push(mutation);
                        }
                    }
                    // Keep changes queued while this flush was running.
                    const addedMeanwhile = readQueue().filter(item => item.queueId && !snapshotIds.has(item.queueId));
                    const nextQueue = [...remaining, ...addedMeanwhile];
                    writeQueue(nextQueue);
                    ownPending = nextQueue.filter(item => !item.userId || item.userId === userId).length;
                    if (failed.length) {
                        localStorage.setItem(failedKey, JSON.stringify([...readList(failedKey), ...failed]));
                        failed.forEach(item => console.error('[Data service] Change set aside after failing:', item.table, item.operation, item.lastError));
                        window.dispatchEvent(new CustomEvent('trainerpro-sync-failed', { detail: { failed } }));
                    }
                    if (processed) pendingEvent({ pending: ownPending });
                    if (authExpired) window.dispatchEvent(new CustomEvent('trainerpro-sync-auth'));
                } finally {
                    flushing = false;
                    if (ownPending && !authExpired) scheduleRetry();
                }
            };

            window.addEventListener('online', () => {
                flushQueue().catch(error => console.error('[Data service] Queue flush failed:', error));
            });
            // Send this user's waiting changes right after login. Deferred: supabase-js
            // must not be called from inside its own auth callback.
            client.auth?.onAuthStateChange?.((event, session) => {
                if (event === 'SIGNED_OUT') knownUserId = null;
                else if (session?.user?.id) knownUserId = session.user.id;
                if (event !== 'SIGNED_IN' && event !== 'INITIAL_SESSION') return;
                setTimeout(() => {
                    flushQueue().catch(error => console.error('[Data service] Queue flush failed:', error));
                }, 0);
            });

            const service = {
                // Reads a whole table (optionally one member's rows) page by page: the API returns at most 1,000 rows per request.
                // The first page also returns the total, so the remaining pages can be fetched a few at a time.
                async fetchAll(table, pageSize = 1000, filters = {}, parallel = 4, columns = '*') {
                    // An array value is an "in" filter; an empty one matches nothing, so no request is made.
                    if (Object.values(filters).some(value => Array.isArray(value) && !value.length)) return [];
                    const page = (from, withCount) => {
                        let query = client.from(table).select(columns, withCount ? { count: 'exact' } : undefined);
                        for (const [column, value] of Object.entries(filters)) query = Array.isArray(value) ? query.in(column, value) : query.eq(column, value);
                        // Stable order: without it, pages can overlap or skip rows while data changes.
                        return query.order('id').range(from, from + pageSize - 1);
                    };
                    const first = await page(0, true);
                    if (first.error) throw first.error;
                    const rows = [...(first.data || [])];
                    if (rows.length < pageSize) return rows;
                    // shortcut: without a total (null count) pages are read one at a time, never skipped
                    const total = typeof first.count === 'number' ? first.count : Infinity;
                    if (total === Infinity) {
                        for (let from = pageSize; ; from += pageSize) {
                            const { data, error } = await page(from, false);
                            if (error) throw error;
                            if (!data?.length) break;
                            rows.push(...data);
                            if (data.length < pageSize) break;
                        }
                        return rows;
                    }
                    const starts = [];
                    for (let from = pageSize; from < total; from += pageSize) starts.push(from);
                    for (let i = 0; i < starts.length; i += parallel) {
                        const results = await Promise.all(starts.slice(i, i + parallel).map(from => page(from, false)));
                        for (const { data, error } of results) {
                            if (error) throw error;
                            rows.push(...(data || []));
                        }
                    }
                    return rows;
                },

                async select(table, columns = '*', options = {}) {
                    let query = client.from(table).select(columns);
                    if (options.order) {
                        query = query.order(options.order.column, {
                            ascending: options.order.ascending ?? true
                        });
                    }
                    if (options.limit) query = query.limit(options.limit);
                    const { data, error } = await query;
                    if (error) throw error;
                    return data || [];
                },

                async mutate(table, operation, payload = null, options = {}) {
                    const mutation = {
                        table,
                        operation,
                        payload,
                        id: options.id || payload?.id,
                        expectedUpdatedAt: options.expectedUpdatedAt,
                        onConflict: options.onConflict
                    };
                    if (!getOnline()) return enqueue(mutation);
                    const result = await execute(mutation);
                    if (result.error && !result.conflict && (isNetworkError(result.error) || !getOnline())) {
                        return enqueue(mutation);
                    }
                    return result;
                },

                getPending(userId) {
                    return readQueue().filter(item => item.userId === userId).map(item => ({ ...item }));
                },

                getFailed(userId) {
                    return readList(failedKey).filter(item => item.userId === userId).map(item => ({ ...item }));
                },

                retryFailed(queueId) {
                    const failed = readList(failedKey);
                    const item = failed.find(entry => entry.queueId === queueId);
                    if (!item) return false;
                    const { status, lastError, ...rest } = item;
                    const queue = readQueue();
                    queue.push({ ...rest, attempts: 0 });
                    writeQueue(queue);
                    saveFailed(failed.filter(entry => entry !== item));
                    pendingEvent({ pending: countFor(queue, item.userId) });
                    flushQueue().catch(error => console.error('[Data service] Queue flush failed:', error));
                    return true;
                },

                discardFailed(queueId) {
                    const failed = readList(failedKey);
                    const item = failed.find(entry => entry.queueId === queueId);
                    if (!item) return false;
                    saveFailed(failed.filter(entry => entry !== item));
                    pendingEvent({ pending: countFor(readQueue(), item.userId) });
                    return true;
                },

                getPendingCount(userId) {
                    const queue = readQueue();
                    return userId ? queue.filter(item => item.userId === userId).length : queue.length;
                },

                // Logout: removes this user's (and owner-less) unsent and failed changes plus the data cache
                // from this device. Returns how many unsent changes were dropped.
                clearLocalData(userId) {
                    try {
                        let removed = 0;
                        for (const key of [queueKey, failedKey]) {
                            const list = readList(key);
                            const kept = list.filter(item => item.userId && item.userId !== userId);
                            if (key === queueKey) removed = list.length - kept.length;
                            if (kept.length) localStorage.setItem(key, JSON.stringify(kept));
                            else localStorage.removeItem(key);
                        }
                        localStorage.removeItem('trainerpro_cache');
                        return removed;
                    } catch (error) {
                        console.error('[Data service] Could not clear local data:', error);
                        throw error;
                    }
                },

                flushQueue
            };
            flushQueue().catch(error => console.error('[Data service] Queue flush failed:', error));
            return service;
        }
    };
})();
