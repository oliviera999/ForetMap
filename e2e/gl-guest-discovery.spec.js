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
    await expect(page.getByRole('tab', { name: 'Le monde G&L' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'La nature' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Glossaire' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Forum' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Console MJ' })).toHaveCount(0);

    await expect(page.getByRole('heading', { name: 'Découverte' })).toBeVisible();
    await expect(page.getByTestId('gl-guest-demo-dice-fab')).toBeVisible();
  });

  test('parcours invité — dé, feuillets et mur de fin', async ({ page }) => {
    test.setTimeout(180_000);
    await page.setExtraHTTPHeaders({ 'X-Foretmap-Product': 'gl' });
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('gl_intro_seen', '1'));
    await page.reload();
    await page.getByRole('button', { name: 'Découvrir sans compte' }).click();
    await expect(page.getByRole('tab', { name: 'Découverte' })).toBeVisible({ timeout: 30_000 });

    const wallTitle = page.locator('#gl-guest-demo-wall-title');
    await page
      .waitForResponse((r) => r.url().includes('/api/gl/lore/demo-feuillets') && r.ok(), {
        timeout: 30_000,
      })
      .catch(() => {});

    async function closeFeuilletOverlays() {
      if (await wallTitle.isVisible().catch(() => false)) return;

      const zonePopover = page.locator('.gl-feuillet-popover');
      if (await zonePopover.isVisible({ timeout: 500 }).catch(() => false)) {
        await zonePopover.locator('.gl-feui-discovery__foot button').first().click({ force: true });
        await zonePopover.waitFor({ state: 'hidden', timeout: 6000 }).catch(() => {});
        await page.waitForTimeout(350);
      }

      for (let pass = 0; pass < 4; pass += 1) {
        const feuilletDialog = page
          .getByRole('dialog')
          .filter({ hasText: /Feuillet|Carnet de voyage/i });
        if (
          !(await feuilletDialog
            .first()
            .isVisible({ timeout: 400 })
            .catch(() => false))
        )
          break;
        await feuilletDialog
          .first()
          .getByRole('button', { name: 'Fermer' })
          .last()
          .click({ force: true });
        await feuilletDialog
          .first()
          .waitFor({ state: 'hidden', timeout: 6000 })
          .catch(() => {});
        await page.waitForTimeout(250);
      }

      const overlay = page.locator('.gl-feui-discovery-overlay');
      if (await overlay.isVisible({ timeout: 400 }).catch(() => false)) {
        await page.keyboard.press('Escape').catch(() => {});
        await overlay.waitFor({ state: 'hidden', timeout: 4000 }).catch(() => {});
      }
    }

    async function ensureDicePopoverOpen() {
      await closeFeuilletOverlays();
      const popover = page.getByTestId('gl-virtual-dice-popover');
      if (await popover.isVisible().catch(() => false)) return;
      await page.getByTestId('gl-guest-demo-dice-fab').click({ force: true });
      await expect(popover).toBeVisible({ timeout: 8000 });
    }

    await closeFeuilletOverlays();

    for (let attempt = 0; attempt < 50 && !(await wallTitle.isVisible()); attempt += 1) {
      await ensureDicePopoverOpen();
      const popover = page.getByTestId('gl-virtual-dice-popover');
      const rerollBtn = popover.getByTestId('gl-dice-reroll');
      const rollBtn = popover.getByTestId('gl-dice-roll');
      if (await rerollBtn.isVisible().catch(() => false)) {
        await rerollBtn.click({ force: true });
      } else {
        await rollBtn.click({ force: true });
      }

      await page.waitForTimeout(1_200);
      await closeFeuilletOverlays();
      if (await wallTitle.isVisible()) break;
    }

    await expect(wallTitle).toHaveText(/journal s.interrompt ici/i, { timeout: 30_000 });
  });
});
