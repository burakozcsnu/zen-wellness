// Every modal is a real dialog: labelled, focus moves in, Tab stays inside, Escape closes like the close button, focus returns.
const { test, expect, login } = require('./fixtures');
const { env } = require('../helpers/api');

const MODALS = ['modal-member', 'modal-measurement', 'modal-new-food', 'modal-new-exercise', 'modal-program', 'modal-cardio',
  'modal-workout', 'modal-diet', 'modal-undo-log', 'modal-sync', 'modal-detail', 'modal-schedule'];

const openFrom = async (page, id) => {
  await page.locator('.fab').focus();
  await page.evaluate(m => window.openModal(m), id);
};
const insideModal = (page, id) => page.evaluate(m => document.getElementById(m).contains(document.activeElement), id);

test.describe('modal accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'admin', env.adminEmail, env.adminPassword);
    await expect(page.locator('#app-wrapper')).toBeVisible({ timeout: 15000 });
  });

  test('desktop: every modal is a labelled dialog, traps Tab, closes on Escape and returns focus', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'desktop only');
    for (const id of MODALS) {
      await openFrom(page, id);
      const modal = page.locator(`#${id}`);
      await expect(modal, id).toHaveAttribute('role', 'dialog');
      await expect(modal, id).toHaveAttribute('aria-modal', 'true');
      const labelId = await modal.getAttribute('aria-labelledby');
      expect(labelId, id).toBeTruthy();
      await expect(page.locator(`#${labelId}`), id).toHaveText(/\S/);
      expect(await insideModal(page, id), `${id}: focus inside after open`).toBe(true);
      const count = await page.evaluate(m => [...document.getElementById(m).querySelectorAll('button, input, [href], select, textarea, [tabindex]')]
        .filter(c => !c.disabled && c.tabIndex >= 0 && c.getClientRects().length).length, id);
      for (let i = 0; i < count + 2; i++) {
        await page.keyboard.press('Tab');
        expect(await insideModal(page, id), `${id}: Tab ${i} stays inside`).toBe(true);
      }
      await page.keyboard.press('Shift+Tab');
      expect(await insideModal(page, id), `${id}: Shift+Tab stays inside`).toBe(true);
      await page.keyboard.press('Escape');
      await expect(modal, id).toBeHidden();
      await expect(page.locator('.fab'), `${id}: focus returned`).toBeFocused();
    }
  });

  test('close span works from the keyboard and the workout modal keeps typed values while Tab cycles', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'desktop only');
    await openFrom(page, 'modal-new-food');
    await page.locator('#modal-new-food .close').focus();
    await expect(page.locator('#modal-new-food .close')).toHaveAttribute('aria-label', 'Kapat');
    await page.keyboard.press('Enter');
    await expect(page.locator('#modal-new-food')).toBeHidden();

    await openFrom(page, 'modal-workout');
    const field = page.locator('#modal-workout input[type=text], #modal-workout input:not([type])').first();
    await field.fill('E2E Squat');
    for (let i = 0; i < 40; i++) await page.keyboard.press('Tab');
    await expect(field).toHaveValue('E2E Squat');
  });

  test('phone smoke: a modal opens as a dialog with focus inside and Escape closes it', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'phone only');
    await openFrom(page, 'modal-member');
    await expect(page.locator('#modal-member')).toHaveAttribute('role', 'dialog');
    expect(await insideModal(page, 'modal-member')).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('#modal-member')).toBeHidden();
  });
});
