const { test, expect } = require('@playwright/test');
const { loginAsNewStudent, enableTeacherMode, openFirstZoneModalFromMap } = require('./fixtures/auth.fixture');

test('parcours prof: activation mode prof, carte et modale zone', async ({ page }) => {
  await loginAsNewStudent(page);
  await enableTeacherMode(page);

  await page.getByRole('button', { name: /Carte & Zones/ }).click();
  await expect(page.locator('img[alt^="Plan "]').first()).toBeVisible();

  const zoneCount = await page.locator('.map-zone-hit').count();
  if (zoneCount > 0) {
    await openFirstZoneModalFromMap(page);
    await page.getByRole('button', { name: '📷 Photos', exact: true }).click();
    await expect(page.getByPlaceholder('Légende (optionnel)')).toBeVisible();
    await page.locator('.modal-close').first().click();
  }
});
