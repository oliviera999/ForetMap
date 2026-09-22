const { test, expect } = require('@playwright/test');
const { loginAsNewStudent, enableTeacherMode } = require('./fixtures/auth.fixture');

/**
 * Mascotte visible sur les cartes qui servent à gérer les tâches.
 *
 * Régression : la carte de consultation passe par `SharedMapStage`, qui porte sa propre image ;
 * le viewport historique restait donc sur son `imgSize` initial `{ w: 1, h: 1 }`, et la marge
 * basse de `clampMapMascotPctForViewport` (fraction de la hauteur du plan) envoyait la mascotte
 * à `top: 7800%`, soit ~25 000 px sous la carte — invisible.
 */
async function expectMascotInsideStage(page) {
  const stage = page.locator('.map-view-stage').first();
  await expect(stage).toBeVisible({ timeout: 30_000 });
  const mascot = page.locator('.map-view-forest-mascot .visit-map-mascot-inner').first();
  await expect(mascot).toBeAttached({ timeout: 30_000 });

  // Position en % : jamais hors du plan (le défaut donnait `top: 7800%`).
  const topPct = await page
    .locator('.map-view-forest-mascot')
    .first()
    .evaluate((el) => {
      const m = /^([\d.]+)%$/.exec(String(el.style.top || '').trim());
      return m ? Number(m[1]) : NaN;
    });
  expect(topPct).toBeGreaterThanOrEqual(0);
  expect(topPct).toBeLessThanOrEqual(100);

  // Et réellement peinte dans la scène.
  await expect
    .poll(
      async () => {
        const stageBox = await stage.boundingBox();
        const box = await mascot.boundingBox();
        if (!stageBox || !box || box.width < 2 || box.height < 2) return false;
        // `boundingBox()` ne donne que x/y/width/height : les bords se calculent.
        return (
          box.y + box.height > stageBox.y &&
          box.y < stageBox.y + stageBox.height &&
          box.x + box.width > stageBox.x &&
          box.x < stageBox.x + stageBox.width
        );
      },
      { timeout: 20_000 },
    )
    .toBe(true);
}

test.describe('mascotte carte de travail', () => {
  test('reste visible sur la carte « Carte & Zones »', async ({ page }) => {
    await loginAsNewStudent(page);
    await enableTeacherMode(page);
    await page.getByRole('button', { name: /Carte & Zones/ }).click();
    await expect(page.locator('img[alt^="Plan "]').first()).toBeVisible({ timeout: 30_000 });
    await expectMascotInsideStage(page);
  });

  test('reste visible sur la vue scindée cartes et tâches', async ({ page }) => {
    await loginAsNewStudent(page);
    await enableTeacherMode(page);
    await page.getByRole('button', { name: /Cartes(,| &) tâches/ }).click();
    await expect(page.locator('.desktop-split-pane--map')).toBeVisible({ timeout: 30_000 });
    await expectMascotInsideStage(page);
  });
});
