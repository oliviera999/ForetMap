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

/** Lot 2 — moteur de carte partagé : double-tap tactile et recentrage sur la carte élève. */
test('mobile : double-tap zoome la carte, le bouton recentrer la réajuste', async ({ page }) => {
  test.setTimeout(240_000);
  await loginAsNewStudent(page);
  await dismissDiscoveryTourIfPresent(page);
  const bottomNav = page.locator('nav.bottom-nav');
  await expect(bottomNav).toBeVisible({ timeout: 60_000 });
  const mapBtn = bottomNav.getByRole('button', { name: 'Carte', exact: true });
  if ((await mapBtn.count()) > 0) await mapBtn.click();
  const canvas = page.locator('.map-view-canvas').first();
  await expect(canvas).toBeVisible({ timeout: 60_000 });
  const world = canvas.locator(':scope > div').first();
  const readScale = async () => {
    const t = await world.evaluate((el) => el.style.transform || '');
    const m = /scale\(([\d.]+)\)/.exec(t);
    return m ? Number(m[1]) : 0;
  };
  await expect.poll(readScale, { timeout: 15_000 }).toBeGreaterThan(0);
  const fitScale = await readScale();

  // Point de fond de carte (coin haut-gauche du cadre : hors bulles de repère, qui ne
  // déclenchent pas les gestes), deux appuis rapprochés.
  const box = await canvas.boundingBox();
  const x = box.x + box.width * 0.12;
  const y = box.y + box.height * 0.12;
  await page.touchscreen.tap(x, y);
  await page.waitForTimeout(60);
  await page.touchscreen.tap(x, y);
  await expect.poll(readScale, { timeout: 5_000 }).toBeGreaterThan(fitScale * 1.8);

  await page.getByRole('button', { name: 'Recentrer la carte', exact: true }).click();
  await expect.poll(readScale, { timeout: 5_000 }).toBeCloseTo(fitScale, 2);
});
