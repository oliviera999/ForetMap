const express = require('express');
const { queryAll, queryOne, execute, withTransaction } = require('../../database');
const { requireGlAuth, requireGlPermission } = require('../../middleware/requireGlAuth');
const { normalizeEventRow, replayGameEvents } = require('../../lib/glGameEvents');
const { emitGlGameEvent } = require('../../lib/realtime');
const { getGameplaySettings } = require('../../lib/glSettings');
const { logRouteError } = require('../../lib/routeLog');
const { assignPlayerToTeamTx, unassignPlayerFromGameTx } = require('../../lib/glRoster');
const { canAccessGlGame } = require('../../lib/glGameAccess');
const { verifyPresentationAnswer } = require('../../lib/glQcmChoices');
const { combineKeywords } = require('../../lib/glQcmImport');
const { buildGlossaryLookupMap, matchGlossaryTermsForSpecies } = require('../../lib/glGlossaryMatch');

const router = express.Router();

function parseId(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parsePct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > 100) return null;
  return Number(n.toFixed(2));
}

function normalizeOptionalString(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function resolveRosterError(err) {
  if (err?.status === 404) {
    if (err.message === 'TEAM_NOT_FOUND') return { status: 404, error: 'Équipe introuvable' };
    if (err.message === 'PLAYER_NOT_FOUND') return { status: 404, error: 'Joueur introuvable' };
    if (err.message === 'GAME_NOT_FOUND') return { status: 404, error: 'Partie introuvable' };
    return { status: 404, error: 'Ressource introuvable' };
  }
  if (err?.status === 409 || err?.message === 'PLAYER_CLASS_MISMATCH') {
    return { status: 409, error: 'Le joueur n’appartient pas à la classe de cette partie' };
  }
  return null;
}

async function readGameState(gameId) {
  const game = await queryOne(
    `SELECT g.id, g.class_id, g.chapter_id, g.name, g.status, g.current_team_id,
            g.created_by, g.created_at, g.updated_at,
            c.name AS class_name,
            ch.slug AS chapter_slug, ch.title AS chapter_title, ch.biome, ch.biome_slug,
            b.nom AS biome_nom, ch.map_image_url,
            ch.story_markdown, ch.biotope_markdown, ch.biocenose_markdown
       FROM gl_games g
  LEFT JOIN gl_classes c ON c.id = g.class_id
  LEFT JOIN gl_chapters ch ON ch.id = g.chapter_id
  LEFT JOIN gl_biomes b ON b.slug = ch.biome_slug
      WHERE g.id = ?
      LIMIT 1`,
    [gameId]
  );
  if (!game) return null;

  const teams = await queryAll(
    `SELECT t.id, t.game_id, t.name, t.type, t.mascot_id, t.position_marker_id, t.color, t.created_at, t.updated_at,
            t.position_x_pct AS free_position_x_pct, t.position_y_pct AS free_position_y_pct,
            m.label AS position_label, m.x_pct AS marker_position_x_pct, m.y_pct AS marker_position_y_pct,
            COALESCE(t.position_x_pct, m.x_pct, 50) AS position_x_pct,
            COALESCE(t.position_y_pct, m.y_pct, 50) AS position_y_pct
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
    `SELECT id, chapter_id, x_pct, y_pct, event_type, label, description,
            qcm_categorie_slug, qcm_question_code, order_index
       FROM gl_chapter_markers
      WHERE chapter_id = ?
      ORDER BY order_index ASC, id ASC`,
    [game.chapter_id]
  );
  const scoreRows = await queryAll(
    'SELECT team_id, score, last_reason FROM gl_team_scores WHERE game_id = ?',
    [gameId]
  );
  const scores = {};
  for (const row of scoreRows) {
    scores[row.team_id] = { score: Number(row.score) || 0, lastReason: row.last_reason || null };
  }
  const pendingRows = await queryAll(
    `SELECT id, team_id, player_id, action_type, payload_json, created_at
       FROM gl_action_requests
      WHERE game_id = ? AND status = 'pending'
      ORDER BY id ASC`,
    [gameId]
  );
  const pendingActions = pendingRows.map((row) => {
    let payload = {};
    try {
      payload = row.payload_json ? JSON.parse(row.payload_json) : {};
    } catch (_) {
      payload = {};
    }
    return {
      id: Number(row.id),
      teamId: row.team_id != null ? Number(row.team_id) : null,
      playerId: row.player_id != null ? Number(row.player_id) : null,
      actionType: String(row.action_type || ''),
      payload,
      createdAt: row.created_at,
    };
  });
  const replay = replayGameEvents(eventsRaw, {
    gameStatus: game.status,
    currentTeamId: game.current_team_id,
    teamsById: Object.fromEntries(teams.map((team) => [team.id, team])),
    positionsByTeamId: Object.fromEntries(teams.map((team) => [Number(team.id), {
      markerId: team.position_marker_id != null ? Number(team.position_marker_id) : null,
      xp: team.position_x_pct != null ? Number(team.position_x_pct) : null,
      yp: team.position_y_pct != null ? Number(team.position_y_pct) : null,
    }])),
    markersByTeamId: Object.fromEntries(teams.map((team) => [
      Number(team.id),
      team.position_marker_id != null ? Number(team.position_marker_id) : null,
    ])),
  });
  return {
    game,
    teams,
    markers,
    events,
    scores,
    pendingActions,
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

/**
 * Snapshot public des toggles gameplay (joueur + admin) :
 * le frontend en a besoin pour conditionner l'UI (tour, narration, actions, score).
 */
router.get('/gameplay-settings', requireGlAuth, async (_req, res) => {
  const settings = await getGameplaySettings();
  return res.json({ settings });
});

router.get('/games', requireGlPermission('gl.game.manage'), async (req, res) => {
  const classId = req.query?.classId == null ? null : parseId(req.query.classId);
  const status = normalizeOptionalString(req.query?.status);
  if (req.query?.classId != null && !classId) {
    return res.status(400).json({ error: 'classId invalide' });
  }
  if (status != null && !['draft', 'live', 'paused', 'ended'].includes(status)) {
    return res.status(400).json({ error: 'status invalide' });
  }

  const where = [];
  const params = [];
  if (classId != null) {
    where.push('g.class_id = ?');
    params.push(classId);
  }
  if (status != null) {
    where.push('g.status = ?');
    params.push(status);
  }

  const rows = await queryAll(
    `SELECT g.id, g.name, g.status, g.class_id, c.name AS class_name,
            g.chapter_id, ch.title AS chapter_title, g.current_team_id,
            g.created_at, g.updated_at, COUNT(t.id) AS teams_count
       FROM gl_games g
  LEFT JOIN gl_classes c ON c.id = g.class_id
  LEFT JOIN gl_chapters ch ON ch.id = g.chapter_id
  LEFT JOIN gl_teams t ON t.game_id = g.id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
   GROUP BY g.id
   ORDER BY g.updated_at DESC, g.id DESC`,
    params
  );
  return res.json(rows.map((row) => ({
    id: Number(row.id),
    name: row.name || '',
    status: row.status || 'draft',
    classId: row.class_id != null ? Number(row.class_id) : null,
    className: row.class_name || null,
    chapterId: row.chapter_id != null ? Number(row.chapter_id) : null,
    chapterTitle: row.chapter_title || null,
    currentTeamId: row.current_team_id != null ? Number(row.current_team_id) : null,
    teamsCount: Number(row.teams_count) || 0,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  })));
});

router.get('/games/:id', requireGlAuth, async (req, res) => {
  const gameId = parseId(req.params.id);
  if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
  const state = await readGameState(gameId);
  if (!state) return res.status(404).json({ error: 'Partie introuvable' });
  if (!(await canAccessGlGame(req.glAuth, gameId))) {
    return res.status(403).json({ error: 'Accès refusé à cette partie' });
  }
  return res.json(state);
});

router.post('/games', requireGlPermission('gl.game.manage'), async (req, res) => {
  const classId = parseId(req.body?.classId);
  const chapterId = parseId(req.body?.chapterId);
  const name = normalizeOptionalString(req.body?.name) || 'Nouvelle partie';
  if (!classId || !chapterId) return res.status(400).json({ error: 'classId et chapterId requis' });

  // Validation préalable des FK : évite un 500 ER_NO_REFERENCED_ROW_2 (cf. POST /api/gl/games en prod, v1.52.3).
  const classRow = await queryOne(
    'SELECT id FROM gl_classes WHERE id = ? AND is_active = 1 LIMIT 1',
    [classId]
  );
  if (!classRow) return res.status(404).json({ error: 'Classe introuvable' });
  const chapterRow = await queryOne('SELECT id FROM gl_chapters WHERE id = ? LIMIT 1', [chapterId]);
  if (!chapterRow) return res.status(404).json({ error: 'Chapitre introuvable' });

  let insertResult;
  try {
    insertResult = await execute(
      `INSERT INTO gl_games (class_id, chapter_id, name, status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, 'draft', ?, NOW(), NOW())`,
      [classId, chapterId, name, req.glAuth.userId]
    );
  } catch (err) {
    // Filet de sécurité en cas de course entre la validation ci-dessus et l'INSERT.
    if (err && err.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(409).json({ error: 'Classe ou chapitre supprimé entre-temps' });
    }
    logRouteError(err, req, 'POST /api/gl/games : INSERT en échec');
    return res.status(500).json({ error: 'Erreur lors de la création de la partie' });
  }
  const newId = insertResult?.insertId;
  const state = await readGameState(newId);
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
  const gameRow = await queryOne('SELECT id FROM gl_games WHERE id = ? LIMIT 1', [gameId]);
  if (!gameRow) return res.status(404).json({ error: 'Partie introuvable' });
  let insertResult;
  try {
    insertResult = await execute(
      `INSERT INTO gl_teams (game_id, name, type, mascot_id, position_marker_id, color, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, ?, NOW(), NOW())`,
      [gameId, name, type, mascotId, color]
    );
  } catch (err) {
    if (err && err.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(409).json({ error: 'Partie supprimée entre-temps' });
    }
    logRouteError(err, req, 'POST /api/gl/games/:id/teams : INSERT en échec');
    return res.status(500).json({ error: 'Erreur lors de la création de l’équipe' });
  }
  const team = await queryOne('SELECT * FROM gl_teams WHERE id = ? LIMIT 1', [insertResult?.insertId]);
  return res.status(201).json(team);
});

router.put('/games/:id/teams/:teamId', requireGlPermission('gl.team.manage'), async (req, res) => {
  const gameId = parseId(req.params.id);
  const teamId = parseId(req.params.teamId);
  if (!gameId || !teamId) return res.status(400).json({ error: 'Identifiants invalides' });
  const existing = await queryOne('SELECT id, game_id FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1', [teamId, gameId]);
  if (!existing) return res.status(404).json({ error: 'Équipe introuvable' });

  const name = req.body?.name == null ? null : normalizeOptionalString(req.body.name);
  const type = req.body?.type == null ? null : String(req.body.type || '').toLowerCase();
  const mascotId = req.body?.mascotId == null ? null : normalizeOptionalString(req.body.mascotId);
  const color = req.body?.color == null ? null : normalizeOptionalString(req.body.color);
  if (name != null && !name) return res.status(400).json({ error: 'Nom d’équipe invalide' });
  if (type != null && !['gnome', 'unicorn'].includes(type)) {
    return res.status(400).json({ error: 'Type équipe invalide' });
  }
  if (name == null && type == null && mascotId == null && color == null) {
    return res.status(400).json({ error: 'Aucune modification fournie' });
  }

  await execute(
    `UPDATE gl_teams
        SET name = COALESCE(?, name),
            type = COALESCE(?, type),
            mascot_id = ?,
            color = COALESCE(?, color),
            updated_at = NOW()
      WHERE id = ? AND game_id = ?`,
    [name, type, mascotId, color, teamId, gameId]
  );
  const updated = await queryOne('SELECT * FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1', [teamId, gameId]);
  return res.json(updated);
});

router.delete('/games/:id/teams/:teamId', requireGlPermission('gl.team.manage'), async (req, res) => {
  const gameId = parseId(req.params.id);
  const teamId = parseId(req.params.teamId);
  if (!gameId || !teamId) return res.status(400).json({ error: 'Identifiants invalides' });
  const existing = await queryOne('SELECT id FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1', [teamId, gameId]);
  if (!existing) return res.status(404).json({ error: 'Équipe introuvable' });
  const members = await queryOne(
    'SELECT COUNT(*) AS c FROM gl_team_members WHERE game_id = ? AND team_id = ?',
    [gameId, teamId]
  );
  if (Number(members?.c || 0) > 0) {
    return res.status(409).json({ error: 'Suppression refusée : équipe avec joueurs assignés' });
  }
  await execute('DELETE FROM gl_teams WHERE id = ? AND game_id = ?', [teamId, gameId]);
  return res.json({ ok: true });
});

router.post('/games/:id/join-team', requireGlAuth, async (req, res) => {
  if (req.glAuth.userType !== 'gl_player') return res.status(403).json({ error: 'Réservé aux joueurs' });
  const gameId = parseId(req.params.id);
  const teamId = parseId(req.body?.teamId);
  if (!gameId || !teamId) return res.status(400).json({ error: 'gameId/teamId invalides' });
  try {
    await withTransaction(async (tx) => {
      await assignPlayerToTeamTx(tx, { gameId, teamId, playerId: req.glAuth.userId });
    });
  } catch (err) {
    const mapped = resolveRosterError(err);
    if (mapped) return res.status(mapped.status).json({ error: mapped.error });
    throw err;
  }
  return res.json({ ok: true });
});

router.get('/games/:id/roster', requireGlPermission('gl.players.manage'), async (req, res) => {
  const gameId = parseId(req.params.id);
  if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
  const game = await queryOne(
    'SELECT id, class_id FROM gl_games WHERE id = ? LIMIT 1',
    [gameId]
  );
  if (!game) return res.status(404).json({ error: 'Partie introuvable' });

  const rows = await queryAll(
    `SELECT p.id, p.first_name, p.last_name, p.pseudo, p.is_active,
            tm.team_id, t.name AS team_name
       FROM gl_players p
  LEFT JOIN gl_team_members tm ON tm.game_id = ? AND tm.player_id = p.id
  LEFT JOIN gl_teams t ON t.id = tm.team_id
      WHERE p.class_id = ?
      ORDER BY p.last_name ASC, p.first_name ASC, p.id ASC`,
    [gameId, game.class_id]
  );
  return res.json(rows.map((row) => ({
    id: Number(row.id),
    firstName: row.first_name || '',
    lastName: row.last_name || '',
    pseudo: row.pseudo || '',
    isActive: !!Number(row.is_active),
    teamId: row.team_id != null ? Number(row.team_id) : null,
    teamName: row.team_name || null,
  })));
});

router.post('/games/:id/roster/assign', requireGlPermission('gl.players.manage'), async (req, res) => {
  const gameId = parseId(req.params.id);
  const playerId = parseId(req.body?.playerId);
  const teamId = parseId(req.body?.teamId);
  if (!gameId || !playerId || !teamId) return res.status(400).json({ error: 'Identifiants invalides' });
  try {
    await withTransaction(async (tx) => {
      await assignPlayerToTeamTx(tx, { gameId, teamId, playerId });
    });
  } catch (err) {
    const mapped = resolveRosterError(err);
    if (mapped) return res.status(mapped.status).json({ error: mapped.error });
    throw err;
  }
  return res.json({ ok: true });
});

router.post('/games/:id/roster/unassign', requireGlPermission('gl.players.manage'), async (req, res) => {
  const gameId = parseId(req.params.id);
  const playerId = parseId(req.body?.playerId);
  if (!gameId || !playerId) return res.status(400).json({ error: 'Identifiants invalides' });
  await withTransaction(async (tx) => {
    await unassignPlayerFromGameTx(tx, { gameId, playerId });
  });
  return res.json({ ok: true });
});

router.post('/games/:id/events', requireGlPermission('gl.event.emit'), async (req, res) => {
  const gameId = parseId(req.params.id);
  const teamId = req.body?.teamId != null ? parseId(req.body.teamId) : null;
  const eventType = normalizeOptionalString(req.body?.eventType);
  const payload = req.body?.payload ?? {};
  const moveXp = parsePct(payload?.xp);
  const moveYp = parsePct(payload?.yp);
  const moveMarkerId = payload?.markerId != null ? parseId(payload.markerId) : null;
  const hasMovePctPayload = payload?.xp != null || payload?.yp != null;
  if (!gameId || !eventType) return res.status(400).json({ error: 'gameId et eventType requis' });
  if (eventType === 'move' && teamId == null) {
    return res.status(400).json({ error: 'teamId requis pour un déplacement' });
  }
  if (eventType === 'move' && hasMovePctPayload && (moveXp == null || moveYp == null)) {
    return res.status(400).json({ error: 'xp/yp invalides (attendus entre 0 et 100)' });
  }
  if (eventType === 'move' && moveMarkerId == null && !hasMovePctPayload) {
    return res.status(400).json({ error: 'payload move invalide (markerId ou xp/yp requis)' });
  }
  const settings = await getGameplaySettings();
  if (eventType === 'narration' && !settings.narrationEnabled) {
    return res.status(409).json({ error: 'Narration desactivée dans les réglages' });
  }
  if (eventType === 'score' && !settings.scoringEnabled) {
    return res.status(409).json({ error: 'Score desactivé dans les réglages' });
  }
  const actorType = req.glAuth.userType === 'gl_admin' ? 'mj' : 'team';
  const actorId = String(req.glAuth.userId);
  await withTransaction(async (tx) => {
    await tx.execute(
      `INSERT INTO gl_game_events (game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [gameId, teamId, actorType, actorId, eventType, JSON.stringify(payload)]
    );
    if (eventType === 'move' && teamId != null) {
      if (moveMarkerId != null) {
        const marker = await tx.queryOne(
          'SELECT id, x_pct, y_pct FROM gl_chapter_markers WHERE id = ? LIMIT 1',
          [moveMarkerId]
        );
        if (!marker) {
          const err = new Error('MARKER_NOT_FOUND');
          err.status = 404;
          throw err;
        }
        await tx.execute(
          `UPDATE gl_teams
              SET position_marker_id = ?,
                  position_x_pct = ?,
                  position_y_pct = ?,
                  updated_at = NOW()
            WHERE id = ? AND game_id = ?`,
          [moveMarkerId, Number(marker.x_pct), Number(marker.y_pct), teamId, gameId]
        );
      } else {
        await tx.execute(
          `UPDATE gl_teams
              SET position_marker_id = NULL,
                  position_x_pct = ?,
                  position_y_pct = ?,
                  updated_at = NOW()
            WHERE id = ? AND game_id = ?`,
          [moveXp, moveYp, teamId, gameId]
        );
      }
    }
    if (eventType === 'score' && teamId != null) {
      const delta = Number(payload?.delta);
      if (Number.isFinite(delta) && delta !== 0) {
        const reason = normalizeOptionalString(payload?.reason);
        await tx.execute(
          `INSERT INTO gl_team_scores (game_id, team_id, score, last_reason, updated_at)
           VALUES (?, ?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE
             score = score + VALUES(score),
             last_reason = VALUES(last_reason),
             updated_at = NOW()`,
          [gameId, teamId, delta, reason]
        );
      }
    }
  }).catch((err) => {
    if (err?.status === 404 && err?.message === 'MARKER_NOT_FOUND') {
      res.status(404).json({ error: 'Repère introuvable' });
      return null;
    }
    throw err;
  });
  if (res.headersSent) return;
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

/**
 * Avancement du tour. Cyclique sur les equipes triees par id ASC.
 * Refus si `gameplay.turns_enabled = false`.
 */
router.post('/games/:id/turn/next', requireGlPermission('gl.game.manage'), async (req, res) => {
  const gameId = parseId(req.params.id);
  if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
  const settings = await getGameplaySettings();
  if (!settings.turnsEnabled) {
    return res.status(409).json({ error: 'Tours desactivés dans les réglages' });
  }
  const teams = await queryAll(
    'SELECT id FROM gl_teams WHERE game_id = ? ORDER BY id ASC',
    [gameId]
  );
  if (teams.length === 0) {
    return res.status(400).json({ error: 'Aucune équipe sur cette partie' });
  }
  const game = await queryOne('SELECT current_team_id FROM gl_games WHERE id = ? LIMIT 1', [gameId]);
  if (!game) return res.status(404).json({ error: 'Partie introuvable' });
  const currentId = game.current_team_id != null ? Number(game.current_team_id) : null;
  const idx = teams.findIndex((t) => Number(t.id) === currentId);
  const nextTeamId = teams[(idx + 1) % teams.length].id;
  await withTransaction(async (tx) => {
    await tx.execute('UPDATE gl_games SET current_team_id = ?, updated_at = NOW() WHERE id = ?', [nextTeamId, gameId]);
    await tx.execute(
      `INSERT INTO gl_game_events (game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at)
       VALUES (?, ?, 'mj', ?, 'turn_change', ?, NOW())`,
      [gameId, nextTeamId, String(req.glAuth.userId), JSON.stringify({ teamId: Number(nextTeamId) })]
    );
  });
  const evt = await queryOne(
    `SELECT id, game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at
       FROM gl_game_events
      WHERE game_id = ?
      ORDER BY id DESC LIMIT 1`,
    [gameId]
  );
  const normalized = normalizeEventRow(evt);
  emitGlGameEvent(gameId, normalized);
  return res.json({ ok: true, currentTeamId: Number(nextTeamId), event: normalized });
});

/**
 * Demande d'action emise par un joueur. Le MJ resout via /actions/:actionId/resolve.
 * Refus si `gameplay.player_actions_enabled = false` ou si le joueur n'est pas dans
 * l'equipe active (lorsque les tours sont actives).
 */
router.post('/games/:id/actions', requireGlPermission('gl.action.request'), async (req, res) => {
  if (req.glAuth.userType !== 'gl_player') return res.status(403).json({ error: 'Réservé aux joueurs' });
  const gameId = parseId(req.params.id);
  if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
  const settings = await getGameplaySettings();
  if (!settings.playerActionsEnabled) {
    return res.status(409).json({ error: 'Actions joueurs desactivées dans les réglages' });
  }
  const actionType = normalizeOptionalString(req.body?.actionType);
  if (!actionType) return res.status(400).json({ error: 'actionType requis' });
  const payload = req.body?.payload ?? {};

  const player = await queryOne(
    'SELECT id, team_id FROM gl_players WHERE id = ? LIMIT 1',
    [req.glAuth.userId]
  );
  if (!player || player.team_id == null) {
    return res.status(403).json({ error: 'Aucune équipe associée à ce joueur' });
  }
  const teamMembership = await queryOne(
    'SELECT 1 AS ok FROM gl_team_members WHERE game_id = ? AND player_id = ? LIMIT 1',
    [gameId, player.id]
  );
  if (!teamMembership) {
    return res.status(403).json({ error: 'Joueur non rattaché à cette partie' });
  }
  if (settings.turnsEnabled) {
    const game = await queryOne('SELECT current_team_id FROM gl_games WHERE id = ? LIMIT 1', [gameId]);
    if (game?.current_team_id != null && Number(game.current_team_id) !== Number(player.team_id)) {
      return res.status(409).json({ error: 'Ce n’est pas le tour de votre équipe' });
    }
  }

  let actionRequestId = null;
  await withTransaction(async (tx) => {
    await tx.execute(
      `INSERT INTO gl_action_requests (game_id, team_id, player_id, action_type, payload_json, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', NOW())`,
      [gameId, player.team_id, player.id, actionType, JSON.stringify(payload)]
    );
    const created = await tx.queryOne(
      'SELECT id FROM gl_action_requests WHERE game_id = ? AND player_id = ? ORDER BY id DESC LIMIT 1',
      [gameId, player.id]
    );
    actionRequestId = created?.id ? Number(created.id) : null;
    await tx.execute(
      `INSERT INTO gl_game_events (game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at)
       VALUES (?, ?, 'team', ?, 'action_request', ?, NOW())`,
      [
        gameId,
        player.team_id,
        String(player.id),
        JSON.stringify({ actionRequestId, actionType, playerId: player.id, payload }),
      ]
    );
  });
  const evt = await queryOne(
    `SELECT id, game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at
       FROM gl_game_events
      WHERE game_id = ?
      ORDER BY id DESC LIMIT 1`,
    [gameId]
  );
  const normalized = normalizeEventRow(evt);
  emitGlGameEvent(gameId, normalized);
  return res.status(201).json({ actionRequestId, event: normalized });
});

router.post('/games/:id/actions/:actionId/resolve', requireGlPermission('gl.game.manage'), async (req, res) => {
  const gameId = parseId(req.params.id);
  const actionId = parseId(req.params.actionId);
  if (!gameId || !actionId) return res.status(400).json({ error: 'Identifiants invalides' });
  const decision = String(req.body?.decision || '').toLowerCase();
  if (!['accepted', 'refused'].includes(decision)) {
    return res.status(400).json({ error: 'Décision invalide (accepted|refused)' });
  }
  const scoreDeltaRaw = req.body?.scoreDelta;
  const scoreDelta = scoreDeltaRaw == null ? 0 : Number(scoreDeltaRaw);
  const reason = normalizeOptionalString(req.body?.reason);

  const action = await queryOne(
    'SELECT id, team_id, status FROM gl_action_requests WHERE id = ? AND game_id = ? LIMIT 1',
    [actionId, gameId]
  );
  if (!action) return res.status(404).json({ error: 'Demande introuvable' });
  if (action.status !== 'pending') {
    return res.status(409).json({ error: 'Demande déjà résolue' });
  }

  const settings = await getGameplaySettings();
  let appliedDelta = 0;

  await withTransaction(async (tx) => {
    await tx.execute(
      `UPDATE gl_action_requests
          SET status = ?, resolved_by = ?, resolved_at = NOW()
        WHERE id = ?`,
      [decision, String(req.glAuth.userId), actionId]
    );
    await tx.execute(
      `INSERT INTO gl_game_events (game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at)
       VALUES (?, ?, 'mj', ?, 'action_resolved', ?, NOW())`,
      [
        gameId,
        action.team_id,
        String(req.glAuth.userId),
        JSON.stringify({ actionRequestId: actionId, decision, scoreDelta: 0, reason }),
      ]
    );
    if (decision === 'accepted' && settings.scoringEnabled && Number.isFinite(scoreDelta) && scoreDelta !== 0 && action.team_id != null) {
      appliedDelta = scoreDelta;
      await tx.execute(
        `INSERT INTO gl_team_scores (game_id, team_id, score, last_reason, updated_at)
         VALUES (?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           score = score + VALUES(score),
           last_reason = VALUES(last_reason),
           updated_at = NOW()`,
        [gameId, action.team_id, scoreDelta, reason]
      );
      await tx.execute(
        `INSERT INTO gl_game_events (game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at)
         VALUES (?, ?, 'mj', ?, 'score', ?, NOW())`,
        [
          gameId,
          action.team_id,
          String(req.glAuth.userId),
          JSON.stringify({ delta: scoreDelta, reason: reason || 'Action validée' }),
        ]
      );
    }
  });

  const evtRows = await queryAll(
    `SELECT id, game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at
       FROM gl_game_events
      WHERE game_id = ?
      ORDER BY id DESC LIMIT 2`,
    [gameId]
  );
  for (const row of evtRows.reverse()) {
    emitGlGameEvent(gameId, normalizeEventRow(row));
  }
  return res.json({ ok: true, decision, scoreDelta: appliedDelta });
});

/** POST /api/gl/games/:id/qcm/answer — validation QCM en partie (+ score si activé). */
router.post('/games/:id/qcm/answer', requireGlPermission('gl.action.request'), async (req, res) => {
  if (req.glAuth.userType !== 'gl_player') {
    return res.status(403).json({ error: 'Réservé aux joueurs' });
  }
  const gameId = parseId(req.params.id);
  if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });

  const questionCode = String(req.body?.questionCode || '').trim().toUpperCase();
  if (!questionCode) return res.status(400).json({ error: 'questionCode requis' });

  const settings = await getGameplaySettings();
  const player = await queryOne(
    'SELECT id, team_id FROM gl_players WHERE id = ? LIMIT 1',
    [req.glAuth.userId]
  );
  if (!player?.team_id) return res.status(403).json({ error: 'Aucune équipe associée à ce joueur' });

  const membership = await queryOne(
    'SELECT 1 AS ok FROM gl_team_members WHERE game_id = ? AND player_id = ? LIMIT 1',
    [gameId, player.id]
  );
  if (!membership) return res.status(403).json({ error: 'Joueur non rattaché à cette partie' });

  if (settings.turnsEnabled) {
    const gameTurn = await queryOne('SELECT current_team_id FROM gl_games WHERE id = ? LIMIT 1', [gameId]);
    if (gameTurn?.current_team_id != null && Number(gameTurn.current_team_id) !== Number(player.team_id)) {
      return res.status(409).json({ error: 'Ce n’est pas le tour de votre équipe' });
    }
  }

  const questionRow = await queryOne(
    `SELECT question_code, tags, mots_cles FROM gl_qcm_questions
      WHERE question_code = ? AND statut = 'actif' LIMIT 1`,
    [questionCode]
  );
  if (!questionRow) return res.status(404).json({ error: 'Question introuvable' });

  let verification;
  try {
    verification = verifyPresentationAnswer(
      req.body?.presentationToken,
      questionCode,
      req.body?.choiceId
    );
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Réponse invalide' });
  }

  let scoreDelta = 0;
  const markerIdRaw = req.body?.markerId;
  const markerId = markerIdRaw == null ? null : Number(markerIdRaw);

  await withTransaction(async (tx) => {
    await tx.execute(
      `INSERT INTO gl_game_events (game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at)
       VALUES (?, ?, 'team', ?, 'qcm_answer', ?, NOW())`,
      [
        gameId,
        player.team_id,
        String(player.id),
        JSON.stringify({
          questionCode,
          correct: verification.correct,
          choiceId: verification.selectedChoiceId,
          markerId: Number.isFinite(markerId) ? markerId : null,
        }),
      ]
    );
    if (verification.correct && settings.scoringEnabled) {
      scoreDelta = 1;
      await tx.execute(
        `INSERT INTO gl_team_scores (game_id, team_id, score, last_reason, updated_at)
         VALUES (?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           score = score + VALUES(score),
           last_reason = VALUES(last_reason),
           updated_at = NOW()`,
        [gameId, player.team_id, scoreDelta, 'Bonne réponse QCM']
      );
      await tx.execute(
        `INSERT INTO gl_game_events (game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at)
         VALUES (?, ?, 'team', ?, 'score', ?, NOW())`,
        [
          gameId,
          player.team_id,
          String(player.id),
          JSON.stringify({ delta: scoreDelta, reason: 'Bonne réponse QCM', questionCode }),
        ]
      );
    }
  });

  const glossaryRows = await queryAll(
    `SELECT glossary_code, terme, variantes, categorie, definition_courte
       FROM gl_glossary_terms WHERE statut = 'actif'`
  );
  const glossaryTerms = verification.correct
    ? matchGlossaryTermsForSpecies(combineKeywords(questionRow), buildGlossaryLookupMap(glossaryRows))
    : [];

  const evt = await queryOne(
    `SELECT id, game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at
       FROM gl_game_events WHERE game_id = ? ORDER BY id DESC LIMIT 1`,
    [gameId]
  );
  if (evt) emitGlGameEvent(gameId, normalizeEventRow(evt));

  return res.json({
    correct: verification.correct,
    feedback: verification.correct ? 'Bonne réponse !' : 'Ce n’est pas la bonne réponse.',
    scoreDelta,
    glossaryTerms: verification.correct ? glossaryTerms : undefined,
  });
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

router.delete('/games/:id', requireGlPermission('gl.game.manage'), async (req, res) => {
  const gameId = parseId(req.params.id);
  if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
  const existing = await queryOne('SELECT id, status FROM gl_games WHERE id = ? LIMIT 1', [gameId]);
  if (!existing) return res.status(404).json({ error: 'Partie introuvable' });
  if (!['draft', 'ended'].includes(String(existing.status || '').toLowerCase())) {
    return res.status(409).json({ error: 'Suppression autorisée uniquement pour une partie brouillon ou terminée' });
  }
  await execute('DELETE FROM gl_games WHERE id = ?', [gameId]);
  return res.json({ ok: true });
});

router.post('/games/:id/start', requireGlPermission('gl.game.manage'), (req, res) => updateGameStatus(req, res, 'live'));
router.post('/games/:id/pause', requireGlPermission('gl.game.manage'), (req, res) => updateGameStatus(req, res, 'paused'));
router.post('/games/:id/end', requireGlPermission('gl.game.manage'), (req, res) => updateGameStatus(req, res, 'ended'));

module.exports = router;
