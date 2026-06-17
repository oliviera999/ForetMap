const { test, expect } = require('@playwright/test');
const { loginAsNewStudent } = require('./fixtures/auth.fixture');

test('parcours élève : glossaire recherche et fiche', async ({ page }) => {
  await loginAsNewStudent(page);
  await page.getByRole('button', { name: 'Glossaire' }).click();
  await expect(page.getByRole('heading', { name: /Glossaire/i })).toBeVisible({ timeout: 20_000 });

  const search = page.getByPlaceholder('Mot-clé…');
  await search.fill('photo');
  await expect(page.locator('.pedago-term-list .pedago-term-btn').first()).toBeVisible({
    timeout: 15_000,
  });
  await page.locator('.pedago-term-list .pedago-term-btn').first().click();
  await expect(page.locator('.pedago-glossary__detail .pedago-panel-title')).toBeVisible({
    timeout: 15_000,
  });
});
