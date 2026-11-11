// Sign in, sign up, password reset and sign out, as a person would use them.
// Sign-up and reset requests are answered by the test itself (no real e-mail is ever sent, Supabase's e-mail delivery
// is not tested here): what is checked is what the screen sends and what it tells the person.
const { test, expect, login } = require('./fixtures');
const { env } = require('../helpers/api');

// The app marks a signed-in screen with these body classes.
const expectSignedOut = page => Promise.all([expect(page.locator('body')).not.toHaveClass(/portal-entered/), expect(page.locator('body')).not.toHaveClass(/member-portal-active/)]);

const openForm = async (page, role) => {
  await page.goto('/');
  await page.locator('.brand-splash-logo').click({ force: true }); // endless breathing animation never counts as stable
  await page.locator(role === 'admin' ? '.portal-role-admin' : '.portal-role:not(.portal-role-admin)').click();
};

test.describe('sign in and out', () => {
  test('a wrong password is refused with a message, for trainer and client', async ({ page }) => {
    for (const [role, email] of [['admin', env.adminEmail], ['user', env.clientEmail]]) {
      await openForm(page, role);
      await page.locator('#auth-email').fill(email);
      await page.locator('#auth-password').fill('definitely-wrong-password');
      await page.locator('#modal-auth button[type="submit"]').click();
      await expect(page.locator('#auth-error')).not.toBeEmpty({ timeout: 15000 });
      await expect(page.locator('#auth-error')).toHaveText('E-posta veya şifre hatalı.'); // Supabase says "Invalid login credentials"
      await expectSignedOut(page);
    }
  });

  test('a client cannot enter the trainer panel, and a trainer cannot enter the client portal', async ({ page }) => {
    await login(page, 'admin', env.clientEmail, env.clientPassword); // client credentials on the trainer door
    await expect(page.locator('#auth-error')).not.toBeEmpty({ timeout: 15000 });
    await expectSignedOut(page);
    await login(page, 'user', env.adminEmail, env.adminPassword); // trainer credentials on the client door
    await expect(page.locator('#auth-error')).not.toBeEmpty({ timeout: 15000 });
    await expectSignedOut(page);
  });

  test('after a reload the person is taken straight back in; after signing out they are not', async ({ page }) => {
    await login(page, 'admin', env.adminEmail, env.adminPassword);
    await expect(page.locator('.member-card').first()).toBeVisible({ timeout: 20000 });
    // The app shows its splash on every load; choosing the role resumes the saved session without a password.
    await page.reload();
    await page.locator('.brand-splash-logo').click({ force: true });
    await page.locator('.portal-role-admin').click();
    await expect(page.locator('.member-card').first()).toBeVisible({ timeout: 20000 });

    if (await page.locator('.mobile-logo').isVisible()) await page.locator('.mobile-logo').click();
    await page.getByRole('button', { name: /Çıkış Yap/ }).first().click();
    await expect(page.locator('#brand-splash')).toBeVisible({ timeout: 10000 });
    await page.reload();
    await page.locator('.brand-splash-logo').click({ force: true });
    await page.locator('.portal-role-admin').click();
    await expect(page.locator('#modal-auth')).toBeVisible(); // asks for the password again
    await expectSignedOut(page);
  });
});

test.describe('sign up and password reset', () => {
  test('a new client can open the sign-up form and gets the verify-your-e-mail message', async ({ page }) => {
    let sent;
    await page.route('**/auth/v1/signup**', route => {
      sent = route.request().postDataJSON();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: '00000000-0000-0000-0000-000000000001', email: sent.email, app_metadata: {}, user_metadata: sent.data }) });
    });
    await openForm(page, 'user');
    await page.locator('#auth-signup-toggle').click();
    await expect(page.locator('#modal-auth h2')).toHaveText('Danışan Kaydı');
    await page.locator('#auth-email').fill('yeni.kayit@example.com');
    await page.locator('#auth-password').fill('Guclu-Parola-123');
    await page.locator('#modal-auth button[type="submit"]').click();
    await expect(page.locator('#auth-error')).toContainText('E-posta kutunuzu doğrulayın', { timeout: 10000 });
    expect(sent).toMatchObject({ email: 'yeni.kayit@example.com', password: 'Guclu-Parola-123' });
    await page.locator('#auth-signup-toggle').click(); // back to sign in
    await expect(page.locator('#modal-auth h2')).toHaveText('Danışan Girişi');
  });

  test('forgot password: asks for the e-mail first, then confirms the link was sent', async ({ page }) => {
    let sent;
    await page.route('**/auth/v1/recover**', route => {
      sent = route.request().postDataJSON();
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
    await openForm(page, 'user');
    await page.locator('#auth-reset-button').click();
    await expect(page.locator('#auth-error')).toHaveText('Önce e-posta adresinizi girin.');
    expect(sent).toBeUndefined(); // nothing was requested without an address
    await page.locator('#auth-email').fill(env.clientEmail);
    await page.locator('#auth-reset-button').click();
    await expect(page.locator('#auth-error')).toContainText('gönderildi', { timeout: 10000 });
    expect(sent.email).toBe(env.clientEmail);
  });

  test('forgot password: a failed request shows a friendly message', async ({ page }) => {
    await page.route('**/auth/v1/recover**', route => route.fulfill({ status: 429, contentType: 'application/json', body: '{"msg":"rate limit"}' }));
    await openForm(page, 'user');
    await page.locator('#auth-email').fill(env.clientEmail);
    await page.locator('#auth-reset-button').click();
    await expect(page.locator('#auth-error')).toHaveText('Şifre sıfırlama bağlantısı gönderilemedi.', { timeout: 10000 });
  });
});

test.describe('small screens', () => {
  for (const [label, size] of [['short laptop window', { width: 1280, height: 600 }], ['small phone', { width: 375, height: 560 }]]) {
    test(`every button of the client login form can be reached on a ${label}`, async ({ page }) => {
      await page.setViewportSize(size);
      await openForm(page, 'user');
      for (const selector of ['#modal-auth button[type="submit"]', '#auth-signup-toggle', '#auth-reset-button']) {
        await page.locator(selector).scrollIntoViewIfNeeded({ timeout: 5000 });
        const box = await page.locator(selector).boundingBox();
        expect(box.y + box.height, `${selector} must end inside the ${size.height}px screen once scrolled to`).toBeLessThanOrEqual(size.height + 1);
      }
      await page.locator('#auth-reset-button').click({ timeout: 5000 }); // reachable and clickable, not cut off
      await expect(page.locator('#auth-error')).toHaveText('Önce e-posta adresinizi girin.');
    });
  }
});
