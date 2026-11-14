// Resolve app paths against this worker's scope so the app works at any address
// (it moved from /trainer-pro/ to /zen-wellness/ in Nov 2026).
const appUrl = (relativePath = './') => new URL(relativePath, self.registration.scope).href;

// Must always equal APP_VERSION in script.js and the ?v= values in index.html (scripts/check-version-bump.js checks it).
const SHELL_VERSION = '1.3.128';
const CACHE_NAME = `zen-shell-${SHELL_VERSION}`;
const V = `?v=${SHELL_VERSION}`;
// Every same-origin file the app needs to open. Never sw.js itself, never another origin.
const SHELL_FILES = [
    './', `style.css${V}`, `vendor/supabase.js${V}`, `vendor/chart.umd.min.js${V}`,
    `data-service.js${V}`, `exercise-domain.js${V}`, `script.js${V}`,
    'manifest.webmanifest?v=1.0', 'icons/icon-192.png', 'icons/apple-touch-icon-180.png', 'icons/logo-720.png',
    'fonts/inter-latin.woff2', 'fonts/inter-latin-ext.woff2'
].map(file => appUrl(file));

self.addEventListener('install', event => {
    event.waitUntil((async () => {
        // addAll rejects if any file is missing: the install fails and the old version stays.
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(SHELL_FILES.map(url => new Request(url, { cache: 'reload' })));
        // A first install has nothing to mix with; an update waits for the user's tap (SKIP_WAITING).
        if (!self.registration.active) await self.skipWaiting();
    })());
});

self.addEventListener('message', event => {
    if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(names.filter(name => name.startsWith('zen-shell-') && name !== CACHE_NAME).map(name => caches.delete(name)));
        await self.clients.claim();
    })());
});

// Navigations: network first (4 s), then the cached app. Shell files: cache first. Everything else is not touched.
self.addEventListener('fetch', event => {
    const { request } = event;
    if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
    if (request.mode === 'navigate') {
        event.respondWith((async () => {
            try {
                // AbortController, not AbortSignal.timeout: the latter is missing before iOS 16 and would always serve the cache.
                const controller = new AbortController();
                setTimeout(() => controller.abort(), 4000);
                return await fetch(request, { signal: controller.signal });
            } catch {
                return (await caches.match(appUrl('./'), { cacheName: CACHE_NAME })) || Response.error();
            }
        })());
    } else if (SHELL_FILES.includes(request.url)) {
        event.respondWith((async () => (await caches.match(request, { cacheName: CACHE_NAME })) || fetch(request))());
    }
});

self.addEventListener('push', event => {
    let payload = {};
    try {
        payload = event.data ? event.data.json() : {};
    } catch {
        payload = { title: 'Zen Wellness Club', body: event.data?.text() || 'Yeni seans hatırlatması.' };
    }
    event.waitUntil(self.registration.showNotification(payload.title || 'Zen Wellness Club', {
        body: payload.body || 'Yaklaşan seansınız var.',
        icon: appUrl('icons/icon-192.png'),
        badge: appUrl('icons/icon-192.png'),
        tag: payload.tag || 'trainer-pro-schedule',
        data: { url: payload.url || './' }
    }));
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    const targetUrl = appUrl(event.notification.data?.url || './');
    event.waitUntil((async () => {
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const existing = clients.find(client => 'focus' in client);
        if (existing) {
            await existing.focus();
            return existing.navigate(targetUrl);
        }
        return self.clients.openWindow(targetUrl);
    })());
});
