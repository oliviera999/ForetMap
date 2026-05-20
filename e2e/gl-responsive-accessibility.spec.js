const { test, expect } = require('@playwright/test');

test.describe('GL responsive & accessibilité', () => {
  test('auth GL reste navigable au clavier en viewport tablette', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.setExtraHTTPHeaders({ 'X-Foretmap-Product': 'gl' });
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();

    const pseudo = page.getByLabel('Pseudo');
    const pin = page.getByLabel('PIN');
    await expect(pseudo).toBeVisible();
    await expect(pin).toBeVisible();

    await pseudo.focus();
    await page.keyboard.type('team-keyboard');
    await page.keyboard.press('Tab');
    await page.keyboard.type('1234');
    await expect(pin).toHaveValue('1234');
  });
});
