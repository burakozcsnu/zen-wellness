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
  page.on('pageerror', error => problems.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') problems.push(`console.error: ${message.text()}`);
  });
  page.on('response', response => {
    if (response.status() >= 500) problems.push(`HTTP ${response.status()}: ${response.url()}`);
  });
  page.on('requestfailed', request => {
    if (request.failure()?.errorText !== 'net::ERR_ABORTED') problems.push(`request failed: ${request.url()}`);
  });
}

const test = base.test.extend({
  env: async ({}, use) => use(loadTestEnv()),

  problems: async ({}, use) => use([]),

  page: async ({ page, env, problems }, use) => {
    await attachTestProject(page, env, problems);
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
