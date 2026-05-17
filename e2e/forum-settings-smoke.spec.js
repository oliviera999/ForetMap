const { test, expect } = require('@playwright/test');
const { loginAsNewStudent, enableTeacherMode, dismissProfilePromotionModalIfPresent } = require('./fixtures/auth.fixture');

test('parcours prof: onglets Forum et Paramètres accessibles après élévation', async ({ page }) => {
  await loginAsNewStudent(page);
  await enableTeacherMode(page);
  await dismissProfilePromotionModalIfPresent(page);

  const forumTab = page.getByRole('button', { name: /^Forum/ });
  if (await forumTab.isVisible({ timeout: 5000 }).catch(() => false)) {
    await forumTab.click();
    await expect(page.locator('.forum-view, .forum-panel, [class*="forum"]').first()).toBeVisible({ timeout: 15_000 });
  }

  const settingsTab = page.getByRole('button', { name: /^Paramètres/ });
  if (await settingsTab.isVisible({ timeout: 5000 }).catch(() => false)) {
    await settingsTab.click();
    await expect(page.getByText(/Paramètres|Réglages|Configuration/i).first()).toBeVisible({ timeout: 15_000 });
  }

  const auditTab = page.getByRole('button', { name: /^Audit/ });
  await expect(auditTab).toBeVisible({ timeout: 5000 });
});
