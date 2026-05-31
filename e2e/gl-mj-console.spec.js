const { test, expect } = require('@playwright/test');
const { queryOne, execute } = require('../database');
const { seedGlScenario } = require('./fixtures/gl.fixture');

async function loginGlAdmin(page, seeded, displayName = 'MJ e2e') {
  await page.setExtraHTTPHeaders({ 'X-Foretmap-Product': 'gl' });
  await page.goto('/');
  await page.evaluate((payload) => {
    localStorage.setItem('gl_session', JSON.stringify(payload));
    localStorage.setItem('gl_active_tab', 'mj');
  }, {
    token: seeded.adminToken,
    auth: {
      userType: 'gl_admin',
      roleSlug: 'gl_admin',
      displayName,
    },
  });
  await page.reload();
}

test.describe('GL MJ console flow', () => {
  test.describe.configure({ retries: 1 });

  test('le MJ voit et résout une action pending', async ({ request }) => {
    const seeded = await seedGlScenario('mj-console');
    await execute(
      `INSERT INTO gl_settings (\`key\`, value_json, updated_at)
       VALUES ('gameplay.player_actions_enabled', 'true', NOW())
       ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = NOW()`
    );

    const created = await request.post(`/api/gl/games/${seeded.gameId}/actions`, {
      headers: { Authorization: `Bearer ${seeded.playerToken}` },
      data: { actionType: 'scan', payload: { markerId: 1 } },
    });
    expect(created.status()).toBe(201);
    const actionId = Number((await created.json()).actionRequestId);

    const stateBefore = await request.get(`/api/gl/games/${seeded.gameId}`, {
      headers: { Authorization: `Bearer ${seeded.adminToken}` },
    });
    const pending = (await stateBefore.json()).pendingActions || [];
    expect(pending.some((a) => Number(a.id) === actionId)).toBeTruthy();

    const resolved = await request.post(`/api/gl/games/${seeded.gameId}/actions/${actionId}/resolve`, {
      headers: { Authorization: `Bearer ${seeded.adminToken}` },
      data: { decision: 'refused', reason: 'E2E MJ console' },
    });
    expect(resolved.status()).toBe(200);
  });

  test('MJ console : éditer une partie et changer de partie met à jour les équipes', async ({ page, request }) => {
    const now = Date.now();
    const seeded = await seedGlScenario('mj-console-ui');
    const gameRow = await queryOne('SELECT class_id, chapter_id FROM gl_games WHERE id = ? LIMIT 1', [seeded.gameId]);
    const secondaryName = `Partie secondaire e2e ${now}`;

    const createRes = await request.post('/api/gl/games', {
      headers: { Authorization: `Bearer ${seeded.adminToken}` },
      data: {
        classId: gameRow.class_id,
        chapterId: gameRow.chapter_id,
        name: secondaryName,
      },
    });
    expect(createRes.status()).toBe(201);
    const secondGameId = Number((await createRes.json()).game.id);

    await request.post(`/api/gl/games/${secondGameId}/teams`, {
      headers: { Authorization: `Bearer ${seeded.adminToken}` },
      data: { name: `Equipe Beta e2e ${now}`, type: 'unicorn', color: '#a855f7' },
    }).then((r) => expect(r.status()).toBe(201));

    await loginGlAdmin(page, seeded, 'MJ console-ui');

    const gameMeta = await queryOne('SELECT name FROM gl_games WHERE id = ? LIMIT 1', [seeded.gameId]);
    const primaryGameName = String(gameMeta?.name || '');

    await expect(page.getByRole('heading', { name: 'Console MJ' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Parties' })).toBeVisible();

    const firstGameRow = page.locator('tr', { hasText: primaryGameName }).first();
    await firstGameRow.getByRole('button', { name: 'Ouvrir' }).click();
    await expect(page.locator('.gl-active-game-banner-title')).toContainText(primaryGameName);

    const nameInput = page.locator('.gl-active-game-banner input').first();
    await nameInput.fill('Partie MJ renommée e2e');
    await page.getByRole('button', { name: 'Enregistrer la partie' }).click();
    await expect(page.locator('.gl-active-game-banner-title')).toHaveText('Partie MJ renommée e2e', { timeout: 10000 });

    const secondGameRow = page.locator('tr', { hasText: secondaryName }).first();
    await expect(secondGameRow.getByRole('button', { name: 'Ouvrir' })).toBeEnabled({ timeout: 10000 });
    await secondGameRow.getByRole('button', { name: 'Ouvrir' }).click();
    await expect(page.locator('.gl-active-game-banner-title')).toHaveText(secondaryName, { timeout: 10000 });

    await page.getByRole('button', { name: 'Équipes & effectifs' }).click();
    const betaTeamName = `Equipe Beta e2e ${now}`;
    const teamsPanel = page.locator('.gl-mj-console');
    await expect(teamsPanel.getByRole('cell', { name: betaTeamName })).toBeVisible();
    await expect(teamsPanel.getByRole('cell', { name: 'Equipe A' })).toHaveCount(0);
  });
});
