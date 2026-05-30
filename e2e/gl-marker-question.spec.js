const { test, expect } = require('@playwright/test');
const { signAuthToken } = require('../middleware/requireTeacher');
const { queryOne, execute } = require('../database');
const { serializeEventConfig } = require('../lib/glMarkerEventConfig');

test.describe('GL repère question — present-question API', () => {
  test('POST present-question retourne une présentation QCM', async ({ request }) => {
    const now = Date.now();
    const chapter = await queryOne('SELECT id FROM gl_chapters ORDER BY order_index ASC, id ASC LIMIT 1');
    expect(Number(chapter?.id || 0)).toBeGreaterThan(0);

    await execute(
      'INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(), NOW())',
      [`e2e-mq-${now}@example.org`, `E2E MQ ${now}`, 'admin']
    );
    const adminRow = await queryOne('SELECT id FROM gl_admins ORDER BY id DESC LIMIT 1');
    const adminId = Number(adminRow.id);

    await execute(
      'INSERT INTO gl_classes (name, school, created_by, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(), NOW())',
      [`6e MQ ${now}`, 'Lyautey', adminId]
    );
    const classRow = await queryOne('SELECT id FROM gl_classes ORDER BY id DESC LIMIT 1');

    await execute(
      `INSERT INTO gl_players (class_id, pseudo, password_hash, is_active, created_at, updated_at)
       VALUES (?, ?, 'x', 1, NOW(), NOW())`,
      [classRow.id, `e2e_mq_player_${now}`]
    );
    const playerRow = await queryOne('SELECT id FROM gl_players ORDER BY id DESC LIMIT 1');

    const eventConfig = serializeEventConfig({
      version: 1,
      question: { mode: 'fixed', fixedQuestionCode: 'QCM0001', pool: { biomeMode: 'chapter' } },
    });
    await execute(
      `INSERT INTO gl_chapter_markers (chapter_id, x_pct, y_pct, event_type, label, description, event_config_json, order_index, created_at)
       VALUES (?, 50, 50, 'question', ?, 'e2e', ?, 0, NOW())`,
      [chapter.id, `Repère Q ${now}`, eventConfig]
    );
    const markerRow = await queryOne('SELECT id FROM gl_chapter_markers ORDER BY id DESC LIMIT 1');

    await execute(
      `INSERT INTO gl_games (class_id, chapter_id, name, status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, 'live', ?, NOW(), NOW())`,
      [classRow.id, chapter.id, `Partie MQ ${now}`, adminId]
    );
    const gameRow = await queryOne('SELECT id FROM gl_games ORDER BY id DESC LIMIT 1');

    await execute(
      `INSERT INTO gl_teams (game_id, name, type, color, created_at, updated_at)
       VALUES (?, ?, 'gnome', '#22c55e', NOW(), NOW())`,
      [gameRow.id, `Equipe MQ ${now}`]
    );
    const teamRow = await queryOne('SELECT id FROM gl_teams ORDER BY id DESC LIMIT 1');

    await execute(
      `INSERT INTO gl_team_members (game_id, team_id, player_id, joined_at)
       VALUES (?, ?, ?, NOW())`,
      [gameRow.id, teamRow.id, playerRow.id]
    );

    const playerToken = await signAuthToken({
      product: 'gl',
      userType: 'gl_player',
      userId: String(playerRow.id),
      roleSlug: 'gl_player',
      permissions: ['gl.read', 'gl.action.request'],
      teamId: Number(teamRow.id),
    });

    const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000';
    const res = await request.post(
      `${baseURL}/api/gl/games/${gameRow.id}/markers/${markerRow.id}/present-question`,
      {
        headers: { Authorization: `Bearer ${playerToken}` },
        data: {},
      }
    );

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.questionCode).toBeTruthy();
    expect(body.presentation?.question).toBeTruthy();
    expect(body.presentation?.presentationToken).toBeTruthy();
  });
});
