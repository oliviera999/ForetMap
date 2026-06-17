const { test, expect } = require('@playwright/test');
const { loginAsNewStudent } = require('./fixtures/auth.fixture');

test('parcours élève : quiz tirage et feedback', async ({ page }) => {
  await loginAsNewStudent(page);
  await page.getByRole('button', { name: 'Quiz' }).click();
  await expect(page.getByRole('heading', { name: /Quiz/i })).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: /Tirer une question/i }).click();
  await expect(page.locator('.pedago-quiz__question')).toBeVisible({ timeout: 20_000 });

  const choice = page.locator('.pedago-quiz__choice input[type="radio"]').first();
  await choice.check();
  await page.getByRole('button', { name: /Valider ma réponse/i }).click();
  await expect(page.locator('.pedago-quiz__card')).toContainText(/bonne|incorrect|Bravo|Dommage/i, {
    timeout: 15_000,
  });
});
