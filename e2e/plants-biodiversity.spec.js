const { test, expect } = require('@playwright/test');
const { loginAsNewStudent, enableTeacherMode } = require('./fixtures/auth.fixture');

test('parcours prof: onglet Biodiversité accessible', async ({ page }) => {
  await loginAsNewStudent(page);
  await enableTeacherMode(page);

  await page.getByRole('button', { name: /Biodiversité/ }).click();
  await expect(
    page.getByRole('heading', { name: /Biodiversité|Plantes|Catalogue/i }).first(),
  ).toBeVisible({ timeout: 15_000 });
});
