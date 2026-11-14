const base = require('@playwright/test');
const { loadTestEnv, PROD_REF } = require('../helpers/test-env');

const PROD_HOST = `${PROD_REF}.supabase.co`;
const PROD_KEY = 'sb_publishable_cR0_yg6oxqfP4mAcPTL4Bw_ZhW16sSr'; // public key the app ships with

// Wires a page to the TEST project only (the app's hardcoded production URL and realtime socket are rewritten)
// and records anything that looks like a bug into `problems`. Used for the main page and for extra windows.
async function attachTestProject(page, env, problems) {
  const testHost = new URL(env.url).host;
  await page.route(`**/${PROD_HOST}/**`, async route => {
    const request = route.request();
    const url = request.url().replace(PROD_HOST, testHost);
    const headers = { ...request.headers(), apikey: env.publishableKey };
    // Session tokens are issued by the test project; the app's anon fallback must use the test key too.
    if (!headers.authorization || headers.authorization.includes('sb_publishable_')) {
      headers.authorization = `Bearer ${env.publishableKey}`;
    }
    await route.continue({ url, headers });
  });
  // Realtime uses a WebSocket, which page.route does not cover: point it at the test project too.
  await page.addInitScript(({ prodHost, testHost, prodKey, testKey }) => {
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = new Proxy(NativeWebSocket, {
      construct(target, [url, ...rest]) {
        return new target(String(url).replace(prodHost, testHost).replace(prodKey, testKey), ...rest);
      }
    });
  }, { prodHost: PROD_HOST, testHost, prodKey: PROD_KEY, testKey: env.publishableKey });
  // A blocking alert() is a bug (the app shows toasts): record it and close it. Confirm/prompt dialogs stay with the specs;
  // with no spec handler (this one is the only listener) they are dismissed, as Playwright does by default.
  page.on('dialog', dialog => {
    if (dialog.type() === 'alert') { problems.push(`alert dialog: ${dialog.message()}`); return dialog.dismiss(); }
    if (page.listenerCount('dialog') === 1) return dialog.dismiss();
  });
  page.on('pageerror', error => problems.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') problems.push(`console.error: ${message.text()}`);
  });
  page.on('response', async response => {
    // Safety net: a production response means the rewrite above did not apply (WebKit under a service worker, or a spec
    // route that used continue() instead of fallback()). A spec's own fulfill() keeps the production URL but has no server address.
    if (new URL(response.url()).host === PROD_HOST && await response.serverAddr().catch(() => null)) problems.push(`PRODUCTION reached: ${response.request().method()} ${new URL(response.url()).pathname}`);
    if (response.status() >= 500) problems.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  page.on('requestfailed', request => {
    if (request.failure()?.errorText !== 'net::ERR_ABORTED') problems.push(`request failed: ${request.url()}`);
  });
}

const test = base.test.extend({
  env: async ({}, use) => use(loadTestEnv()),

  problems: async ({}, use) => use([]),

  // The iPhone install card (top of the screen) is dismissed up front so it never covers other specs' taps; install-hint.spec.js turns this off.
  dismissIosHint: [true, { option: true }],

  // Every spec fails on an alert() pop-up or on any response from production, whether or not it checks `problems` itself.
  alertGuard: [async ({ problems }, use) => {
    await use();
    base.expect(problems.filter(p => p.startsWith('alert dialog') || p.startsWith('PRODUCTION reached'))).toEqual([]);
  }, { auto: true }],

  page: async ({ page, env, problems, dismissIosHint }, use) => {
    await attachTestProject(page, env, problems);
    if (dismissIosHint) await page.addInitScript(() => { try { localStorage.setItem('ios_hint_dismissed', '1'); } catch { /* storage blocked */ } });
    await use(page);
  }
});

async function login(page, role, email, password) {
  await page.goto('/');
  await page.locator('.brand-splash-logo').click({ force: true }); // endless breathing animation never counts as stable
  await page.locator(role === 'admin' ? '.portal-role-admin' : '.portal-role:not(.portal-role-admin)').click();
  await page.locator('#auth-email').fill(email);
  await page.locator('#auth-password').fill(password);
  await page.locator('#modal-auth button[type="submit"]').click();
}

module.exports = { test, expect: base.expect, login, attachTestProject };
