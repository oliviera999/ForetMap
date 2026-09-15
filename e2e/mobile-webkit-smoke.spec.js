const { test, expect } = require('@playwright/test');
const { loginAsNewStudent, dismissDiscoveryTourIfPresent } = require('./fixtures/auth.fixture');

/**
 * Smoke WebKit mobile (projet `mobile-webkit`, device iPhone 13).
 * Filet CSS/touch WebKit — pas un substitut de Safari iOS réel (PWA standalone, boussole).
 * Validé surtout en CI Linux ; sous Windows local, installer webkit peut être fragile.
 */

// Depuis l'unification des scènes sur `SharedMapStage`, la carte de travail **en
// consultation** est rendue par `WorkMapStage` avec la classe `map-view-stage` ; le
// `map-view-canvas` historique ne subsiste que pour le mode édition (marqueur déverrouillé).
// Les deux sélecteurs sont donc visés ensemble : « l'écran carte est monté ».
const MAP_STAGE = '.map-view-stage, .map-view-canvas';

test('webkit : barre Plus puis retour Carte', async ({ page }) => {
  test.setTimeout(240_000);
  await loginAsNewStudent(page);
  await dismissDiscoveryTourIfPresent(page);

  const bottomNav = page.locator('nav.bottom-nav');
  await expect(bottomNav).toBeVisible({ timeout: 60_000 });
  await expect(bottomNav).toHaveClass(/bottom-nav--compact/);

  const plusBtn = bottomNav.getByRole('button', { name: /Plus d'onglets/ });
  await plusBtn.click();
  const sheet = page.getByRole('dialog', { name: 'Navigation' });
  await expect(sheet).toBeVisible({ timeout: 15_000 });
  await sheet.getByRole('button', { name: 'Biodiversité', exact: true }).click();
  await expect(sheet).toBeHidden({ timeout: 15_000 });

  await bottomNav.getByRole('button', { name: 'Carte', exact: true }).click();
  await expect(page.locator(MAP_STAGE).first()).toBeVisible({ timeout: 60_000 });
});
