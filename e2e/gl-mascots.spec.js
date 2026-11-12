const { test, expect } = require('@playwright/test');
const { signAuthToken } = require('../middleware/requireTeacher');
const { queryOne, execute } = require('../database');
const { createGlMascotPackPool } = require('../tests/helpers/glFixtures');

test.describe('Gnomes & Licornes — mascottes & équipes (Lot 2C)', () => {
  test('le MJ assigne deux packs publiés à deux équipes (refus de collision, gl-* refusé)', async ({
    request,
  }) => {
    const now = Date.now();
    // Catalogue G&L = packs publiés du studio ForêtMap : le scénario sème les siens.
    const pool = await createGlMascotPackPool({ gnomes: 2, unicorns: 1, tag: now });
    const [gnomeA, gnomeB] = pool.gnomeIds;
    const [licorneA] = pool.unicornIds;
    const adminEmail = `e2e-mascots-mj-${now}@example.org`;
    await execute(
      'INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(), NOW())',
      [adminEmail, `MJ Mascots ${now}`, 'admin'],
    );
    const adminRow = await queryOne('SELECT id FROM gl_admins WHERE email = ? LIMIT 1', [
      adminEmail,
    ]);
    const adminId = Number(adminRow?.id || 0);
    expect(adminId).toBeGreaterThan(0);

    await execute(
      'INSERT INTO gl_classes (name, school, created_by, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(), NOW())',
      [`6e Mascots ${now}`, 'Lyautey', adminId],
    );
    const classRow = await queryOne('SELECT id FROM gl_classes ORDER BY id DESC LIMIT 1');
    const classId = Number(classRow?.id || 0);

    const chapter = await queryOne(
      "SELECT id FROM gl_chapters WHERE slug = 'foret-magique' LIMIT 1",
    );
    await execute(
      `INSERT INTO gl_games (class_id, chapter_id, name, status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, 'live', ?, NOW(), NOW())`,
      [classId, Number(chapter.id), `Partie Mascots ${now}`, adminId],
    );
    const gameRow = await queryOne('SELECT id FROM gl_games WHERE name = ? LIMIT 1', [
      `Partie Mascots ${now}`,
    ]);
    const gameId = Number(gameRow.id);

    await execute(
      `INSERT INTO gl_teams (game_id, name, type, color, created_at, updated_at)
       VALUES (?, 'Equipe Mousse', 'gnome', '#16a34a', NOW(), NOW())`,
      [gameId],
    );
    const teamA = await queryOne('SELECT id FROM gl_teams WHERE game_id = ? AND name = ? LIMIT 1', [
      gameId,
      'Equipe Mousse',
    ]);
    await execute(
      `INSERT INTO gl_teams (game_id, name, type, color, created_at, updated_at)
       VALUES (?, 'Equipe Aube', 'unicorn', '#fb7185', NOW(), NOW())`,
      [gameId],
    );
    const teamB = await queryOne('SELECT id FROM gl_teams WHERE game_id = ? AND name = ? LIMIT 1', [
      gameId,
      'Equipe Aube',
    ]);

    const adminToken = await signAuthToken({
      product: 'gl',
      userType: 'gl_admin',
      userId: String(adminId),
      roleSlug: 'gl_admin',
      permissions: ['gl.read', 'gl.team.manage', 'gl.game.manage'],
      displayName: 'MJ Mascots',
    });
    const headers = { Authorization: `Bearer ${adminToken}` };

    const r1 = await request.post('/api/gl/mascots/assign', {
      headers,
      data: { gameId, teamId: Number(teamA.id), mascotId: gnomeA },
    });
    expect(r1.status()).toBe(200);

    const r2 = await request.post('/api/gl/mascots/assign', {
      headers,
      data: { gameId, teamId: Number(teamB.id), mascotId: gnomeA },
    });
    expect(r2.status()).toBe(409);

    const r3 = await request.post('/api/gl/mascots/assign', {
      headers,
      data: { gameId, teamId: Number(teamB.id), mascotId: licorneA },
    });
    expect(r3.status()).toBe(200);

    const list = await request.get(`/api/gl/mascots?gameId=${gameId}`, { headers });
    expect(list.status()).toBe(200);
    const data = await list.json();
    const mascots = data?.mascots || [];
    expect(mascots.find((m) => m.id === gnomeA)?.type).toBe('gnome');
    expect(mascots.find((m) => m.id === licorneA)?.type).toBe('unicorn');
    expect(mascots.some((m) => String(m.id).startsWith('gl-'))).toBeFalsy();
    const map = Object.fromEntries(
      (data?.assignments || []).map((a) => [Number(a.team_id), a.mascot_id]),
    );
    expect(map[Number(teamA.id)]).toBe(gnomeA);
    expect(map[Number(teamB.id)]).toBe(licorneA);

    const r4 = await request.post('/api/gl/mascots/assign', {
      headers,
      data: { gameId, teamId: Number(teamA.id), mascotId: gnomeB },
    });
    expect(r4.status()).toBe(200);

    // Ancienne mascotte SVG : plus au catalogue.
    const r5 = await request.post('/api/gl/mascots/assign', {
      headers,
      data: { gameId, teamId: Number(teamA.id), mascotId: 'gl-gnome-mousse' },
    });
    expect(r5.status()).toBe(404);

    await pool.cleanup();
  });
});
