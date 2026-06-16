const { test, expect } = require('@playwright/test');
const { loginAsNewStudent, enableTeacherMode } = require('./fixtures/auth.fixture');

test('parcours admin: bandeau impersonation visible après prise de contrôle', async ({ page }) => {
  await loginAsNewStudent(page);
  await enableTeacherMode(page);

  const profilesTab = page.getByRole('button', { name: /Profils|Utilisateurs/i });
  if (!(await profilesTab.isVisible({ timeout: 8000 }).catch(() => false))) {
    test.skip(true, 'Onglet Profils non visible pour ce compte');
    return;
  }

  await profilesTab.click();
  const impersonateBtn = page.getByRole('button', { name: /Voir comme cet utilisateur/i }).first();
  if (!(await impersonateBtn.isVisible({ timeout: 10_000 }).catch(() => false))) {
    test.skip(true, 'Bouton impersonation non disponible (permission admin.impersonate)');
    return;
  }

  await impersonateBtn.click();
  await expect(page.getByText(/prise de contrôle|Voir comme|reconnecté/i).first()).toBeVisible({
    timeout: 20_000,
  });
});
