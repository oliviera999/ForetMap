const { test, expect } = require('@playwright/test');
const { loginAsNewStudent, dismissDiscoveryTourIfPresent } = require('./fixtures/auth.fixture');
const { MAP_VIEW_MASCOT_MOVE_MS } = require('./fixtures/mascot-motion.fixture');

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

/**
 * Audit UI/UX du 19/11/2026 (U3, U4, U6) : sur téléphone, la porte « Découvrir le lieu » est
 * visible sans défiler, la carte s'affiche en un clic (aucune fenêtre de mascotte), et la
 * fiche d'un lieu s'ouvre en feuille basse non bloquante.
 */
test('webkit : accueil → carte de la Visite en un clic, fiche en feuille basse', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.goto('/');
  const door = page.getByRole('button', { name: /Découvrir le lieu/i });
  await expect(door).toBeVisible({ timeout: 60_000 });
  await expect(door).toBeInViewport();
  await door.click();

  await expect(page.locator('.visit-view--guest-public')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('dialog', { name: /Choix de la mascotte/i })).toHaveCount(0);
  const stage = page.locator('.visit-map-stage');
  await expect(stage.locator('img.visit-map-img')).toBeVisible({ timeout: 30_000 });

  // Une zone, cliquée en son centre (même procédé que `visit-mode.spec.js`) : un repère peut
  // être regroupé dans une pastille ou recouvert par un nom selon les métriques de police du
  // moteur, et le scénario se terminait alors sans rien vérifier (ou cliquait à côté).
  const zone = stage.locator('.fm-pct-zone').first();
  await expect(zone).toBeAttached({ timeout: 30_000 });
  await stage.scrollIntoViewIfNeeded();
  const poly = zone.locator('polygon').first();
  const box = (await poly.count()) ? await poly.boundingBox() : null;
  if (box && box.width > 0 && box.height > 0) {
    await poly.click({ position: { x: box.width / 2, y: box.height / 2 }, force: true });
  } else {
    await zone.click({ force: true });
  }
  // La fiche s'ouvre une fois la mascotte arrivée sur le lieu.
  const sheet = page.getByTestId('visit-detail-panel');
  await expect(sheet).toBeVisible({ timeout: MAP_VIEW_MASCOT_MOVE_MS + 20_000 });
  await expect(sheet).toHaveClass(/fm-bottom-sheet/);
  await expect(sheet).toHaveAttribute('aria-modal', 'false');
  await sheet.getByRole('button', { name: 'Fermer' }).click();
  await expect(sheet).toHaveCount(0);
});
