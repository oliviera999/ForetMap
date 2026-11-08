const { test, expect } = require('@playwright/test');
const { seedGlScenario, mountGlSession } = require('./fixtures/gl.fixture');

/**
 * Modes de démonstration G&L : vitrine parents (`?demo=parents`), borne (`?kiosque=1`) et
 * partie de démonstration depuis la console MJ.
 */
test.describe('Gnomes & Licornes — modes de démonstration', () => {
  test('?demo=parents : session invitée automatique et onglet « Pour les parents »', async ({
    page,
  }) => {
    await page.setExtraHTTPHeaders({ 'X-Foretmap-Product': 'gl' });
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('gl_intro_seen', '1');
      localStorage.removeItem('gl_session');
    });
    await page.goto('/?demo=parents');

    await expect(page.getByText('Mode découverte · parents')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('tab', { name: 'Pour les parents' })).toBeVisible();
    await expect(page.getByTestId('gl-parents-demo')).toBeVisible();
    await expect(page.getByRole('heading', { name: /en cinq minutes/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Découverte' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Console MJ' })).toHaveCount(0);
    // Le quiz d'essai tire une vraie question du plateau.
    await expect(page.getByTestId('gl-parents-quiz').getByRole('radio').first()).toBeVisible({
      timeout: 30_000,
    });
    // Le chemin renvoie au plateau de démonstration.
    await page.getByRole('button', { name: 'Essayer le plateau' }).click();
    await expect(page.getByTestId('gl-guest-demo-dice-fab')).toBeVisible({ timeout: 30_000 });
  });

  test('?kiosque=1 : écran d’accueil, aucune sortie, bandeau de borne', async ({ page }) => {
    await page.setExtraHTTPHeaders({ 'X-Foretmap-Product': 'gl' });
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('gl_intro_seen', '1');
      localStorage.removeItem('gl_session');
    });
    await page.goto('/?kiosque=1&inactivite=60');

    const attract = page.getByTestId('gl-kiosk-attract');
    await expect(attract).toBeVisible({ timeout: 30_000 });
    await expect(attract).toContainText('Touchez l’écran pour commencer');
    await attract.click();
    await expect(attract).toHaveCount(0);

    await expect(page.getByText('Borne de démonstration')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/après 60 s sans geste/)).toBeVisible();
    await expect(page.getByTestId('gl-guest-demo-dice-fab')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Quitter la découverte' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Se connecter' })).toHaveCount(0);
  });

  test('console MJ : préparer la partie de démonstration', async ({ page }) => {
    const seeded = await seedGlScenario('demo-game');
    await mountGlSession(page, {
      token: seeded.adminToken,
      auth: { userType: 'gl_admin', roleSlug: 'gl_admin', displayName: 'MJ e2e' },
      tab: 'mj',
    });
    await page.getByRole('tab', { name: 'Parties', exact: true }).click();
    await page.getByTestId('gl-mj-demo-reset').click();
    await expect(page.getByText(/Partie de démonstration #\d+ prête/)).toBeVisible({
      timeout: 30_000,
    });
    // La partie s'ouvre dans la console, signalée comme démo.
    const banner = page.locator('.gl-active-game-banner');
    await expect(banner.getByRole('heading', { name: /Partie de démonstration/ })).toBeVisible();
    await expect(banner.getByText('Démo', { exact: true })).toBeVisible();
    await expect(banner).toContainText('Classe de démonstration');
  });
});
