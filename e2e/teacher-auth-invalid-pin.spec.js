const { test, expect } = require('@playwright/test');
const { loginAsNewStudent } = require('./fixtures/auth.fixture');

test('mode prof: code PIN invalide affiche une erreur', async ({ page }) => {
  await loginAsNewStudent(page);

  await page.getByRole('button', { name: 'Activer les droits étendus' }).click();
  await page.locator('.pin-card .pin-input').fill('9999');
  await page.locator('.pin-card').getByRole('button', { name: 'Entrer', exact: true }).click();

  await expect(page.getByText(/PIN incorrect|Code incorrect/)).toBeVisible();
});
