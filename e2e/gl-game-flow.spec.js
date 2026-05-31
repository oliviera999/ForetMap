const { test, expect } = require('@playwright/test');
const { io: clientIo } = require('socket.io-client');
const { signAuthToken } = require('../middleware/requireTeacher');
const { queryOne, execute } = require('../database');
const { seedGlScenario } = require('./fixtures/gl.fixture');

test.describe('Gnomes & Licornes game flow smoke', () => {
  test('la SPA GL est servie avec override produit', async ({ page }) => {
    await page.setExtraHTTPHeaders({ 'X-Foretmap-Product': 'gl' });
    const response = await page.goto('/');
    expect(response && response.status()).toBeLessThan(500);
    await expect(page.locator('body')).toBeVisible();
  });

  test('joueur reçoit un event move émis par le MJ (Socket.IO)', async ({ request }) => {
    const now = Date.now();
    const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';
    const chapter = await queryOne('SELECT id FROM gl_chapters ORDER BY order_index ASC, id ASC LIMIT 1');
    expect(Number(chapter?.id || 0)).toBeGreaterThan(0);

    await execute(
      'INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(), NOW())',
      [`e2e-mj-${now}@example.org`, `E2E MJ ${now}`, 'admin']
    );
    const adminRow = await queryOne('SELECT id FROM gl_admins ORDER BY id DESC LIMIT 1');
    const adminId = Number(adminRow?.id || 0);
    expect(adminId).toBeGreaterThan(0);

    await execute(
      'INSERT INTO gl_classes (name, school, created_by, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(), NOW())',
      [`6e E2E ${now}`, 'Lyautey', adminId]
    );
    const classRow = await queryOne('SELECT id FROM gl_classes ORDER BY id DESC LIMIT 1');
    const classId = Number(classRow?.id || 0);
    expect(classId).toBeGreaterThan(0);

    await execute(
      `INSERT INTO gl_players (class_id, team_id, pseudo, pin_hash, linked_foretmap_user_id, is_active, created_at, updated_at)
       VALUES (?, NULL, ?, ?, NULL, 1, NOW(), NOW())`,
      [classId, `e2e_joueur_${now}`, 'not-used-in-this-spec']
    );
    const playerRow = await queryOne('SELECT id FROM gl_players ORDER BY id DESC LIMIT 1');
    const playerId = Number(playerRow?.id || 0);
    expect(playerId).toBeGreaterThan(0);

    await execute(
      `INSERT INTO gl_games (class_id, chapter_id, name, status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, 'draft', ?, NOW(), NOW())`,
      [classId, Number(chapter.id), `Partie E2E ${now}`, adminId]
    );
    const gameRow = await queryOne('SELECT id FROM gl_games ORDER BY id DESC LIMIT 1');
    const gameId = Number(gameRow?.id || 0);
    expect(gameId).toBeGreaterThan(0);

    await execute(
      `INSERT INTO gl_teams (game_id, name, type, mascot_id, position_marker_id, color, created_at, updated_at)
       VALUES (?, ?, 'gnome', ?, NULL, ?, NOW(), NOW())`,
      [gameId, `Equipe E2E ${now}`, 'renard2-cut-spritesheet', '#22c55e']
    );
    const teamRow = await queryOne('SELECT id FROM gl_teams ORDER BY id DESC LIMIT 1');
    const teamId = Number(teamRow?.id || 0);
    expect(teamId).toBeGreaterThan(0);

    const adminToken = await signAuthToken({
      product: 'gl',
      userType: 'gl_admin',
      userId: String(adminId),
      roleSlug: 'gl_admin',
      permissions: ['gl.read', 'gl.players.manage', 'gl.game.manage', 'gl.team.manage', 'gl.event.emit'],
    });
    const adminHeaders = { Authorization: `Bearer ${adminToken}` };

    const playerToken = await signAuthToken({
      product: 'gl',
      userType: 'gl_player',
      userId: String(playerId),
      roleSlug: 'gl_player',
      permissions: ['gl.read'],
      classId,
      teamId: null,
    });
    const playerHeaders = { Authorization: `Bearer ${playerToken}` };

    const joinRes = await request.post(`/api/gl/games/${gameId}/join-team`, {
      headers: playerHeaders,
      data: { teamId },
    });
    expect(joinRes.status()).toBe(200);

    const socket = clientIo(baseURL, {
      path: '/socket.io',
      transports: ['websocket'],
      auth: { token: playerToken },
      timeout: 8000,
    });

    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('timeout connexion socket joueur')), 8000);
        socket.once('connect', () => {
          clearTimeout(timeout);
          resolve();
        });
        socket.once('connect_error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
      socket.emit('subscribe:gl-game', { gameId });
      await new Promise((resolve) => setTimeout(resolve, 120));
      const payloadPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('timeout réception gl:game:event')), 8000);
        socket.once('gl:game:event', (msg) => {
          clearTimeout(timeout);
          resolve(msg);
        });
      });

      const emitRes = await request.post(`/api/gl/games/${gameId}/events`, {
        headers: adminHeaders,
        data: { teamId, eventType: 'move', payload: { source: 'e2e-mj' } },
      });
      expect(emitRes.status()).toBe(201);

      const payload = await payloadPromise;
      expect(Number(payload.gameId)).toBe(gameId);
      expect(payload.eventType).toBe('move');
      expect(Number(payload.teamId)).toBe(teamId);
      expect(payload.payload.source).toBe('e2e-mj');
    } finally {
      socket.close();
    }
  });

  test('MJ active tours + narration : joueur reçoit turn_change puis narration', async ({ request }) => {
    const now = Date.now();
    const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';
    const chapter = await queryOne('SELECT id FROM gl_chapters ORDER BY order_index ASC, id ASC LIMIT 1');
    expect(Number(chapter?.id || 0)).toBeGreaterThan(0);

    await execute(
      'INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(), NOW())',
      [`e2e-mj-toggles-${now}@example.org`, `E2E MJ Toggles ${now}`, 'admin']
    );
    const adminRow = await queryOne('SELECT id FROM gl_admins ORDER BY id DESC LIMIT 1');
    const adminId = Number(adminRow?.id || 0);

    await execute(
      'INSERT INTO gl_classes (name, school, created_by, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(), NOW())',
      [`6e E2E Toggles ${now}`, 'Lyautey', adminId]
    );
    const classRow = await queryOne('SELECT id FROM gl_classes ORDER BY id DESC LIMIT 1');
    const classId = Number(classRow?.id || 0);

    await execute(
      `INSERT INTO gl_players (class_id, team_id, pseudo, pin_hash, is_active, created_at, updated_at)
       VALUES (?, NULL, ?, 'x', 1, NOW(), NOW())`,
      [classId, `e2e_player_toggles_${now}`]
    );
    const playerRow = await queryOne('SELECT id FROM gl_players ORDER BY id DESC LIMIT 1');
    const playerId = Number(playerRow?.id || 0);

    await execute(
      `INSERT INTO gl_games (class_id, chapter_id, name, status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, 'live', ?, NOW(), NOW())`,
      [classId, Number(chapter.id), `Partie E2E Toggles ${now}`, adminId]
    );
    const gameRow = await queryOne('SELECT id FROM gl_games ORDER BY id DESC LIMIT 1');
    const gameId = Number(gameRow?.id || 0);

    await execute(
      `INSERT INTO gl_teams (game_id, name, type, color, created_at, updated_at)
       VALUES (?, ?, 'gnome', '#22c55e', NOW(), NOW())`,
      [gameId, `Eq E2E ${now}`]
    );
    const teamRow = await queryOne('SELECT id FROM gl_teams ORDER BY id DESC LIMIT 1');
    const teamId = Number(teamRow?.id || 0);
    await execute(
      `INSERT INTO gl_teams (game_id, name, type, color, created_at, updated_at)
       VALUES (?, ?, 'unicorn', '#a855f7', NOW(), NOW())`,
      [gameId, `Eq E2E #2 ${now}`]
    );

    const adminToken = await signAuthToken({
      product: 'gl',
      userType: 'gl_admin',
      userId: String(adminId),
      roleSlug: 'gl_admin',
      permissions: ['gl.read', 'gl.game.manage', 'gl.event.emit', 'gl.settings.manage'],
    });
    const adminHeaders = { Authorization: `Bearer ${adminToken}` };

    const playerToken = await signAuthToken({
      product: 'gl',
      userType: 'gl_player',
      userId: String(playerId),
      roleSlug: 'gl_player',
      permissions: ['gl.read', 'gl.action.request'],
      classId,
      teamId: null,
    });

    const joinRes = await request.post(`/api/gl/games/${gameId}/join-team`, {
      headers: { Authorization: `Bearer ${playerToken}` },
      data: { teamId },
    });
    expect(joinRes.status()).toBe(200);

    // Active les toggles tours + narration côté MJ
    const putTurns = await request.put('/api/gl/admin/settings/gameplay.turns_enabled', {
      headers: { ...adminHeaders, 'Content-Type': 'application/json' },
      data: { value: true },
    });
    expect(putTurns.status()).toBe(200);
    const putNarr = await request.put('/api/gl/admin/settings/gameplay.narration_enabled', {
      headers: { ...adminHeaders, 'Content-Type': 'application/json' },
      data: { value: true },
    });
    expect(putNarr.status()).toBe(200);

    const socket = clientIo(baseURL, {
      path: '/socket.io',
      transports: ['websocket'],
      auth: { token: playerToken },
      timeout: 8000,
    });

    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('timeout connexion socket joueur')), 8000);
        socket.once('connect', () => {
          clearTimeout(timeout);
          resolve();
        });
        socket.once('connect_error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });
      socket.emit('subscribe:gl-game', { gameId });
      await new Promise((resolve) => setTimeout(resolve, 120));

      // Capture les événements suivants : turn_change puis narration.
      const received = [];
      const turnPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('timeout turn_change')), 8000);
        const handler = (msg) => {
          received.push(msg);
          if (msg?.eventType === 'turn_change') {
            socket.off('gl:game:event', handler);
            clearTimeout(timeout);
            resolve(msg);
          }
        };
        socket.on('gl:game:event', handler);
      });

      const turnRes = await request.post(`/api/gl/games/${gameId}/turn/next`, { headers: adminHeaders });
      expect(turnRes.status()).toBe(200);
      const turnMsg = await turnPromise;
      expect(Number(turnMsg.gameId)).toBe(gameId);
      expect(Number(turnMsg.payload.teamId)).toBe(teamId);

      const narrPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('timeout narration')), 8000);
        const handler = (msg) => {
          if (msg?.eventType === 'narration') {
            socket.off('gl:game:event', handler);
            clearTimeout(timeout);
            resolve(msg);
          }
        };
        socket.on('gl:game:event', handler);
      });
      const narrRes = await request.post(`/api/gl/games/${gameId}/events`, {
        headers: { ...adminHeaders, 'Content-Type': 'application/json' },
        data: { eventType: 'narration', teamId, payload: { text: 'Bienvenue dans la forêt magique !' } },
      });
      expect(narrRes.status()).toBe(201);
      const narrMsg = await narrPromise;
      expect(String(narrMsg.payload.text)).toContain('forêt magique');
    } finally {
      socket.close();
      // Désactive les toggles pour ne pas polluer les autres specs
      await request.put('/api/gl/admin/settings/gameplay.turns_enabled', {
        headers: { ...adminHeaders, 'Content-Type': 'application/json' },
        data: { value: false },
      }).catch(() => {});
      await request.put('/api/gl/admin/settings/gameplay.narration_enabled', {
        headers: { ...adminHeaders, 'Content-Type': 'application/json' },
        data: { value: false },
      }).catch(() => {});
    }
  });

  test('onglet Cartes : plein écran carte puis Échap pour quitter', async ({ page }) => {
    const seeded = await seedGlScenario('map-fullscreen');

    await page.setExtraHTTPHeaders({ 'X-Foretmap-Product': 'gl' });
    await page.goto('/');
    await page.evaluate(({ sessionPayload, tab }) => {
      localStorage.setItem('gl_session', JSON.stringify(sessionPayload));
      localStorage.setItem('gl_active_tab', tab);
    }, {
      sessionPayload: {
        token: seeded.playerToken,
        auth: {
          userType: 'gl_player',
          roleSlug: 'gl_player',
          displayName: seeded.playerPseudo,
          teamId: seeded.teamId,
          gameId: seeded.gameId,
        },
      },
      tab: 'maps',
    });
    await page.reload();

    const board = page.locator('.gl-board');
    await expect(board).toBeVisible({ timeout: 15000 });

    await page.getByTestId('gl-map-fullscreen-open').click();
    await expect(board).toHaveClass(/gl-board--fullscreen/);
    await expect(page.getByTestId('gl-map-fullscreen-open')).toHaveCount(0);
    await expect(page.getByTestId('gl-map-fullscreen-close')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(board).not.toHaveClass(/gl-board--fullscreen/);
    await expect(page.getByTestId('gl-map-fullscreen-open')).toBeVisible();
  });
});
