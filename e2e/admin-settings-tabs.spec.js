const { test, expect } = require('@playwright/test');
const {
  loginAsNewStudent,
  enableTeacherMode,
  dismissProfilePromotionModalIfPresent,
} = require('./fixtures/auth.fixture');

/**
 * Smoke admin Paramètres : sous-onglets thématiques après élévation prof/admin.
 * Tolérant si le compte de test n'a pas tous les droits (onglets conditionnels).
 */
test('admin Paramètres : sous-onglets Accueil / Cartographie / Aide', async ({ page }) => {
  await loginAsNewStudent(page);
  await enableTeacherMode(page);
  await dismissProfilePromotionModalIfPresent(page);

  const adminPole = page
    .locator('.teacher-nav__poles')
    .getByRole('button', { name: 'Administration' });
  if (!(await adminPole.isVisible({ timeout: 8000 }).catch(() => false))) {
    test.skip(true, 'Pôle Administration inaccessible pour ce compte de test');
  }
  await adminPole.click();

  const settingsTab = page.getByRole('button', { name: /^Paramètres/ });
  if (!(await settingsTab.isVisible({ timeout: 8000 }).catch(() => false))) {
    test.skip(true, 'Onglet Paramètres inaccessible');
  }
  await settingsTab.click();

  await expect(page.getByText(/Paramètres administrateur/i).first()).toBeVisible({
    timeout: 15_000,
  });

  const accueil = page.getByRole('tab', { name: /Accueil/i });
  const carto = page.getByRole('tab', { name: /Cartographie/i });
  const aide = page.getByRole('tab', { name: /Aide/i });

  if (await accueil.isVisible({ timeout: 3000 }).catch(() => false)) {
    await accueil.click();
  }

  const search = page.getByTestId('settings-admin-search');
  if (await search.isVisible({ timeout: 5000 }).catch(() => false)) {
    await expect(page.getByLabelText(/Rechercher un paramètre/i)).toBeVisible();
    await page.getByLabelText(/Rechercher un paramètre/i).fill('maintenance');
    await expect(page.getByTestId('settings-admin-search-results')).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole('button', { name: /Effacer la recherche/i }).click();
    await expect(page.getByRole('tab', { name: /Accueil/i })).toBeVisible();
  }

  if (await carto.isVisible({ timeout: 3000 }).catch(() => false)) {
    await carto.click();
    await expect(
      page.getByRole('tab', { name: /Cartes|Zones|Catégories|Parcours/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  }

  if (await aide.isVisible({ timeout: 3000 }).catch(() => false)) {
    await aide.click();
  }
});
