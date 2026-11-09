const { test, expect } = require('@playwright/test');
const { seedGlScenario, mountGlSession } = require('./fixtures/gl.fixture');

// Badges individuels G&L (moteur commun, docs/REWARDS_ENGINE.md § 5) : le prof décerne un badge
// avec un mot, l'élève voit la célébration privée au Seuil (Olu), puis « Mes badges ».
// Aucun classement, aucune ressource. Capture : docs/captures/tenir-v2/badge-celebration.png.

async function loginGlPlayer(page, seeded, { tab = 'seuil' } = {}) {
  await mountGlSession(page, {
    token: seeded.playerToken,
    auth: {
      userType: 'gl_player',
      roleSlug: 'gl_player',
      displayName: seeded.playerPseudo,
      userId: String(seeded.playerId),
      teamId: seeded.teamId,
    },
    tab,
  });
}

test.describe('GL — badges individuels', () => {
  test('badge décerné par le prof : célébration privée au Seuil, vitrine « Mes badges » (capture)', async ({
    browser,
    request,
  }) => {
    const seeded = await seedGlScenario('rewards');
    const headers = { Authorization: `Bearer ${seeded.adminToken}` };
    for (const key of ['modules.rewards_enabled', 'modules.voyageur_enabled']) {
      const enable = await request.put(`/api/gl/admin/settings/${key}`, {
        headers,
        data: { value: true },
      });
      expect(enable.ok()).toBeTruthy();
    }
    const sansMot = await request.post(`/api/gl/rewards/games/${seeded.gameId}/award`, {
      headers,
      data: { playerId: seeded.playerId, type: 'esprit_equipe' },
    });
    expect(sansMot.status()).toBe(400);
    const award = await request.post(`/api/gl/rewards/games/${seeded.gameId}/award`, {
      headers,
      data: {
        playerId: seeded.playerId,
        type: 'esprit_equipe',
        note: 'Tu as porté la caravane quand une page pâlissait.',
      },
    });
    expect(award.ok(), await award.text()).toBeTruthy();

    const context = await browser.newContext({
      viewport: { width: 1024, height: 768 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    await loginGlPlayer(page, seeded);

    const celebration = page.getByTestId('reward-celebration');
    await expect(celebration).toBeVisible({ timeout: 15_000 });
    await expect(celebration).toContainText('Esprit d’équipe');
    // Olu finit sa phrase (machine à écrire) avant la capture.
    await expect(page.getByTestId('reward-celebration-olu')).toContainText(/[.!?…»:]\s*$/, {
      timeout: 15_000,
    });
    await celebration.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'docs/captures/tenir-v2/badge-celebration.png',
      clip: { x: 0, y: 0, width: 1024, height: 768 },
    });

    // Rien ne classe l'élève et aucun mot ne punit.
    const texte = await page.locator('body').innerText();
    expect(texte).not.toMatch(/classement|rang\b|premier de|meilleur élève/i);
    expect(texte).not.toMatch(/\b(faux|raté|perdu)\b/i);

    await celebration.getByRole('button').first().click();
    await expect(celebration).toBeHidden();
    const vitrine = page.getByTestId('gl-rewards');
    await expect(vitrine).toBeVisible();
    await expect(vitrine).toContainText('Esprit d’équipe');

    // Rechargée, la célébration ne rejoue pas (badge vu).
    await page.reload();
    await expect(page.getByTestId('gl-rewards')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('reward-celebration')).toHaveCount(0);
    await context.close();
  });
});
