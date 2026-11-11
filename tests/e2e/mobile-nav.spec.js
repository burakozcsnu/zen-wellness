// Phone behaviour: swipe opens/closes the menu, the search bar does not pin over headings,
// and the client header buttons keep their text inside the box. Phone project only.
const { test, expect, login } = require('./fixtures');
const { env } = require('../helpers/api');

test.beforeEach(({}, info) => test.skip(info.project.name !== 'phone', 'phone layout only'));

// A finger moving from `from` to `to`, sent as real touch events to whatever is under the finger.
const swipe = (page, from, to) => page.evaluate(([a, b]) => {
  const el = document.elementFromPoint(a[0], a[1]);
  const send = (type, point) => {
    const touch = new Touch({ identifier: 1, target: el, clientX: point[0], clientY: point[1] });
    const live = type === 'touchend' ? [] : [touch];
    el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: live, targetTouches: live, changedTouches: [touch] }));
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
    await page.mouse.move(200, 500);
    await page.mouse.wheel(0, 700);
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
