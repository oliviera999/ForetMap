const { test, expect } = require('@playwright/test');
const { loginAsNewStudent, openStudentTab } = require('./fixtures/auth.fixture');

test('parcours élève: inscription puis navigation principale', async ({ page }) => {
  await loginAsNewStudent(page);

  await expect(page.locator('header')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Carte', exact: true })).toBeVisible();

  await openStudentTab(page, 'Biodiversité');
  await expect(page.getByText('Catalogue de biodiversité')).toBeVisible();
  await page.locator('summary:has-text("Filtres avancés")').click();
  await expect(page.getByRole('button', { name: 'Réinitialiser les filtres' })).toBeVisible();

  await openStudentTab(page, 'Tuto');
  await expect(page.getByText('Guides pratiques consultables et téléchargeables')).toBeVisible();

  await openStudentTab(page, 'À propos');
  await expect(page.getByText('Informations du projet ForetMap')).toBeVisible();
});
