const { test, expect } = require('@playwright/test');
const { seedGlScenario } = require('./fixtures/gl.fixture');
const { signAuthToken } = require('../middleware/requireTeacher');

test.describe('GL users admin flow', () => {
  test('MJ gère classes, joueurs, équipes et affectations', async ({ request, page }) => {
    const seeded = await seedGlScenario('users-admin');
    const adminManageToken = await signAuthToken({
      product: 'gl',
      userType: 'gl_admin',
      userId: String(seeded.adminId),
      roleSlug: 'gl_admin',
      permissions: ['gl.read', 'gl.players.manage', 'gl.game.manage', 'gl.team.manage', 'gl.event.emit'],
    });

    await page.setExtraHTTPHeaders({ 'X-Foretmap-Product': 'gl' });
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();

    const classRes = await request.post('/api/gl/admin/classes', {
      headers: { Authorization: `Bearer ${adminManageToken}` },
      data: { name: `Classe UI ${Date.now()}`, school: 'Lyautey' },
    });
    expect(classRes.status()).toBe(201);
    const createdClass = await classRes.json();

    const playerRes = await request.post('/api/gl/admin/players', {
      headers: { Authorization: `Bearer ${adminManageToken}` },
      data: {
        classId: createdClass.id,
        firstName: 'Amina',
        lastName: 'Test',
        pseudo: `ui-player-${Date.now()}`,
        password: '1234',
      },
    });
    expect(playerRes.status()).toBe(201);
    const createdPlayer = await playerRes.json();

    const chaptersRes = await request.get('/api/gl/chapters', {
      headers: { Authorization: `Bearer ${adminManageToken}` },
    });
    expect(chaptersRes.status()).toBe(200);
    const chapters = await chaptersRes.json();
    expect(chapters.length).toBeGreaterThan(0);

    const gameRes = await request.post('/api/gl/games', {
      headers: { Authorization: `Bearer ${adminManageToken}` },
      data: { classId: createdClass.id, chapterId: Number(chapters[0].id), name: 'Partie UI admin' },
    });
    expect(gameRes.status()).toBe(201);
    const game = await gameRes.json();
    const gameId = Number(game?.game?.id || 0);
    expect(gameId).toBeGreaterThan(0);

    const teamRes = await request.post(`/api/gl/games/${gameId}/teams`, {
      headers: { Authorization: `Bearer ${adminManageToken}` },
      data: { name: 'Equipe Admin UI', type: 'gnome', mascotId: 'gl-gnome-mousse', color: '#22c55e' },
    });
    expect(teamRes.status()).toBe(201);
    const team = await teamRes.json();

    const assignRes = await request.post(`/api/gl/games/${gameId}/roster/assign`, {
      headers: { Authorization: `Bearer ${adminManageToken}` },
      data: { playerId: Number(createdPlayer.id), teamId: Number(team.id) },
    });
    expect(assignRes.status()).toBe(200);

    const rosterRes = await request.get(`/api/gl/games/${gameId}/roster`, {
      headers: { Authorization: `Bearer ${adminManageToken}` },
    });
    expect(rosterRes.status()).toBe(200);
    const roster = await rosterRes.json();
    const found = roster.find((item) => Number(item.id) === Number(createdPlayer.id));
    expect(Number(found?.teamId || 0)).toBe(Number(team.id));
  });
});
