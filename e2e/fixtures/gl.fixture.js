const { execute, queryOne } = require('../../database');
const { signAuthToken } = require('../../middleware/requireTeacher');

async function seedGlScenario(label = 'default') {
  const stamp = Date.now();
  const adminEmail = `e2e-${label}-mj-${stamp}@example.org`;
  await execute(
    'INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(), NOW())',
    [adminEmail, `MJ ${label}`, 'admin'],
  );
  const admin = await queryOne('SELECT id FROM gl_admins WHERE email = ? LIMIT 1', [adminEmail]);

  await execute(
    'INSERT INTO gl_classes (name, school, created_by, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, NOW(), NOW())',
    [`Classe ${label} ${stamp}`, 'Lyautey', admin.id],
  );
  const cls = await queryOne('SELECT id FROM gl_classes ORDER BY id DESC LIMIT 1');

  const chapter = await queryOne(
    'SELECT id FROM gl_chapters ORDER BY order_index ASC, id ASC LIMIT 1',
  );
  await execute(
    `INSERT INTO gl_games (class_id, chapter_id, name, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, 'live', ?, NOW(), NOW())`,
    [cls.id, chapter.id, `Partie ${label} ${stamp}`, admin.id],
  );
  const game = await queryOne('SELECT id FROM gl_games ORDER BY id DESC LIMIT 1');

  await execute(
    `INSERT INTO gl_teams (game_id, name, type, color, created_at, updated_at)
     VALUES (?, 'Equipe A', 'gnome', '#22c55e', NOW(), NOW())`,
    [game.id],
  );
  const team = await queryOne(
    'SELECT id FROM gl_teams WHERE game_id = ? ORDER BY id DESC LIMIT 1',
    [game.id],
  );

  await execute(
    `INSERT INTO gl_players (class_id, team_id, first_name, last_name, pseudo, password_hash, is_active, created_at, updated_at)
     VALUES (?, ?, 'Play', 'Er', ?, 'x', 1, NOW(), NOW())`,
    [cls.id, team.id, `player-${label}-${stamp}`],
  );
  const player = await queryOne('SELECT id, pseudo FROM gl_players ORDER BY id DESC LIMIT 1');

  await execute(
    `INSERT INTO gl_team_members (game_id, team_id, player_id, joined_at)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE team_id = VALUES(team_id), joined_at = NOW()`,
    [game.id, team.id, player.id],
  );

  const adminToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_admin',
    userId: String(admin.id),
    roleSlug: 'gl_admin',
    permissions: [
      'gl.read',
      'gl.players.manage',
      'gl.game.manage',
      'gl.event.emit',
      'gl.action.request',
      'gl.team.manage',
      'gl.settings.manage',
    ],
    displayName: `MJ ${label}`,
  });
  const playerToken = await signAuthToken({
    product: 'gl',
    userType: 'gl_player',
    userId: String(player.id),
    roleSlug: 'gl_player',
    permissions: ['gl.read', 'gl.action.request'],
    displayName: player.pseudo,
    teamId: team.id,
  });

  return {
    adminId: Number(admin.id),
    gameId: Number(game.id),
    teamId: Number(team.id),
    playerId: Number(player.id),
    adminToken,
    playerToken,
    playerPseudo: player.pseudo,
  };
}

/** Prépare localStorage GL (intro passée) puis recharge la page. */
async function mountGlSession(page, { token, auth, tab = null, skipIntro = true } = {}) {
  await page.setExtraHTTPHeaders({ 'X-Foretmap-Product': 'gl' });
  await page.goto('/');
  await page.evaluate(
    (payload) => {
      if (payload.skipIntro) localStorage.setItem('gl_intro_seen', '1');
      if (payload.session) {
        localStorage.setItem('gl_session', JSON.stringify(payload.session));
      }
      if (payload.tab) localStorage.setItem('gl_active_tab', payload.tab);
    },
    {
      skipIntro,
      session: token ? { token, auth } : null,
      tab,
    },
  );
  await page.reload();
}

module.exports = { seedGlScenario, mountGlSession };
