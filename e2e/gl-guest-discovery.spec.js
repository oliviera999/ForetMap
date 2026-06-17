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

  test('parcours invité — dé, feuillets et mur de fin', async ({ page }) => {
    await page.setExtraHTTPHeaders({ 'X-Foretmap-Product': 'gl' });
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('gl_intro_seen', '1'));
    await page.reload();
    await page.getByRole('button', { name: 'Découvrir sans compte' }).click();
    await expect(page.getByRole('tab', { name: 'Découverte' })).toBeVisible({ timeout: 30_000 });

    await page.getByTestId('gl-guest-demo-dice-fab').click();
    await expect(page.getByTestId('gl-virtual-dice-popover')).toBeVisible();

    const wallTitle = page.locator('#gl-guest-demo-wall-title');
    for (let attempt = 0; attempt < 24 && !(await wallTitle.isVisible()); attempt += 1) {
      const rollBtn = page.getByTestId('gl-dice-roll');
      const rerollBtn = page.getByTestId('gl-dice-reroll');
      if (await rerollBtn.isVisible()) {
        await rerollBtn.click();
      } else if (await rollBtn.isVisible()) {
        await rollBtn.click();
      }
      await expect(page.getByTestId('gl-dice-result')).toBeVisible({ timeout: 5000 });

      const feuilletClose = page.getByRole('button', { name: 'Fermer' }).first();
      if (await feuilletClose.isVisible({ timeout: 8000 }).catch(() => false)) {
        await feuilletClose.click();
      }

      const discoveryClose = page.getByRole('button', { name: 'Fermer' }).first();
      if (await discoveryClose.isVisible({ timeout: 5000 }).catch(() => false)) {
        await discoveryClose.click();
      }

      if (await wallTitle.isVisible()) break;
      await page.waitForTimeout(400);
    }

    await expect(wallTitle).toHaveText(/journal s.interrompt ici/i, { timeout: 30_000 });
  });
});
