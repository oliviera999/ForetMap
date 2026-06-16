'use strict';

const bcrypt = require('bcryptjs');
const { execute, queryOne } = require('../../database');
const { signAuthToken } = require('../../middleware/requireTeacher');

async function createGlAdmin(options = {}) {
  const email = String(options.email || `gl.admin.${Date.now()}@ecole.local`).toLowerCase();
  const displayName = String(options.displayName || 'MJ Test');
  const role = String(options.role || 'admin');

  await execute(
    `INSERT INTO gl_admins (email, display_name, role, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       display_name = VALUES(display_name),
       role = VALUES(role),
       is_active = 1,
       updated_at = NOW()`,
    [email, displayName, role],
  );
  return queryOne('SELECT * FROM gl_admins WHERE email = ? LIMIT 1', [email]);
}

async function createGlClass(options = {}) {
  const name = String(options.name || `Classe GL ${Date.now()}`);
  const school = String(options.school || 'Ecole Test');
  const adminId = Number(options.adminId);
  await execute(
    `INSERT INTO gl_classes (name, school, created_by, is_active, created_at, updated_at)
     VALUES (?, ?, ?, 1, NOW(), NOW())`,
    [name, school, adminId],
  );
  return queryOne('SELECT * FROM gl_classes WHERE name = ? ORDER BY id DESC LIMIT 1', [name]);
}

async function createGlPlayer(options = {}) {
  const classId = Number(options.classId);
  const teamId = options.teamId == null ? null : Number(options.teamId);
  const pseudo = String(options.pseudo || `gl-player-${Date.now()}`);
  const password = String(options.password || '1234');
  const firstName = options.firstName == null ? 'Prenom' : String(options.firstName);
  const lastName = options.lastName == null ? 'Nom' : String(options.lastName);
  const passwordMustReset = options.passwordMustReset ? 1 : 0;
  const isActive = options.isActive == null ? 1 : options.isActive ? 1 : 0;
  const linkedForetmapUserId =
    options.linkedForetmapUserId == null ? null : String(options.linkedForetmapUserId);
  const email = options.email == null ? null : String(options.email).trim().toLowerCase() || null;
  const passwordHash = options.passwordHash || (await bcrypt.hash(password, 10));

  await execute('DELETE FROM gl_players WHERE pseudo = ?', [pseudo]);
  const healthPoints = options.healthPoints == null ? 3 : Number(options.healthPoints);
  const powerPoints = options.powerPoints == null ? 3 : Number(options.powerPoints);
  await execute(
    `INSERT INTO gl_players
      (class_id, team_id, first_name, last_name, email, pseudo, password_must_reset, password_hash,
       linked_foretmap_user_id, is_active, health_points, power_points, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      classId,
      teamId,
      firstName,
      lastName,
      email,
      pseudo,
      passwordMustReset,
      passwordHash,
      linkedForetmapUserId,
      isActive,
      healthPoints,
      powerPoints,
    ],
  );
  return queryOne('SELECT * FROM gl_players WHERE pseudo = ? ORDER BY id DESC LIMIT 1', [pseudo]);
}

async function createGlChapterWithMarker(options = {}) {
  const stamp = Date.now();
  const slug = String(options.slug || `gl-chapter-${stamp}`).toLowerCase();
  const title = String(options.title || `Chapitre ${stamp}`);
  const biome = String(options.biome || 'foret');
  const mapImageUrl = String(options.mapImageUrl || '');
  const markerLabel = String(options.markerLabel || 'Repere');

  await execute(
    `INSERT INTO gl_chapters
      (slug, title, biome, map_image_url, story_markdown, biotope_markdown, biocenose_markdown, order_index, created_at, updated_at)
     VALUES (?, ?, ?, ?, '# Story', '# Biotope', '# Biocenose', 0, NOW(), NOW())
     ON DUPLICATE KEY UPDATE
       title = VALUES(title),
       biome = VALUES(biome),
       map_image_url = VALUES(map_image_url),
       updated_at = NOW()`,
    [slug, title, biome, mapImageUrl],
  );
  const chapter = await queryOne('SELECT * FROM gl_chapters WHERE slug = ? LIMIT 1', [slug]);
  const biomeSlugs = Array.isArray(options.biomeSlugs) ? options.biomeSlugs : [];
  for (let i = 0; i < biomeSlugs.length; i += 1) {
    await execute(
      `INSERT INTO gl_chapter_biomes (chapter_id, biome_slug, order_index)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE order_index = VALUES(order_index)`,
      [chapter.id, biomeSlugs[i], i * 10],
    );
  }
  await execute(
    `INSERT INTO gl_chapter_markers (chapter_id, x_pct, y_pct, event_type, label, description, order_index)
     VALUES (?, 50, 50, 'point', ?, 'repere', 0)`,
    [chapter.id, markerLabel],
  );
  const marker = await queryOne(
    'SELECT * FROM gl_chapter_markers WHERE chapter_id = ? ORDER BY id DESC LIMIT 1',
    [chapter.id],
  );
  return { chapter, marker };
}

async function createGlGameWithTeams(options = {}) {
  const classId = Number(options.classId);
  const chapterId = Number(options.chapterId);
  const createdBy = Number(options.createdBy);
  const status = String(options.status || 'live');
  const name = String(options.name || `Partie GL ${Date.now()}`);
  const teams = Array.isArray(options.teams) ? options.teams : [];

  await execute(
    `INSERT INTO gl_games (class_id, chapter_id, name, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
    [classId, chapterId, name, status, createdBy],
  );
  const game = await queryOne('SELECT * FROM gl_games WHERE name = ? ORDER BY id DESC LIMIT 1', [
    name,
  ]);
  const createdTeams = [];
  for (const team of teams) {
    await execute(
      `INSERT INTO gl_teams (game_id, name, type, mascot_id, color, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        game.id,
        String(team.name || `Equipe ${createdTeams.length + 1}`),
        String(team.type || 'gnome'),
        team.mascotId == null ? null : String(team.mascotId),
        String(team.color || '#22c55e'),
      ],
    );
    const row = await queryOne(
      'SELECT * FROM gl_teams WHERE game_id = ? ORDER BY id DESC LIMIT 1',
      [game.id],
    );
    createdTeams.push(row);
  }
  return { game, teams: createdTeams };
}

async function signTokens(options = {}) {
  const adminId = options.adminId == null ? null : String(options.adminId);
  const playerId = options.playerId == null ? null : String(options.playerId);
  const playerPseudo = String(options.playerPseudo || 'Joueur');
  const teamId = options.teamId == null ? null : Number(options.teamId);
  const adminPermissions = Array.isArray(options.adminPermissions)
    ? options.adminPermissions
    : ['gl.read', 'gl.game.manage', 'gl.team.manage', 'gl.event.emit', 'gl.settings.manage'];
  const playerPermissions = Array.isArray(options.playerPermissions)
    ? options.playerPermissions
    : ['gl.read', 'gl.action.request'];

  const out = {};
  if (adminId) {
    out.adminToken = await signAuthToken({
      product: 'gl',
      userType: 'gl_admin',
      userId: adminId,
      roleSlug: 'gl_admin',
      permissions: adminPermissions,
      displayName: String(options.adminDisplayName || 'MJ Test'),
    });
  }
  if (playerId) {
    out.playerToken = await signAuthToken({
      product: 'gl',
      userType: 'gl_player',
      userId: playerId,
      roleSlug: 'gl_player',
      permissions: playerPermissions,
      displayName: playerPseudo,
      teamId,
    });
  }
  return out;
}

async function assignPlayerToGameTeam({ gameId, teamId, playerId }) {
  await execute(
    `INSERT INTO gl_team_members (game_id, team_id, player_id)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE team_id = VALUES(team_id)`,
    [Number(gameId), Number(teamId), Number(playerId)],
  );
}

module.exports = {
  createGlAdmin,
  createGlClass,
  createGlPlayer,
  createGlChapterWithMarker,
  createGlGameWithTeams,
  assignPlayerToGameTeam,
  signTokens,
};
