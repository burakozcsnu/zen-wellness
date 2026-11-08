// Resolve app paths against this worker's scope so the app works at any address
// (it moved from /trainer-pro/ to /zen-wellness/ in Nov 2026).
const appUrl = (relativePath = './') => new URL(relativePath, self.registration.scope).href;

self.addEventListener('install', event => {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
    event.waitUntil(self.clients.claim());
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
        icon: appUrl('zen-wellness-icon.png'),
        badge: appUrl('zen-wellness-icon.png'),
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
