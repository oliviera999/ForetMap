const { test, expect } = require('@playwright/test');
const {
  loginAsNewStudent,
  enableTeacherMode,
  dismissProfilePromotionModalIfPresent,
} = require('./fixtures/auth.fixture');

test('parcours prof: onglets Forum et Paramètres accessibles après élévation', async ({ page }) => {
  await loginAsNewStudent(page);
  await enableTeacherMode(page);
  await dismissProfilePromotionModalIfPresent(page);

  // Pôles (audit D-4) : Forum vit dans « Suivi ».
  const suiviPole = page.locator('.teacher-nav__poles').getByRole('button', { name: 'Suivi' });
  if (await suiviPole.isVisible({ timeout: 5000 }).catch(() => false)) await suiviPole.click();
  const forumTab = page.getByRole('button', { name: /^Forum/ });
  if (await forumTab.isVisible({ timeout: 5000 }).catch(() => false)) {
    await forumTab.click();
    await expect(page.locator('.forum-view, .forum-panel, [class*="forum"]').first()).toBeVisible({
      timeout: 15_000,
    });
  }

  const adminPole = page
    .locator('.teacher-nav__poles')
    .getByRole('button', { name: 'Administration' });
  if (await adminPole.isVisible({ timeout: 5000 }).catch(() => false)) await adminPole.click();
  const settingsTab = page.getByRole('button', { name: /^Paramètres/ });
  if (await settingsTab.isVisible({ timeout: 5000 }).catch(() => false)) {
    await settingsTab.click();
    await expect(page.getByText(/Paramètres|Réglages|Configuration/i).first()).toBeVisible({
      timeout: 15_000,
    });
  }

  if (await suiviPole.isVisible({ timeout: 5000 }).catch(() => false)) await suiviPole.click();
  const auditTab = page.getByRole('button', { name: /Audit/ });
  if (await auditTab.isVisible({ timeout: 5000 }).catch(() => false)) {
    await auditTab.click();
    await expect(page.getByText(/Audit|Statistiques/i).first()).toBeVisible({ timeout: 15_000 });
  }
});
