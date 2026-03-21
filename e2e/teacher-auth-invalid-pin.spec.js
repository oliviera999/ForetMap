const { test, expect } = require('@playwright/test');
const { loginAsNewStudent } = require('./fixtures/auth.fixture');

test('mode prof: code PIN invalide affiche une erreur', async ({ page }) => {
  await loginAsNewStudent(page);

  await page.locator('button.lock-btn').first().click();
  await page.locator('.pin-input').fill('9999');
  await page.getByRole('button', { name: 'Entrer' }).click();

  await expect(page.getByText('Code incorrect')).toBeVisible();
});
