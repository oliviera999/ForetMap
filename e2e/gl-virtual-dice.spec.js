const { test, expect } = require('@playwright/test');
const { seedGlScenario } = require('./fixtures/gl.fixture');

test.describe('GL dés virtuels', () => {
  test('UI — lanceur visible et jet affiche un total', async ({ request, page }) => {
    const seeded = await seedGlScenario('virtual-dice-ui');

    const enableDice = await request.put('/api/gl/admin/settings/modules.virtual_dice_enabled', {
      headers: { Authorization: `Bearer ${seeded.adminToken}` },
      data: { value: true },
    });
    expect(enableDice.ok()).toBeTruthy();

    await page.setExtraHTTPHeaders({ 'X-Foretmap-Product': 'gl' });
    await page.goto('/');
    await page.evaluate((payload) => {
      localStorage.setItem('gl_session', JSON.stringify(payload));
      localStorage.setItem('gl_active_tab', 'maps');
    }, {
      token: seeded.playerToken,
      auth: {
        userType: 'gl_player',
        roleSlug: 'gl_player',
        displayName: seeded.playerPseudo,
        teamId: seeded.teamId,
        gameId: seeded.gameId,
      },
    });
    await page.reload();

    const fab = page.getByTestId('gl-virtual-dice-fab');
    await expect(fab).toBeVisible();
    await fab.click();

    const popover = page.getByTestId('gl-virtual-dice-popover');
    await expect(popover).toBeVisible();

    await page.getByTestId('gl-dice-add').click();
    await page.getByTestId('gl-dice-roll').click();

    const result = page.getByTestId('gl-dice-result');
    await expect(result).toBeVisible({ timeout: 3000 });
    await expect(result.locator('strong')).toHaveText(/^\d+$/);
  });
});
