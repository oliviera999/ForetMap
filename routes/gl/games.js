const express = require('express');
const { queryAll, queryOne, execute, withTransaction } = require('../../database');
const { requireGlAuth, requireGlPermission } = require('../../middleware/requireGlAuth');
const { normalizeEventRow, replayGameEvents } = require('../../lib/glGameEvents');
const { emitGlGameEvent } = require('../../lib/realtime');

const router = express.Router();

function parseId(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeOptionalString(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

async function readGameState(gameId) {
  const game = await queryOne(
    `SELECT g.id, g.class_id, g.chapter_id, g.name, g.status, g.created_by, g.created_at, g.updated_at,
            c.name AS class_name,
            ch.slug AS chapter_slug, ch.title AS chapter_title, ch.biome, ch.map_image_url,
            ch.story_markdown, ch.biotope_markdown, ch.biocenose_markdown
       FROM gl_games g
  LEFT JOIN gl_classes c ON c.id = g.class_id
  LEFT JOIN gl_chapters ch ON ch.id = g.chapter_id
      WHERE g.id = ?
      LIMIT 1`,
    [gameId]
  );
  if (!game) return null;

  const teams = await queryAll(
    `SELECT t.id, t.game_id, t.name, t.type, t.mascot_id, t.position_marker_id, t.color, t.created_at, t.updated_at,
            m.label AS position_label, m.x_pct AS position_x_pct, m.y_pct AS position_y_pct
       FROM gl_teams t
  LEFT JOIN gl_chapter_markers m ON m.id = t.position_marker_id
      WHERE t.game_id = ?
      ORDER BY t.id ASC`,
    [gameId]
  );
  const eventsRaw = await queryAll(
    `SELECT id, game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at
       FROM gl_game_events
      WHERE game_id = ?
      ORDER BY id ASC`,
    [gameId]
  );
  const events = eventsRaw.map(normalizeEventRow);
  const markers = await queryAll(
    `SELECT id, chapter_id, x_pct, y_pct, event_type, label, description, order_index
       FROM gl_chapter_markers
      WHERE chapter_id = ?
      ORDER BY order_index ASC, id ASC`,
    [game.chapter_id]
  );
  const replay = replayGameEvents(eventsRaw, {
    gameStatus: game.status,
    teamsById: Object.fromEntries(teams.map((team) => [team.id, team])),
  });
  return {
    game,
    teams,
    markers,
    events,
    replay,
  };
}

router.get('/chapters', requireGlPermission('gl.read'), async (_req, res) => {
  const rows = await queryAll(
    `SELECT id, slug, title, biome, map_image_url, order_index
       FROM gl_chapters
      ORDER BY order_index ASC, id ASC`
  );
  return res.json(rows);
});

router.get('/games/:id', requireGlAuth, async (req, res) => {
  const gameId = parseId(req.params.id);
  if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
  const state = await readGameState(gameId);
  if (!state) return res.status(404).json({ error: 'Partie introuvable' });
  if (req.glAuth.userType === 'gl_player') {
    const linked = await queryOne(
      `SELECT 1 AS ok
         FROM gl_team_members tm
    INNER JOIN gl_players p ON p.id = tm.player_id
        WHERE tm.game_id = ?
          AND p.id = ?
        LIMIT 1`,
      [gameId, req.glAuth.userId]
    );
    if (!linked && req.glAuth.teamId == null) {
      return res.status(403).json({ error: 'Accès refusé à cette partie' });
    }
  }
  return res.json(state);
});

router.post('/games', requireGlPermission('gl.game.manage'), async (req, res) => {
  const classId = parseId(req.body?.classId);
  const chapterId = parseId(req.body?.chapterId);
  const name = normalizeOptionalString(req.body?.name) || 'Nouvelle partie';
  if (!classId || !chapterId) return res.status(400).json({ error: 'classId et chapterId requis' });
  await execute(
    `INSERT INTO gl_games (class_id, chapter_id, name, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, 'draft', ?, NOW(), NOW())`,
    [classId, chapterId, name, req.glAuth.userId]
  );
  const created = await queryOne('SELECT id FROM gl_games ORDER BY id DESC LIMIT 1');
  const state = await readGameState(created.id);
  return res.status(201).json(state);
});

router.post('/games/:id/teams', requireGlPermission('gl.team.manage'), async (req, res) => {
  const gameId = parseId(req.params.id);
  if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
  const name = normalizeOptionalString(req.body?.name);
  const type = String(req.body?.type || '').toLowerCase();
  const mascotId = normalizeOptionalString(req.body?.mascotId);
  const color = normalizeOptionalString(req.body?.color) || '#22c55e';
  if (!name) return res.status(400).json({ error: 'Nom d’équipe requis' });
  if (!['gnome', 'unicorn'].includes(type)) return res.status(400).json({ error: 'Type équipe invalide' });
  await execute(
    `INSERT INTO gl_teams (game_id, name, type, mascot_id, position_marker_id, color, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, ?, NOW(), NOW())`,
    [gameId, name, type, mascotId, color]
  );
  const team = await queryOne('SELECT * FROM gl_teams WHERE game_id = ? ORDER BY id DESC LIMIT 1', [gameId]);
  return res.status(201).json(team);
});

router.post('/games/:id/join-team', requireGlAuth, async (req, res) => {
  if (req.glAuth.userType !== 'gl_player') return res.status(403).json({ error: 'Réservé aux joueurs' });
  const gameId = parseId(req.params.id);
  const teamId = parseId(req.body?.teamId);
  if (!gameId || !teamId) return res.status(400).json({ error: 'gameId/teamId invalides' });
  await withTransaction(async (tx) => {
    const team = await tx.queryOne('SELECT id, game_id FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1', [teamId, gameId]);
    if (!team) throw Object.assign(new Error('TEAM_NOT_FOUND'), { status: 404 });
    await tx.execute(
      `INSERT INTO gl_team_members (game_id, team_id, player_id, joined_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE team_id = VALUES(team_id), joined_at = NOW()`,
      [gameId, teamId, req.glAuth.userId]
    );
    await tx.execute('UPDATE gl_players SET team_id = ?, updated_at = NOW() WHERE id = ?', [teamId, req.glAuth.userId]);
  }).catch((err) => {
    if (err?.status === 404) {
      throw err;
    }
    throw err;
  });
  return res.json({ ok: true });
});

router.post('/games/:id/events', requireGlPermission('gl.event.emit'), async (req, res) => {
  const gameId = parseId(req.params.id);
  const teamId = req.body?.teamId != null ? parseId(req.body.teamId) : null;
  const eventType = normalizeOptionalString(req.body?.eventType);
  const payload = req.body?.payload ?? {};
  if (!gameId || !eventType) return res.status(400).json({ error: 'gameId et eventType requis' });
  const actorType = req.glAuth.userType === 'gl_admin' ? 'mj' : 'team';
  const actorId = String(req.glAuth.userId);
  await withTransaction(async (tx) => {
    await tx.execute(
      `INSERT INTO gl_game_events (game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [gameId, teamId, actorType, actorId, eventType, JSON.stringify(payload)]
    );
    if (eventType === 'move' && teamId != null && payload?.markerId != null) {
      await tx.execute('UPDATE gl_teams SET position_marker_id = ?, updated_at = NOW() WHERE id = ? AND game_id = ?', [
        Number(payload.markerId),
        teamId,
        gameId,
      ]);
    }
  });
  const evt = await queryOne(
    `SELECT id, game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at
       FROM gl_game_events
      WHERE game_id = ?
      ORDER BY id DESC
      LIMIT 1`,
    [gameId]
  );
  const normalized = normalizeEventRow(evt);
  emitGlGameEvent(gameId, normalized);
  return res.status(201).json(normalized);
});

async function updateGameStatus(req, res, nextStatus) {
  const gameId = parseId(req.params.id);
  if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
  await execute('UPDATE gl_games SET status = ?, updated_at = NOW() WHERE id = ?', [nextStatus, gameId]);
  await execute(
    `INSERT INTO gl_game_events (game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at)
     VALUES (?, NULL, 'mj', ?, 'game_status', ?, NOW())`,
    [gameId, req.glAuth.userId, JSON.stringify({ status: nextStatus })]
  );
  const evt = await queryOne(
    'SELECT id, game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at FROM gl_game_events WHERE game_id = ? ORDER BY id DESC LIMIT 1',
    [gameId]
  );
  const normalized = normalizeEventRow(evt);
  emitGlGameEvent(gameId, normalized);
  return res.json({ ok: true, status: nextStatus });
}

router.post('/games/:id/start', requireGlPermission('gl.game.manage'), (req, res) => updateGameStatus(req, res, 'live'));
router.post('/games/:id/pause', requireGlPermission('gl.game.manage'), (req, res) => updateGameStatus(req, res, 'paused'));
router.post('/games/:id/end', requireGlPermission('gl.game.manage'), (req, res) => updateGameStatus(req, res, 'ended'));

module.exports = router;
