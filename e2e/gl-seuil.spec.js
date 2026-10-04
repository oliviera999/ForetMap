const { test, expect } = require('@playwright/test');
const { execute } = require('../database');
const { seedGlScenario, mountGlSession } = require('./fixtures/gl.fixture');

// Le Seuil — accueil du joueur : niveau du voyageur, expédition, grimoire (routes/gl/voyageur.js).

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

test.describe('GL — Le Seuil (voyageur)', () => {
  test('niveau, expédition et sortilège Seconde chance lancé hors séance', async ({
    page,
    request,
  }) => {
    const seeded = await seedGlScenario('seuil');
    const enable = await request.put('/api/gl/admin/settings/modules.voyageur_enabled', {
      headers: { Authorization: `Bearer ${seeded.adminToken}` },
      data: { value: true },
    });
    expect(enable.ok()).toBeTruthy();

    // 5 espèces étudiées → niveau 2, Seconde chance ouverte ; une fiche en délai d'attente.
    const stamp = Date.now();
    for (let i = 0; i < 5; i += 1) {
      await execute(
        `INSERT IGNORE INTO gl_learning_acknowledgements
           (reader_user_type, reader_user_id, target_type, target_code)
         VALUES ('gl_player', ?, 'species', ?)`,
        [String(seeded.playerId), `e2e-seuil-${stamp}-${i}`],
      );
    }
    await execute(
      `INSERT INTO gl_resource_gating_cooldowns
         (reader_user_type, reader_user_id, resource_type, resource_ref, locked_until)
       VALUES ('gl_player', ?, 'species', ?, DATE_ADD(NOW(), INTERVAL 2 HOUR))`,
      [String(seeded.playerId), `e2e-lock-${stamp}`],
    );

    await loginGlPlayer(page, seeded);

    await expect(page.getByRole('heading', { name: 'Le Seuil', level: 2 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Moi, voyageur' })).toBeVisible();
    await expect(page.locator('.gl-seuil-ring__level')).toHaveText('Niveau 2');
    await expect(page.locator('.gl-seuil-expedition__team')).toHaveText('Equipe A');
    await expect(page.getByText(/Séance en cours/)).toBeVisible();

    const spell = page.locator('.gl-seuil-spell', { hasText: 'Seconde chance' });
    await spell.getByRole('button', { name: 'Lancer' }).click();
    const cast = page.waitForResponse(
      (res) =>
        res.request().method() === 'POST' &&
        res.url().includes('/api/gl/voyageur/spells/seconde_chance/cast') &&
        res.status() === 200,
    );
    await spell.getByRole('button', { name: new RegExp(`e2e-lock-${stamp}`) }).click();
    await cast;
    await expect(spell.getByRole('status')).toContainText('Seconde chance lancé');
    await expect(spell).toContainText('Se recharge');

    await page.getByRole('button', { name: 'Rejoindre le plateau' }).click();
    await expect(page.locator('.gl-seuil')).toHaveCount(0);
  });
});
