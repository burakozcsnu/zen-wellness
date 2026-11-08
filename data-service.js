(function () {
    'use strict';

    // How browsers word "no connection": Chrome, Safari/iOS, Firefox, older Safari.
    const NETWORK_ERROR = /Failed to fetch|Load failed|NetworkError|network connection was lost/i;
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
            const writeQueue = queue => localStorage.setItem(queueKey, JSON.stringify(queue));
            const getOnline = () => typeof navigator === 'undefined' || navigator.onLine;
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
                    userId: await currentUserId(),
                    createdAt: new Date().toISOString(),
                    attempts: 0
                });
                writeQueue(queue);
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
                try {
                    const queue = readQueue();
                    const snapshotIds = new Set(queue.filter(item => item.queueId).map(item => item.queueId));
                    const remaining = [];
                    const failed = [];
                    let processed = 0;
                    for (const mutation of queue) {
                        if (mutation.userId && mutation.userId !== userId) {
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
                        if (!result.conflict && isNetworkError(result.error)) {
                            remaining.push(mutation); // Connection problem: not a real attempt.
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
                    if (processed) {
                        window.dispatchEvent(new CustomEvent('trainerpro-sync-queue', {
                            detail: { pending: ownPending }
                        }));
                    }
                } finally {
                    flushing = false;
                    if (ownPending) scheduleRetry();
                }
            };

            window.addEventListener('online', () => {
                flushQueue().catch(error => console.error('[Data service] Queue flush failed:', error));
            });
            // Send this user's waiting changes right after login. Deferred: supabase-js
            // must not be called from inside its own auth callback.
            client.auth?.onAuthStateChange?.(event => {
                if (event !== 'SIGNED_IN' && event !== 'INITIAL_SESSION') return;
                setTimeout(() => {
                    flushQueue().catch(error => console.error('[Data service] Queue flush failed:', error));
                }, 0);
            });

            const service = {
                async fetchAll(table, pageSize = 1000) {
                    const rows = [];
                    let from = 0;
                    while (true) {
                        const { data, error } = await client
                            .from(table)
                            .select('*')
                            .range(from, from + pageSize - 1);
                        if (error) throw error;
                        if (!data?.length) break;
                        rows.push(...data);
                        from += pageSize;
                        if (data.length < pageSize) break;
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

                getPendingCount() {
                    return readQueue().length;
                },

                flushQueue
            };
            flushQueue().catch(error => console.error('[Data service] Queue flush failed:', error));
            return service;
        }
    };
})();
