const { test, expect } = require('@playwright/test');

test.describe('GL responsive & accessibilité', () => {
  test('auth GL reste navigable au clavier en viewport tablette', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.setExtraHTTPHeaders({ 'X-Foretmap-Product': 'gl' });
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();

    const identifier = page.getByLabel(/Identifiant/);
    const password = page.getByLabel('Mot de passe');
    await expect(identifier).toBeVisible();
    await expect(password).toBeVisible();

    await identifier.focus();
    await page.keyboard.type('team-keyboard');
    await page.keyboard.press('Tab');
    await page.keyboard.type('1234');
    await expect(password).toHaveValue('1234');
  });
});
