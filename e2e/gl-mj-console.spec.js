const { test, expect } = require('@playwright/test');
const { queryOne } = require('../database');
const { seedGlScenario, mountGlSession } = require('./fixtures/gl.fixture');

async function loginGlAdmin(page, seeded, displayName = 'MJ e2e') {
  await mountGlSession(page, {
    token: seeded.adminToken,
    auth: {
      userType: 'gl_admin',
      roleSlug: 'gl_admin',
      displayName,
    },
    tab: 'mj',
  });
}

test.describe('GL MJ console flow', () => {
  test.describe.configure({ retries: 1 });

  test('le MJ voit et résout une action pending', async ({ request }) => {
    const seeded = await seedGlScenario('mj-console');
    const enableActions = await request.put(
      '/api/gl/admin/settings/gameplay.player_actions_enabled',
      {
        headers: { Authorization: `Bearer ${seeded.adminToken}` },
        data: { value: true },
      },
    );
    expect(enableActions.ok()).toBeTruthy();

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

    const resolved = await request.post(
      `/api/gl/games/${seeded.gameId}/actions/${actionId}/resolve`,
      {
        headers: { Authorization: `Bearer ${seeded.adminToken}` },
        data: { decision: 'refused', reason: 'E2E MJ console' },
      },
    );
    expect(resolved.status()).toBe(200);
  });

  test('MJ console : éditer une partie et changer de partie met à jour les équipes', async ({
    page,
    request,
  }) => {
    const now = Date.now();
    const seeded = await seedGlScenario('mj-console-ui');
    const gameRow = await queryOne(
      'SELECT class_id, chapter_id FROM gl_games WHERE id = ? LIMIT 1',
      [seeded.gameId],
    );
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

    await request
      .post(`/api/gl/games/${secondGameId}/teams`, {
        headers: { Authorization: `Bearer ${seeded.adminToken}` },
        data: { name: `Equipe Beta e2e ${now}`, type: 'unicorn', color: '#a855f7' },
      })
      .then((r) => expect(r.status()).toBe(201));

    await loginGlAdmin(page, seeded, 'MJ console-ui');
    await page.waitForLoadState('domcontentloaded');

    const gameMeta = await queryOne('SELECT name FROM gl_games WHERE id = ? LIMIT 1', [
      seeded.gameId,
    ]);
    const primaryGameName = String(gameMeta?.name || '');

    await expect(page.getByRole('heading', { name: 'Console MJ' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('tab', { name: 'Parties' })).toBeVisible();
    await page
      .waitForResponse(
        (r) => r.url().includes('/api/gl/games') && r.request().method() === 'GET' && r.ok(),
        { timeout: 20_000 },
      )
      .catch(() => {});

    const firstGameRow = page.locator('tr', { hasText: primaryGameName }).first();
    await expect(firstGameRow.getByRole('button', { name: 'Ouvrir' })).toBeEnabled({
      timeout: 15_000,
    });
    await firstGameRow.getByRole('button', { name: 'Ouvrir' }).click();
    await expect(page.locator('.gl-active-game-banner-title')).toContainText(primaryGameName);

    const banner = page.locator('.gl-active-game-banner');
    const nameInput = banner.locator('input').first();
    const saveDone = page.waitForResponse(
      (r) =>
        r.url().includes(`/api/gl/games/${seeded.gameId}`) &&
        r.request().method() === 'PUT' &&
        r.ok(),
      { timeout: 20_000 },
    );
    await nameInput.fill('Partie MJ renommée e2e');
    await saveDone;
    await expect(banner.locator('.auto-save-status--saved')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.gl-active-game-banner-title')).toHaveText(
      'Partie MJ renommée e2e',
      { timeout: 10_000 },
    );

    const secondGameRow = page.locator('tr', { hasText: secondaryName }).first();
    await expect(secondGameRow.getByRole('button', { name: 'Ouvrir' })).toBeEnabled({
      timeout: 10000,
    });
    await secondGameRow.getByRole('button', { name: 'Ouvrir' }).click();
    await expect(page.locator('.gl-active-game-banner-title')).toHaveText(secondaryName, {
      timeout: 10000,
    });

    await page.getByRole('tab', { name: 'Équipes & effectifs' }).click();
    const betaTeamName = `Equipe Beta e2e ${now}`;
    const teamsPanel = page.locator('.gl-mj-console');
    await expect(teamsPanel.getByRole('cell', { name: betaTeamName })).toBeVisible();
    await expect(teamsPanel.getByRole('cell', { name: 'Equipe A' })).toHaveCount(0);
  });

  test('journal : narration visible avec presentation FR via API', async ({ request }) => {
    const seeded = await seedGlScenario('journal-api');
    const enableNarr = await request.put('/api/gl/admin/settings/gameplay.narration_enabled', {
      headers: { Authorization: `Bearer ${seeded.adminToken}` },
      data: { value: true },
    });
    expect(enableNarr.ok()).toBeTruthy();
    const text = `E2E journal ${Date.now()}`;
    const posted = await request.post(`/api/gl/games/${seeded.gameId}/events`, {
      headers: { Authorization: `Bearer ${seeded.adminToken}` },
      data: { eventType: 'narration', payload: { text } },
    });
    expect(posted.status()).toBe(201);

    const journal = await request.get(`/api/gl/journal/games/${seeded.gameId}?limit=10`, {
      headers: { Authorization: `Bearer ${seeded.playerToken}` },
    });
    expect(journal.status()).toBe(200);
    const body = await journal.json();
    const hit = (body.events || []).find((e) => e.presentation?.body === text);
    expect(hit).toBeTruthy();
    expect(hit.presentation.title).toMatch(/maître du jeu/i);
  });
});
