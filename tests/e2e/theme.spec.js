// Light theme ("gym-bright"): follows the system by default, the toggle cycles and persists, no flash on load,
// charts follow the theme, and every visible text and control reaches WCAG AA contrast, measured from the real rendered colours.
const { test, expect, login } = require('./fixtures');
const { env, signIn, rest } = require('../helpers/api');

const stamp = Date.now();
const day = offset => { const d = new Date(); d.setDate(d.getDate() - offset); return d.toLocaleDateString('en-CA'); };
const names = { member: `E2E Tema ${stamp}`, workout: `E2E Tema Antrenman ${stamp}` };
const clean = problems => problems.filter(p => !p.includes('Failed to load resource'));

// Measures every visible text element (and the border of inputs and buttons) in the page, blending translucent colours over
// what is really behind them. Text needs 4.5:1 (3:1 for large text), borders and chart colours 3:1.
// Runs in the page. Returns { measured, failures }. Gradients and images count as transparent (the solid colour below them is used).
const audit = (page, scope = 'body') => page.evaluate(scopeSelector => {
  const parse = value => { const m = value.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r, g, b, a }; };
  const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  const lum = c => { const v = [c.r, c.g, c.b].map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const backdrop = el => { // what is behind the element's own background
    const layers = [];
    for (let node = el.parentElement; node; node = node.parentElement) {
      const bg = parse(getComputedStyle(node).backgroundColor);
      if (bg && bg.a > 0) { layers.push(bg); if (bg.a === 1) break; }
    }
    return layers.reduceRight((under, layer) => over(layer, under), { r: 255, g: 255, b: 255, a: 1 });
  };
  const ownBackground = el => { const bg = parse(getComputedStyle(el).backgroundColor); return bg && bg.a > 0 ? over(bg, backdrop(el)) : backdrop(el); };
  const topmost = el => { let r = el.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) { el.scrollIntoView({ block: 'center', inline: 'nearest' }); r = el.getBoundingClientRect(); } const hit = document.elementFromPoint(Math.min(Math.max(r.x + r.width / 2, 0), innerWidth - 1), Math.min(Math.max(r.y + r.height / 2, 0), innerHeight - 1)); return hit && (el === hit || el.contains(hit) || hit.contains(el)); };
  const visible = el => { const s = getComputedStyle(el), r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0.5 && r.width > 1 && r.height > 1 && !el.closest('.session-hidden, [hidden], [aria-hidden="true"]') && !el.disabled; };
  const label = el => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''}`;
  const failures = [];
  let measured = 0;
  const root = document.querySelector(scopeSelector);
  for (const el of root.querySelectorAll('*')) {
    if (['SCRIPT', 'STYLE', 'SVG', 'CANVAS', 'OPTION'].includes(el.tagName.toUpperCase()) || !visible(el)) continue;
    const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) || (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) && (el.value || '').length);
    const style = getComputedStyle(el);
    if (hasText && topmost(el)) {
      const bg = ownBackground(el);
      const fg = parse(style.color);
      const size = parseFloat(style.fontSize), bold = Number(style.fontWeight) >= 700;
      const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
      const got = ratio(over(fg, bg), bg);
      measured++;
      if (got < need) failures.push(`${label(el)} text "${(el.textContent || el.value || '').trim().slice(0, 30)}" ${got.toFixed(2)} < ${need} (${style.color} on rgb(${bg.r | 0},${bg.g | 0},${bg.b | 0}))`);
    }
    if (['INPUT', 'SELECT', 'BUTTON'].includes(el.tagName) && el.type !== 'checkbox' && el.type !== 'radio' && topmost(el)) {
      const edge = parse(style.borderTopColor);
      const solid = parseFloat(style.borderTopWidth) > 0 && edge && edge.a > 0;
      const under = backdrop(el), bg = ownBackground(el);
      // A control must stand out by its border or by its fill: 3:1 against what is behind it.
      const best = Math.max(solid ? ratio(over(edge, under), under) : 0, ratio(bg, under));
      if (el.tagName !== 'BUTTON' || solid) { measured++; if (best < 3) failures.push(`${label(el)} edge ${best.toFixed(2)} < 3`); }
    }
  }
  return { measured, failures };
}, scope);

const theme = page => page.evaluate(() => document.documentElement.dataset.theme);
const choice = page => page.evaluate(() => { try { return localStorage.getItem('zen-theme'); } catch { return 'blocked'; } });

test.describe('theme: system default, toggle, persistence', () => {
  test.use({ colorScheme: 'light' });

  test('with nothing saved the app follows the system, also live', async ({ page }) => {
    await page.goto('/');
    expect(await theme(page)).toBe('light');
    expect(await choice(page)).toBeNull();
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => theme(page)).toBe('dark');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(() => theme(page)).toBe('light');
  });

  test('the theme is set before the stylesheet is even requested (no flash)', async ({ page }) => {
    await page.addInitScript(() => {
      window.__themeAtFirstSet = null;
      // The observer watches the whole document: the root element does not exist yet when this init script runs.
      new MutationObserver(() => { if (window.__themeAtFirstSet === null) window.__themeAtFirstSet = { theme: document.documentElement.dataset.theme, stylesheetParsed: !!document.querySelector('link[rel="stylesheet"]') }; })
        .observe(document, { subtree: true, attributes: true, attributeFilter: ['data-theme'] });
    });
    await page.goto('/');
    expect(await page.evaluate(() => window.__themeAtFirstSet)).toEqual({ theme: 'light', stylesheetParsed: false });
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#f6f1ea');
  });

  test('a saved choice beats the system and an unreadable storage value falls back to the system', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('zen-theme', 'dark'));
    await page.reload();
    expect(await theme(page)).toBe('dark');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#050505');
    await page.evaluate(() => localStorage.setItem('zen-theme', 'purple'));
    await page.reload();
    expect(await theme(page)).toBe('light');
  });

  test('faint white inline borders and tints written for dark get visible light equivalents', async ({ page }) => {
    await page.goto('/');
    const colours = await page.evaluate(() => {
      const probe = document.createElement('div');
      // The two inline spellings used in script.js and index.html.
      probe.innerHTML = '<div style="border-bottom:1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.02);">a</div>' +
        '<div style="border: 1px solid rgba(255, 255, 255, 0.05);">b</div>';
      document.body.appendChild(probe);
      const [one, two] = probe.children;
      return [getComputedStyle(one).borderBottomColor, getComputedStyle(one).backgroundColor, getComputedStyle(two).borderTopColor];
    });
    for (const colour of colours) expect(colour).not.toMatch(/rgba\(255, 255, 255/);
  });

  test('the client portal button cycles Otomatik, Açık, Koyu, persists over a reload, and keeps the layout', async ({ page, problems }) => {
    await login(page, 'user', env.clientEmail, env.clientPassword);
    await expect(page.getByText('Hoş geldiniz')).toBeVisible({ timeout: 20000 });
    const button = page.locator('.member-portal-header .theme-toggle');
    await expect(button).toHaveText('Tema: Otomatik');
    expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await button.click();
    await expect(button).toHaveText('Tema: Açık');
    expect(await theme(page)).toBe('light');
    await button.click();
    await expect(button).toHaveText('Tema: Koyu');
    expect(await theme(page)).toBe('dark');
    expect(await choice(page)).toBe('dark');
    await page.reload(); // the choice must already be applied before the portal reopens
    expect(await theme(page)).toBe('dark');
    await expect(page.locator('.member-portal-header .theme-toggle')).toHaveText('Tema: Koyu', { timeout: 20000 });
    expect(await theme(page)).toBe('dark');
    await page.evaluate(() => window.cycleTheme()); // the button's own handler
    await expect(page.locator('.member-portal-header .theme-toggle')).toHaveText('Tema: Otomatik');
    expect(await theme(page)).toBe('light'); // auto again: the system is light
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(clean(problems)).toEqual([]);
  });
});

test.describe('light theme: measured contrast and charts', () => {
  test.use({ colorScheme: 'light' });
  test.describe.configure({ mode: 'serial' });
  let admin, memberId, clientMemberId, clientWorkoutId;

  test.beforeAll(async () => {
    admin = await signIn(env.adminEmail, env.adminPassword);
    [{ id: memberId }] = await rest(admin, 'POST', 'uyeler', { ad_soyad: names.member, boy: 170, brans: 'Fitness', cinsiyet: 'Erkek', trainer_id: 'burak-ozcan', kayit_tarihi: day(0) });
    await rest(admin, 'POST', 'olcumler', [[60, 20, 80], [0, 18, 78]].map(([ago, fat, weight]) => ({ member_id: memberId, tarih: day(ago), fat, weight })));
    const row = (ad, set_no, weight) => ({ ad, set_no, weight, reps: '8', sure: '', tip: 'Normal', tempo: '', rest_seconds: 30, rpe: null });
    await rest(admin, 'POST', 'antrenmanlar', { id: stamp, member_id: memberId, tarih: day(0), sablon: names.workout, setler: JSON.stringify([row('E2E Squat', 1, '60'), row('E2E Squat', 2, '62')]), rest_seconds: 30 });
    const now = new Date().toISOString();
    await rest(admin, 'POST', 'workout_sessions', { id: stamp + 1, member_id: memberId, source: 'trainer_pro', activity_type: 'strength', status: 'completed', started_at: now, ended_at: now });
    await rest(admin, 'POST', 'workout_session_steps', { id: stamp + 2, workout_session_id: stamp + 1, exercise_name: 'E2E Row', step_index: 0, reps: 10, weight: 50, completed: true, completed_at: now });
    // A workout for the test client, so the client's session screen can be opened.
    [{ id: clientMemberId }] = await rest(admin, 'GET', `uyeler?select=id&email=eq.${encodeURIComponent(env.clientEmail)}`);
    clientWorkoutId = stamp + 3;
    await rest(admin, 'POST', 'antrenmanlar', { id: clientWorkoutId, member_id: clientMemberId, tarih: '2099-12-30', sablon: `${names.workout} C`, setler: JSON.stringify([row('E2E Squat', 1, '60'), row('E2E Squat', 2, '60')]), rest_seconds: 30 });
  });
  test.afterAll(async () => {
    for (const q of [`workout_sessions?member_id=eq.${clientMemberId}&status=eq.active`]) await rest(admin, 'DELETE', q).catch(() => {});
    await rest(admin, 'DELETE', `antrenmanlar?id=eq.${clientWorkoutId}`).catch(() => {});
    if (memberId) await rest(admin, 'DELETE', `uyeler?id=eq.${memberId}`).catch(() => {}); // cascades to the member's rows
  });

  // A page transition starts within two frames of a click, and while it runs every hit test lands on <html>: wait it out.
  const settle = async page => {
    await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    await page.waitForFunction(() => document.elementFromPoint(innerWidth / 2, innerHeight / 2) !== document.documentElement);
  };
  const expectAa = async (page, where, scope, atLeast = 6) => {
    await settle(page);
    const { measured, failures } = await audit(page, scope);
    expect(measured, `${where}: nothing was measured`).toBeGreaterThanOrEqual(atLeast);
    expect(failures, where).toEqual([]);
    return measured;
  };
  const openDrawer = async page => { const logo = page.locator('.mobile-logo'); if (await logo.isVisible()) await logo.click(); };
  const closeDrawer = page => page.evaluate(() => window.toggleMobileMenu && window.toggleMobileMenu(false));

  test('trainer: list, drawer, every profile tab, the coach card, a toast, and the chart', async ({ page, problems }) => {
    await login(page, 'admin', env.adminEmail, env.adminPassword);
    await expect(page.locator('#app-wrapper')).toBeVisible({ timeout: 20000 });
    expect(await theme(page)).toBe('light');
    await expect(page.locator('.member-card').first()).toBeVisible({ timeout: 20000 });
    await page.waitForTimeout(800);
    await expectAa(page, 'trainer list');
    await openDrawer(page);
    await page.waitForTimeout(400);
    const toggle = page.locator('.sidebar-actions .theme-toggle');
    await expect(toggle).toHaveText('Tema: Otomatik');
    expect((await toggle.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await expectAa(page, 'trainer menu', '.sidebar');
    await closeDrawer(page);

    await page.locator('.member-card', { hasText: names.member }).click({ timeout: 20000 });
    await expect(page.locator('#coach-insights')).toContainText('Koç özeti');
    await page.waitForTimeout(600);
    await expectAa(page, 'coach card tab');
    await expectAa(page, 'coach card', '#coach-insights');
    const ids = await page.locator('#btn-tab-analytics').locator('xpath=..').locator('.tab-btn').evaluateAll(list => list.map(b => b.id));
    expect(ids.length).toBeGreaterThan(2);
    for (const id of ids) {
      await page.locator(`#${id}`).click();
      await page.waitForTimeout(500);
      await expectAa(page, `profile tab ${id}`);
    }

    await page.evaluate(() => { window.showToast('E2E hata iletisi', 'error'); window.showToast('E2E başarı iletisi', 'success'); });
    await expect(page.locator('.toast')).toHaveCount(2);
    await expectAa(page, 'toasts', '#toast-region', 2);

    // Chart: the colours come from the theme and are redrawn when it changes (no reload).
    await page.locator('#btn-tab-analytics').click();
    await page.locator('#chart-cat').selectOption('olcum');
    await page.locator('#chart-sub-cat').selectOption('fat');
    const chart = () => page.evaluate(() => {
      const c = Chart.getChart(document.getElementById('mainChart')), d = c.data.datasets[0];
      return { line: d.borderColor, points: d.pointBackgroundColor, tick: c.options.scales.x.ticks.color };
    });
    expect(await chart()).toEqual({ line: '#7a4a1c', points: ['#7a4a1c', '#1f7a45'], tick: '#5c4e42' });
    await openDrawer(page);
    const toggle2 = page.locator('.sidebar-actions .theme-toggle');
    await toggle2.click(); // auto -> açık
    await expect(toggle2).toHaveText('Tema: Açık');
    await toggle2.click(); // -> koyu
    await expect(toggle2).toHaveText('Tema: Koyu');
    expect(await theme(page)).toBe('dark');
    await expect.poll(chart).toEqual({ line: '#e4ba94', points: ['#e4ba94', '#35d07f'], tick: '#b7a69a' }); // redrawn without a reload
    await toggle2.click(); // -> otomatik (the system is light)
    await expect(toggle2).toHaveText('Tema: Otomatik');
    await expect.poll(chart).toEqual({ line: '#7a4a1c', points: ['#7a4a1c', '#1f7a45'], tick: '#5c4e42' });
    expect(clean(problems)).toEqual([]);
  });

  test('chart colours are readable on the chart card (3:1)', async ({ page }) => {
    await page.goto('/');
    const ratios = await page.evaluate(() => {
      const css = getComputedStyle(document.documentElement);
      const rgb = name => { const probe = document.createElement('i'); probe.style.color = css.getPropertyValue(name).trim(); document.body.appendChild(probe); const c = getComputedStyle(probe).color.match(/\d+/g).map(Number); probe.remove(); return c; };
      const lum = c => { const v = c.map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
      const surface = lum(rgb('--surface'));
      return ['--chart-base', '--chart-better', '--chart-worse', '--chart-tick'].map(n => (Math.max(surface, lum(rgb(n))) + 0.05) / (Math.min(surface, lum(rgb(n))) + 0.05));
    });
    for (const r of ratios) expect(r).toBeGreaterThanOrEqual(3);
  });

  test('client: every portal tab and the session screen', async ({ page, problems }) => {
    await login(page, 'user', env.clientEmail, env.clientPassword);
    await expect(page.getByText('Hoş geldiniz')).toBeVisible({ timeout: 20000 });
    expect(await theme(page)).toBe('light');
    await page.waitForTimeout(600);
    await expectAa(page, 'client header and overview');
    const tabs = await page.locator('[data-portal-tab]').evaluateAll(list => list.map(b => b.dataset.portalTab));
    expect(tabs.length).toBe(7);
    for (const tab of tabs) {
      await page.locator(`[data-portal-tab="${tab}"]`).click();
      await page.waitForTimeout(400);
      await expectAa(page, `client tab ${tab}`);
    }
    await page.locator('[data-portal-tab="workouts"]').click();
    await page.locator('.member-portal-list li', { hasText: `${names.workout} C` }).getByRole('button', { name: 'Antrenmanı Başlat' }).click();
    await expect(page.locator('#member-session')).toBeVisible();
    await page.waitForTimeout(400);
    await expectAa(page, 'session screen', '#member-session');
    await page.locator('#member-session').locator('[data-step="0"]').getByRole('button', { name: 'Tamam' }).click();
    await expect(page.locator('.member-session-restbar')).toBeVisible();
    await expectAa(page, 'session screen with the rest bar', '#member-session');
    expect(clean(problems)).toEqual([]);
  });
});
