const { test, expect } = require('@playwright/test');
const { execute } = require('../database');
const { seedGlScenario } = require('./fixtures/gl.fixture');

test.describe('GL MJ console flow', () => {
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
});
