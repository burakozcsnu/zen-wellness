# Service worker and kill switch

`sw.js` keeps the app openable without signal. It caches only same-origin shell files (listed in `SHELL_FILES`),
never `sw.js` itself, never Supabase or any other origin, never non-GET requests.

- Cache name: `zen-shell-<SHELL_VERSION>`. `SHELL_VERSION` equals `APP_VERSION` in `script.js` and the `?v=` values in `index.html`.
- Pages: network first (4 s), then the cached `./`. Shell files: cache first.
- A new version installs in the background and waits; the page asks the user, then posts `SKIP_WAITING`.
- Every shell file change needs a version bump (CI runs `scripts/check-version-bump.js`).

## Kill switch

Use this when a bad `sw.js` is live and devices keep showing old or broken files.

1. On a branch, replace the whole content of `sw.js` with the code below. Open a PR and merge it as usual.
2. Browsers re-check `sw.js` on every app open (and at least every 24 hours), so devices pick it up by themselves.
   The new worker deletes the `zen-shell-*` caches, removes itself and reloads open windows.
3. Side effect: removing the worker also removes the device's push subscription. Clients must tap the notification
   button again.
4. Once devices have recovered, put the fixed `sw.js` back (with a new `SHELL_VERSION`).

```js
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        for (const name of await caches.keys()) {
            if (name.startsWith('zen-shell-')) await caches.delete(name);
        }
        await self.registration.unregister();
        for (const client of await self.clients.matchAll({ type: 'window' })) client.navigate(client.url);
    })());
});
```

`tests/e2e/offline-shell.spec.js` runs exactly this code.
