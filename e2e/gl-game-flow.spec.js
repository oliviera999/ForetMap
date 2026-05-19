const { test, expect } = require('@playwright/test');

test.describe('Gnomes & Licornes game flow smoke', () => {
  test('la SPA GL est servie avec override produit', async ({ page }) => {
    await page.setExtraHTTPHeaders({ 'X-Foretmap-Product': 'gl' });
    const response = await page.goto('/');
    expect(response && response.status()).toBeLessThan(500);
    await expect(page.locator('body')).toBeVisible();
  });
});
