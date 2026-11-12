// Phone behaviour: swipe opens/closes the menu, the search bar does not pin over headings,
// and the client header buttons keep their text inside the box. Phone project only.
const { test, expect, login } = require('./fixtures');
const { env } = require('../helpers/api');

test.beforeEach(({}, info) => test.skip(!info.project.name.startsWith('phone'), 'phone layout only'));

// A finger moving from `from` to `to`, sent as real touch events to whatever is under the finger.
const swipe = (page, from, to) => page.evaluate(([a, b]) => {
  const el = document.elementFromPoint(a[0], a[1]);
  const send = (type, point) => {
    const touch = { identifier: 1, target: el, clientX: point[0], clientY: point[1] };
    const live = type === 'touchend' ? [] : [touch];
    let event;
    try { // Chromium builds real touch events; Safari has no Touch constructor, so it gets a plain event carrying the same fields
      const real = new Touch(touch);
      const realLive = type === 'touchend' ? [] : [real];
      event = new TouchEvent(type, { bubbles: true, cancelable: true, touches: realLive, targetTouches: realLive, changedTouches: [real] });
    } catch {
      event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, { touches: { value: live }, targetTouches: { value: live }, changedTouches: { value: [touch] } });
    }
    el.dispatchEvent(event);
  };
  send('touchstart', a);
  send('touchmove', [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
  send('touchend', b);
}, [from, to]);

test.describe('trainer menu', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'admin', env.adminEmail, env.adminPassword);
    await expect(page.locator('#app-wrapper')).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(1200);
  });
  const sidebar = page => page.locator('.sidebar');

  test('swiping right opens the menu and swiping left closes it', async ({ page }) => {
    await expect(sidebar(page)).not.toHaveClass(/mobile-open/);
    await swipe(page, [120, 600], [300, 610]);
    await expect(sidebar(page)).toHaveClass(/mobile-open/);
    await expect(page.locator('.mobile-logo')).toHaveAttribute('aria-expanded', 'true');
    await swipe(page, [300, 600], [100, 610]);
    await expect(sidebar(page)).not.toHaveClass(/mobile-open/);
  });

  test('scrolling, edge swipes, short swipes and swipes inside a form do not open it', async ({ page }) => {
    await swipe(page, [200, 300], [210, 650]);   // scrolling down
    await swipe(page, [10, 600], [200, 600]);    // from the very edge (iPhone "back" gesture)
    await swipe(page, [150, 600], [185, 600]);   // too short
    await expect(sidebar(page)).not.toHaveClass(/mobile-open/);
    await page.locator('#global-search-keyword').scrollIntoViewIfNeeded();
    const box = await page.locator('#global-search-keyword').boundingBox();
    await swipe(page, [box.x + 20, box.y + 10], [box.x + 200, box.y + 12]); // selecting text in the search box
    await expect(sidebar(page)).not.toHaveClass(/mobile-open/);
  });

  test('the search bar scrolls away with the page instead of pinning over headings', async ({ page }) => {
    await expect(page.locator('.global-search-bar')).toHaveCSS('position', 'static');
    // Scroll until the page has really moved (it may still be loading and too short at first). Mobile Safari has no mouse wheel.
    await expect.poll(() => page.evaluate(() => { const content = document.querySelector('.content'); content.scrollTop = 700; return content.scrollTop; }), { timeout: 15000 }).toBeGreaterThan(80);
    const bar = await page.locator('.global-search-bar').boundingBox();
    const brand = await page.locator('.mobile-brand').boundingBox();
    expect(bar.y + bar.height).toBeLessThanOrEqual(brand.y + brand.height + 1); // scrolled up under the logo bar, not pinned below it
  });
});

test('client header: every button keeps its text inside its box and on screen', async ({ page }) => {
  await login(page, 'user', env.clientEmail, env.clientPassword);
  await expect(page.locator('#member-portal')).toBeVisible({ timeout: 20000 });
  const buttons = await page.locator('.member-portal-header button').evaluateAll(list => list.map(b => {
    const r = b.getBoundingClientRect();
    return { text: b.innerText, clipped: b.scrollWidth > b.clientWidth, offScreen: r.right > innerWidth + 1 || r.left < -1, height: Math.round(r.height) };
  }));
  expect(buttons.length).toBe(2);
  for (const b of buttons) {
    expect(b.clipped, `${b.text} text sticks out of its box`).toBe(false);
    expect(b.offScreen, `${b.text} is off screen`).toBe(false);
    expect(b.height).toBeGreaterThanOrEqual(44);
  }
});

// The phone header must hold the logo whatever the notch/status-bar height is (iPhone home-screen app: about 47-59 px).
// Chromium reports a notch of 0, so the notch is simulated by rewriting the CSS function that reads it.
for (const notch of [0, 47, 59]) {
  test(`trainer header: logo bar contains the logo and the search bar does not cover it (notch ${notch}px)`, async ({ page }) => {
    await page.route('**/style.css*', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: (await response.text()).replace(/env\(safe-area-inset-top\)/g, `${notch}px`) });
    });
    await login(page, 'admin', env.adminEmail, env.adminPassword);
    await expect(page.locator('#app-wrapper')).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(1200);
    const box = selector => page.locator(selector).boundingBox();
    const brand = await box('.mobile-brand');
    const logo = await box('.mobile-logo');
    const wordmark = await box('.mobile-wordmark');
    const bar = await box('.global-search-bar');
    expect(brand.y + brand.height, 'logo bar ends above the search bar').toBeLessThanOrEqual(bar.y + 1);
    expect(logo.y + logo.height, 'logo stays inside the logo bar').toBeLessThanOrEqual(brand.y + brand.height + 8);
    expect(wordmark.y + wordmark.height, 'wordmark is not under the search bar').toBeLessThanOrEqual(bar.y);
    expect(logo.y, 'logo is not above the screen').toBeGreaterThanOrEqual(0);
    // Nothing but the logo bar's own content may be drawn over it: the first thing under its centre is the logo bar itself.
    const topmost = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('.mobile-brand') !== null, [wordmark.x + 4, wordmark.y + wordmark.height / 2]);
    expect(topmost).toBe(true);
  });
}
