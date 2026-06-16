const { test, expect } = require('@playwright/test');
const { seedGlScenario } = require('./fixtures/gl.fixture');

test.describe('GL player full cycle', () => {
  test('joueur -> action -> résolution MJ -> score', async ({ request, page }) => {
    const seeded = await seedGlScenario('full-cycle');

    await request.put('/api/gl/admin/settings/gameplay.player_actions_enabled', {
      headers: { Authorization: `Bearer ${seeded.adminToken}` },
      data: { value: true },
    });
    await request.put('/api/gl/admin/settings/gameplay.scoring_enabled', {
      headers: { Authorization: `Bearer ${seeded.adminToken}` },
      data: { value: true },
    });

    await page.setExtraHTTPHeaders({ 'X-Foretmap-Product': 'gl' });
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();

    const createAction = await request.post(`/api/gl/games/${seeded.gameId}/actions`, {
      headers: { Authorization: `Bearer ${seeded.playerToken}` },
      data: { actionType: 'explore', payload: { markerId: 1 } },
    });
    expect(createAction.status()).toBe(201);
    const body = await createAction.json();
    expect(Number(body.actionRequestId)).toBeGreaterThan(0);

    const resolveAction = await request.post(
      `/api/gl/games/${seeded.gameId}/actions/${body.actionRequestId}/resolve`,
      {
        headers: { Authorization: `Bearer ${seeded.adminToken}` },
        data: { decision: 'accepted', scoreDelta: 2, reason: 'E2E full cycle' },
      },
    );
    expect(resolveAction.status()).toBe(200);

    const state = await request.get(`/api/gl/games/${seeded.gameId}`, {
      headers: { Authorization: `Bearer ${seeded.adminToken}` },
    });
    expect(state.status()).toBe(200);
    const stateBody = await state.json();
    const scoreEntry =
      stateBody.scores?.[String(seeded.teamId)] || stateBody.scores?.[seeded.teamId];
    expect(Number(scoreEntry?.score || 0)).toBe(2);
  });
});
