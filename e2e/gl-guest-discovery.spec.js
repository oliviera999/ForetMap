const { test, expect } = require('@playwright/test');

test.describe('Gnomes & Licornes — Mode Découverte', () => {
  test('API invité et config guestModeEnabled', async ({ request }) => {
    const config = await request.get('/api/gl/auth/config');
    expect(config.ok()).toBeTruthy();
    const configBody = await config.json();
    expect(configBody?.guestModeEnabled).not.toBe(false);

    const guest = await request.post('/api/gl/auth/guest');
    expect(guest.ok()).toBeTruthy();
    const guestBody = await guest.json();
    expect(guestBody?.auth?.userType).toBe('gl_guest');
    expect(guestBody?.authToken).toBeTruthy();
  });

  test('parcours invité — onglets réduits et plateau découverte', async ({ page }) => {
    await page.setExtraHTTPHeaders({ 'X-Foretmap-Product': 'gl' });
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('gl_intro_seen', '1'));
    await page.reload();
    await page.getByRole('button', { name: 'Découvrir sans compte' }).click();

    await expect(page.getByRole('status').filter({ hasText: 'Mode découverte' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('tab', { name: 'Découverte' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Le monde de G&L' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Glossaire' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Forum' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Console MJ' })).toHaveCount(0);

    await expect(page.getByRole('heading', { name: 'Découverte' })).toBeVisible();
    await expect(page.getByTestId('gl-guest-demo-dice-fab')).toBeVisible();
  });
});
