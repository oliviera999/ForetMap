const { test, expect } = require('@playwright/test');
const { loginAsNewStudent } = require('./fixtures/auth.fixture');

test('parcours élève: inscription puis navigation principale', async ({ page }) => {
  await loginAsNewStudent(page);

  await expect(page.locator('header')).toBeVisible();
  await expect(page.getByRole('button', { name: /Carte/ })).toBeVisible();

  await page.getByRole('button', { name: /^Plantes$/ }).click();
  await expect(page.getByText('Catalogue des plantes')).toBeVisible();

  await page.getByRole('button', { name: /^À propos$/ }).click();
  await expect(page.getByText('Informations du projet ForetMap')).toBeVisible();
});
