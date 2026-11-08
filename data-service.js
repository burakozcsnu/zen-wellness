(function () {
    'use strict';

    window.TrainerProDataService = {
        create(client) {
            if (!client) throw new Error('Supabase client is required.');
            const queueKey = 'trainerpro_sync_queue';
            const readQueue = () => {
                try {
                    return JSON.parse(localStorage.getItem(queueKey) || '[]');
                } catch (error) {
                    console.error('[Data service] Could not read sync queue:', error);
                    return [];
                }
            };
            const writeQueue = queue => localStorage.setItem(queueKey, JSON.stringify(queue));
            const getOnline = () => typeof navigator === 'undefined' || navigator.onLine;
            let flushing = false;

            const enqueue = mutation => {
                const queue = readQueue();
                queue.push({
                    ...mutation,
                    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                    createdAt: new Date().toISOString(),
                    attempts: 0
                });
                writeQueue(queue);
                return { data: null, error: null, queued: true };
            };

            const execute = async mutation => {
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
            };

            const flushQueue = async () => {
                if (flushing || !getOnline()) return;
                flushing = true;
                try {
                    const queue = readQueue();
                    const remaining = [];
                    for (const mutation of queue) {
                        const result = await execute(mutation);
                        if (result.error) {
                            mutation.attempts += 1;
                            mutation.lastError = result.error.message;
                            if (result.conflict || mutation.attempts >= 5) {
                                mutation.status = result.conflict ? 'conflict' : 'failed';
                            }
                            remaining.push(mutation);
                        }
                    }
                    writeQueue(remaining);
                    window.dispatchEvent(new CustomEvent('trainerpro-sync-queue', {
                        detail: { pending: remaining.length }
                    }));
                } finally {
                    flushing = false;
                }
            };

            window.addEventListener('online', flushQueue);

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
                    if (result.error && !result.conflict && (result.error.message.includes('Failed to fetch') || !getOnline())) {
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
