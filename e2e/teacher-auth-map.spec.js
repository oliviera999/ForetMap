const { test, expect } = require('@playwright/test');
const { loginAsNewStudent, enableTeacherMode } = require('./fixtures/auth.fixture');

test('parcours prof: activation mode prof, carte et modale zone', async ({ page }) => {
  await loginAsNewStudent(page);
  await enableTeacherMode(page);

  await page.getByRole('button', { name: /Carte & Zones/ }).click();
  await expect(page.getByAltText('Plan du jardin')).toBeVisible();

  const zoneCount = await page.locator('.map-zone-hit').count();
  if (zoneCount > 0) {
    await page.locator('.map-zone-hit').first().click();
    await expect(page.getByText('📷 Photos')).toBeVisible();
    await page.locator('.modal-close').first().click();
  }
});
