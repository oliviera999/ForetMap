const { test, expect } = require('@playwright/test');
const { execute } = require('../database');
const { seedGlScenario } = require('./fixtures/gl.fixture');

test.describe('GL profil utilisateur', () => {
  test('ouvre la modale Mon profil depuis la topbar', async ({ page }) => {
    const seeded = await seedGlScenario('profile-modal');

    await page.setExtraHTTPHeaders({ 'X-Foretmap-Product': 'gl' });
    await page.goto('/');
    await page.evaluate((payload) => {
      localStorage.setItem('gl_session', JSON.stringify(payload));
    }, {
      token: seeded.playerToken,
      auth: {
        userType: 'gl_player',
        roleSlug: 'gl_player',
        displayName: seeded.playerPseudo,
        teamId: seeded.teamId,
      },
    });
    await page.reload();

    await page.getByRole('button', { name: 'Mon profil' }).click();
    const dialog = page.getByRole('dialog', { name: 'Mon profil GL' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Mon profil' }).first()).toBeVisible();
  });

  test('affiche la gate de reset mot de passe si passwordMustReset=true', async ({ page }) => {
    const seeded = await seedGlScenario('profile-gate');
    await execute(
      'UPDATE gl_players SET password_must_reset = 1 WHERE id = ?',
      [seeded.playerId]
    );

    await page.setExtraHTTPHeaders({ 'X-Foretmap-Product': 'gl' });
    await page.goto('/');
    await page.evaluate((payload) => {
      localStorage.setItem('gl_session', JSON.stringify(payload));
    }, {
      token: seeded.playerToken,
      auth: {
        userType: 'gl_player',
        roleSlug: 'gl_player',
        displayName: seeded.playerPseudo,
        teamId: seeded.teamId,
      },
    });
    await page.reload();

    const dialog = page.getByRole('dialog', { name: 'Mise a jour mot de passe obligatoire' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: /mot de passe requise/i })).toBeVisible();
  });
});
