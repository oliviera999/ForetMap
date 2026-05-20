const express = require('express');
const { queryAll, queryOne, execute, withTransaction } = require('../../database');
const { requireGlAuth, requireGlPermission } = require('../../middleware/requireGlAuth');
const { normalizeEventRow, replayGameEvents } = require('../../lib/glGameEvents');
const { emitGlGameEvent } = require('../../lib/realtime');
const { getGameplaySettings } = require('../../lib/glSettings');
const { logRouteError } = require('../../lib/routeLog');

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
    `SELECT g.id, g.class_id, g.chapter_id, g.name, g.status, g.current_team_id,
            g.created_by, g.created_at, g.updated_at,
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
    if (eventType === 'move' && teamId != null && payload?.markerId != null) {
      await tx.execute('UPDATE gl_teams SET position_marker_id = ?, updated_at = NOW() WHERE id = ? AND game_id = ?', [
        Number(payload.markerId),
        teamId,
        gameId,
      ]);
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
