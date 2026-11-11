// Browser performance on the large data set: load time, render time, blocking, size, and memory growth.
// Run with: npm run test:perf   (Chromium/Edge only, uses CDP for heap and CPU throttling)
const { test, expect, login } = require('../e2e/fixtures');
const { env: testEnv, signIn, rest } = require('../helpers/api');

// PERF_SCALE=typical (50 members, ~7,000 measurements; tight budgets) or extreme (500 members, 77,500 rows; loose budgets).
// Budgets in milliseconds / counts, set from docs/perf-baseline.md.
const SCALE = process.env.PERF_SCALE === 'extreme' ? 'extreme' : 'typical';
const BUDGETS = {
  typical: { desktopTrainerReady: 4000, phoneTrainerReady: 8000, clientPortalReady: 5000, openProfile: 6000 },
  extreme: { desktopTrainerReady: 5000, phoneTrainerReady: 10000, clientPortalReady: 5000, openProfile: 6000 }
};
const BUDGET = { ...BUDGETS[SCALE], longTaskTotal: 3000, heapGrowthMB: 15, transferKB: 400 };
// longTaskTotal: total main-thread blocking (>50 ms tasks) while loading. heapGrowthMB: after 15 tours of every view.

async function perfStart(page) {
  await page.addInitScript(() => {
    window.__longTasks = [];
    new PerformanceObserver(list => list.getEntries().forEach(e => window.__longTasks.push(e.duration))).observe({ type: 'longtask', buffered: true });
  });
}

const blocking = page => page.evaluate(() => (window.__longTasks || []).reduce((sum, d) => sum + Math.max(0, d - 50), 0));

async function pageWeight(page) {
  return page.evaluate(() => performance.getEntriesByType('resource')
    .filter(e => /\.(js|css|woff2?)(\?|$)/.test(e.name) && !e.name.includes('supabase.co'))
    .reduce((sum, e) => sum + (e.transferSize || e.encodedBodySize || 0), 0) / 1024);
}

test('trainer: load with 500+ members and 50,000 measurements (desktop)', async ({ page, env, problems }) => {
  await perfStart(page);
  await page.goto('/');
  const weight = await pageWeight(page);
  const start = Date.now();
  await login(page, 'admin', env.adminEmail, env.adminPassword);
  await expect(page.locator('.member-card').first()).toBeVisible({ timeout: 120000 });
  const ready = Date.now() - start;
  const nodes = await page.evaluate(() => document.getElementsByTagName('*').length);
  const block = await blocking(page);
  console.log(`  desktop trainer: ready=${ready}ms blocking=${Math.round(block)}ms domNodes=${nodes} firstLoadKB=${Math.round(weight)}`);
  expect(ready).toBeLessThanOrEqual(BUDGET.desktopTrainerReady);
  expect(block).toBeLessThanOrEqual(BUDGET.longTaskTotal);
  expect(weight).toBeLessThanOrEqual(BUDGET.transferKB);
  expect(problems).toEqual([]);
});

test('trainer: load on a slow phone (4x CPU throttle)', async ({ page, env }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await perfStart(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const start = Date.now();
  await login(page, 'admin', env.adminEmail, env.adminPassword);
  await expect(page.locator('.member-card').first()).toBeVisible({ timeout: 60000 });
  const ready = Date.now() - start;
  const block = await blocking(page);
  console.log(`  phone (4x CPU) trainer: ready=${ready}ms blocking=${Math.round(block)}ms`);
  expect(ready).toBeLessThanOrEqual(BUDGET.phoneTrainerReady);
});

test('client: portal with a 2,000-measurement history', async ({ page, env, problems }) => {
  await perfStart(page);
  const start = Date.now();
  await login(page, 'user', env.clientEmail, env.clientPassword);
  await expect(page.getByText('Hoş geldiniz')).toBeVisible({ timeout: 120000 }); // data loaded; an earlier tap is lost to the re-render
  await page.locator('[data-portal-tab="measurements"]').click();
  await expect(page.locator('[data-portal-section="measurements"]')).toBeVisible();
  const ready = Date.now() - start;
  const block = await blocking(page);
  console.log(`  client portal: ready=${ready}ms blocking=${Math.round(block)}ms`);
  expect(ready).toBeLessThanOrEqual(BUDGET.clientPortalReady);
  expect(block).toBeLessThanOrEqual(BUDGET.longTaskTotal);
  expect(problems).toEqual([]);
});

test('memory: 15 tours through every trainer view do not leak', async ({ page, env }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const heapMB = async () => {
    await cdp.send('HeapProfiler.collectGarbage');
    const { metrics } = await cdp.send('Performance.getMetrics');
    return metrics.find(m => m.name === 'JSHeapUsedSize').value / 1048576;
  };
  await login(page, 'admin', env.adminEmail, env.adminPassword);
  await expect(page.locator('.member-card').first()).toBeVisible({ timeout: 120000 });
  const buttons = page.locator('.sidebar .nav-btn');
  const tour = async () => {
    for (let i = 0; i < await buttons.count(); i++) {
      if (await buttons.nth(i).isVisible()) await buttons.nth(i).click();
      await page.waitForTimeout(120);
    }
  };
  await tour(); await tour(); // warm up caches before measuring
  const before = await heapMB();
  for (let i = 0; i < 15; i++) await tour();
  const after = await heapMB();
  console.log(`  heap: ${before.toFixed(1)}MB -> ${after.toFixed(1)}MB (+${(after - before).toFixed(1)}MB)`);
  expect(after - before).toBeLessThanOrEqual(BUDGET.heapGrowthMB);
});

test('trainer: a client with 2,000 measurements shows their true latest one, quickly', async ({ page, env, problems }) => {
  page.on('dialog', dialog => dialog.accept()); // the monthly-measurement reminder
  const admin = await signIn(testEnv.adminEmail, testEnv.adminPassword);
  const [member] = await rest(admin, 'GET', `uyeler?select=id,ad_soyad&email=eq.${encodeURIComponent(testEnv.clientEmail)}`);
  const [latest] = await rest(admin, 'GET', `olcumler?select=tarih&member_id=eq.${member.id}&order=tarih.desc&limit=1`);
  const [year, month, day] = latest.tarih.split('-');

  await login(page, 'admin', env.adminEmail, env.adminPassword);
  await expect(page.locator('.member-card').first()).toBeVisible({ timeout: 60000 });
  const start = Date.now();
  await page.locator('.member-card').filter({ has: page.getByText(member.ad_soyad, { exact: true }) }).click();
  await expect(page.locator('#measurement-summary')).toContainText(`${day}.${month}.${year}`, { timeout: 30000 });
  const opened = Date.now() - start;
  console.log(`  open profile with 2,000 measurements: ${opened}ms (latest ${day}.${month}.${year})`);
  expect(opened).toBeLessThanOrEqual(BUDGET.openProfile);
  expect(problems.filter(p => !p.includes('Failed to load resource'))).toEqual([]);
});

test('dashboard: the "clients with a measurement" figure matches the database', async ({ page, env }) => {
  test.skip(SCALE === 'extreme', 'counting distinct members through the API takes hundreds of requests at this scale');
  const admin = await signIn(testEnv.adminEmail, testEnv.adminPassword);
  const members = new Set();
  for (let last = 0; ;) {
    const [row] = await rest(admin, 'GET', `olcumler?select=member_id&order=member_id.asc&limit=1&member_id=gt.${last}`);
    if (!row) break;
    members.add(row.member_id);
    last = row.member_id;
  }
  await login(page, 'admin', env.adminEmail, env.adminPassword);
  const figure = page.locator('#member-overview strong').nth(2); // third tile: "Ölçümü bulunan"
  await expect(figure).toHaveText(String(members.size), { timeout: 60000 });
});
