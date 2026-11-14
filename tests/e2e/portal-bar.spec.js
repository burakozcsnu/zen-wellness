// Client portal on a phone: the section tabs are a bottom bar that never hides content, the pending button or the
// toasts. On desktop the bar stays a normal row. Notch insets are simulated by rewriting the CSS function that reads them.
const { test, expect, login } = require('./fixtures');
// The service worker would answer style.css from its cache, past the page.route rewrite below.
test.use({ serviceWorkers: 'block' });
const { env, signIn, rest } = require('../helpers/api');

const stamp = Date.now();
const tabs = ['overview', 'schedule', 'notifications', 'measurements', 'workouts', 'nutrition', 'documents'];
const bar = page => page.locator('nav.member-portal-tabs');

test.describe('client portal bottom bar', () => {
  test.describe.configure({ mode: 'serial' });
  let admin, memberId, workoutId;

  test.beforeAll(async () => {
    admin = await signIn(env.adminEmail, env.adminPassword);
    [{ id: memberId }] = await rest(admin, 'GET', `uyeler?select=id&email=eq.${encodeURIComponent(env.clientEmail)}`);
    // A workout gives the offline tick (the queued change for the pending button) something to act on.
    [{ id: workoutId }] = await rest(admin, 'POST', 'antrenmanlar', {
      id: stamp, member_id: memberId, tarih: '2099-12-30', sablon: `E2E Bar ${stamp}`,
      setler: JSON.stringify([{ ad: 'E2E Squat', set_no: 1, weight: '60', reps: '8', sure: '', tip: 'Normal', tempo: '', rest_seconds: 30, rpe: null }]), rest_seconds: 30
    });
  });
  test.afterAll(async () => {
    await rest(admin, 'DELETE', `antrenmanlar?id=eq.${workoutId}`).catch(() => {});
    await rest(admin, 'DELETE', `workout_completions?member_id=eq.${memberId}&workout_id=eq.${workoutId}`).catch(() => {});
  });

  const open = async (page, inset) => {
    if (inset) {
      await page.route('**/style.css*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: (await response.text()).replace(/env\(safe-area-inset-bottom\)/g, `${inset}px`) });
      });
    }
    await login(page, 'user', env.clientEmail, env.clientPassword);
    await expect(page.getByText('Hoş geldiniz')).toBeVisible({ timeout: 20000 });
  };

  test.describe('phone', () => {
    test.beforeEach(({}, info) => test.skip(!info.project.name.startsWith('phone'), 'phone layout only'));

    for (const [width, height] of [[375, 667], [320, 568]]) {
      test(`bar sits at the bottom edge, seven tabs inside the screen, 44 px high (${width} px)`, async ({ page, problems }) => {
        await page.setViewportSize({ width, height });
        await open(page);
        const box = await bar(page).boundingBox();
        expect(Math.round(box.y + box.height)).toBe(height);
        const rects = await page.locator('[data-portal-tab]').evaluateAll(list => list.map(b => {
          const r = b.getBoundingClientRect();
          return { left: r.left, right: r.right, bottom: r.bottom, height: r.height, svgHidden: b.querySelector('svg')?.getAttribute('aria-hidden') };
        }));
        expect(rects).toHaveLength(7);
        for (const r of rects) {
          expect(r.left).toBeGreaterThanOrEqual(0);
          expect(r.right).toBeLessThanOrEqual(width + 0.5);
          expect(r.bottom).toBeLessThanOrEqual(height + 0.5);
          expect(r.height).toBeGreaterThanOrEqual(44);
          expect(r.svgHidden).toBe('true');
        }
        const noScroll = await page.evaluate(() => {
          const nav = document.querySelector('nav.member-portal-tabs');
          return [document.documentElement.scrollWidth <= innerWidth, nav.scrollWidth <= nav.clientWidth];
        });
        expect(noScroll).toEqual([true, true]);
        expect(problems.filter(p => !p.includes('Failed to load resource'))).toEqual([]);
      });
    }

    for (const width of [320, 375]) {
      test(`no tab label is cut off, labels are at least 10 px, every tab has the same height (${width} px)`, async ({ page }) => {
        await page.setViewportSize({ width, height: 640 });
        await open(page);
        const labels = await page.locator('[data-portal-tab]').evaluateAll(list => list.map(b => {
          const text = [...b.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
          const r = document.createRange();
          r.selectNodeContents(text);
          return { text: text.textContent.trim(), fits: b.scrollWidth <= b.clientWidth, textFits: r.getBoundingClientRect().width <= b.clientWidth && r.getBoundingClientRect().right <= innerWidth && r.getBoundingClientRect().left >= 0, font: parseFloat(getComputedStyle(b).fontSize), height: b.getBoundingClientRect().height };
        }));
        expect(labels).toHaveLength(7);
        for (const l of labels) {
          expect(l.fits, `${l.text} scrollWidth`).toBe(true);
          expect(l.textFits, `${l.text} text width`).toBe(true);
          expect(l.font, l.text).toBeGreaterThanOrEqual(10);
        }
        expect(new Set(labels.map(l => l.height)).size).toBe(1);
      });
    }

    test('tapping Antrenman shows that section and marks the tab (not by colour alone)', async ({ page }) => {
      await open(page);
      await bar(page).getByRole('button', { name: 'Antrenman' }).click();
      await expect(page.locator('#member-portal-content')).toContainText(`E2E Bar ${stamp}`);
      const tab = page.locator('[data-portal-tab="workouts"]');
      await expect(tab).toHaveClass(/active/);
      await expect(tab).toHaveCSS('font-weight', '700');
      await expect(tab).not.toHaveCSS('border-top-color', 'rgba(0, 0, 0, 0)');
      await expect(page.locator('[data-portal-tab="overview"]')).toHaveCSS('font-weight', '400');
    });

    for (const inset of [0, 34]) {
      test(`the last element of the longest section scrolls clear of the bar and the pending button does not overlap it (inset ${inset}px)`, async ({ page, context }) => {
        await page.setViewportSize({ width: 375, height: 480 }); // short screen: every section is taller than it
        await open(page, inset);
        const barBox = await bar(page).boundingBox();
        expect(Math.round(barBox.y + barBox.height)).toBe(480);
        expect(barBox.height).toBeGreaterThanOrEqual(56 + inset);

        let longest = { tab: tabs[0], height: 0 };
        for (const tab of tabs) {
          await page.locator(`[data-portal-tab="${tab}"]`).click();
          const height = await page.evaluate(() => document.documentElement.scrollHeight);
          if (height > longest.height) longest = { tab, height };
        }
        await page.locator(`[data-portal-tab="${longest.tab}"]`).click();
        expect(longest.height).toBeGreaterThan(480);
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        const last = page.locator('#member-portal-content > :last-child');
        const bottomOfLast = async () => { const b = await last.boundingBox(); return b.y + b.height; };
        await expect.poll(bottomOfLast).toBeLessThanOrEqual(barBox.y);
        await last.click({ trial: true, position: { x: 2, y: 2 } }); // fails when something (the bar) would receive the click

        // One queued change, made the way a client makes it: tick an exercise without a connection.
        await page.locator('[data-portal-tab="workouts"]').click();
        await context.setOffline(true);
        await page.locator('.member-exercise-item', { hasText: 'E2E Squat' }).getByRole('button').click();
        const pending = page.locator('#sync-pending-button');
        await expect(pending).toHaveText('1');
        const pendingBox = await pending.boundingBox();
        expect(pendingBox.y + pendingBox.height, 'pending button ends above the bar').toBeLessThanOrEqual(barBox.y);
        const toast = await page.locator('#toast-region .toast').first().boundingBox();
        expect(toast.y + toast.height, 'toast ends above the bar').toBeLessThanOrEqual(barBox.y);
        await context.setOffline(false);
        await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('trainerpro_sync_queue') || '[]').length), { timeout: 20000 }).toBe(0);
      });
    }

    test('the session screen covers the bar', async ({ page }) => {
      await open(page);
      await page.locator('[data-portal-tab="workouts"]').click();
      await page.locator('.member-portal-list li', { hasText: `E2E Bar ${stamp}` }).getByRole('button', { name: 'Antrenmanı Başlat' }).click();
      await expect(page.locator('#member-session')).toBeVisible();
      const b = await bar(page).boundingBox();
      const topmost = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('#member-session') !== null, [b.x + 10, b.y + b.height / 2]);
      expect(topmost).toBe(true);
      await rest(admin, 'DELETE', `workout_sessions?member_id=eq.${memberId}&metadata->>workoutId=eq.${workoutId}`).catch(() => {});
    });
  });

  test('desktop: the bar is a normal row, not fixed', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'desktop only');
    await open(page);
    await expect(bar(page)).not.toHaveCSS('position', 'fixed');
    await expect(page.locator('[data-portal-tab="overview"] svg')).toBeHidden();
  });
});
