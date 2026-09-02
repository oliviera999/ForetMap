const { test, expect } = require('@playwright/test');
const { loginAsNewStudent, dismissDiscoveryTourIfPresent } = require('./fixtures/auth.fixture');

/**
 * Audit UI (D-3) — premier filet mobile dédié (projet `mobile-chromium`, 390×844 tactile) :
 * l'écran carte et la navigation basse élève n'avaient AUCUNE couverture mobile alors que
 * les élèves utilisent surtout téléphones/tablettes. Vérifie : la carte se monte, la barre
 * d'outils et la barre basse sont visibles, la navigation entre onglets fonctionne, et la
 * feuille de filtres carte (bottom sheet, réparée par le lot A) s'ouvre et se ferme.
 */

test('mobile : carte, navigation basse et feuille de filtres', async ({ page }) => {
  test.setTimeout(240_000);
  await loginAsNewStudent(page);
  await dismissDiscoveryTourIfPresent(page);

  // La barre basse élève est visible et l'onglet Carte est accessible.
  const bottomNav = page.locator('nav.bottom-nav');
  await expect(bottomNav).toBeVisible({ timeout: 60_000 });
  const mapBtn = bottomNav.getByRole('button', { name: 'Carte', exact: true });
  if ((await mapBtn.count()) > 0) {
    await mapBtn.click();
  }

  // L'écran carte se monte : canevas + barre d'outils.
  await expect(page.locator('.map-view-canvas').first()).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.map-view-toolbar').first()).toBeVisible({ timeout: 30_000 });

  // La feuille de filtres carte s'ouvre en bottom sheet et se referme.
  const filtersToggle = page
    .locator('.map-location-filters')
    .getByRole('button', { name: /Filtres/ })
    .first();
  if ((await filtersToggle.count()) > 0) {
    await filtersToggle.click();
    const sheet = page.locator('.task-filters-sheet.map-location-filters-sheet');
    await expect(sheet).toBeVisible({ timeout: 15_000 });
    await sheet.getByRole('button', { name: 'Fermer les filtres' }).click();
    await expect(sheet).toBeHidden({ timeout: 15_000 });
  }

  // Navigation entre onglets par la barre basse (Biodiversité ↔ retour Carte).
  await bottomNav.getByRole('button', { name: 'Biodiversité' }).click();
  await expect(page.locator('.map-view-canvas')).toHaveCount(0, { timeout: 30_000 });
  if ((await mapBtn.count()) > 0) {
    await mapBtn.click();
    await expect(page.locator('.map-view-canvas').first()).toBeVisible({ timeout: 60_000 });
  }
});
