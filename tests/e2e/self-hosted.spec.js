// The app must not depend on any third-party host at runtime: only itself and the Supabase project.
const { test, expect, login } = require('./fixtures');
const { env } = require('../helpers/api');
const { PROD_REF } = require('../helpers/test-env');

test('a trainer session talks only to the app and the Supabase project', async ({ page, baseURL }) => {
  const hosts = new Set();
  page.on('request', request => { if (/^https?:/.test(request.url())) hosts.add(new URL(request.url()).host); });
  await login(page, 'admin', env.adminEmail, env.adminPassword);
  await page.waitForLoadState('networkidle');
  const allowed = [new URL(baseURL).host, `${PROD_REF}.supabase.co`, new URL(env.url).host];
  expect([...hosts].filter(host => !allowed.includes(host))).toEqual([]);
  expect(await page.evaluate(() => [typeof window.supabase?.createClient, typeof window.Chart])).toEqual(['function', 'function']);
});
