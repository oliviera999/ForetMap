const express = require('express');
const { queryAll, queryOne, execute, withTransaction } = require('../../database');
const { requireGlAuth, requireGlPermission, hasGlPermission } = require('../../middleware/requireGlAuth');
const { normalizeEventRow, replayGameEvents } = require('../../lib/glGameEvents');
const { emitGlGameEvent, emitGlSpellCastDraftChanged } = require('../../lib/realtime');
const {
  getSpellCastConfig,
  assertSpellCastAvailable,
  assertSpellCastActorAllowed,
  resolveSpellCastError,
  createOrGetDraft,
  getDraftById,
  updateDraftContributions,
  launchDraft,
  cancelDraft,
} = require('../../lib/glSpellCast');
const { normalizeSpellCode } = require('../../lib/glChapterSpells');
const { getGameplaySettings } = require('../../lib/glSettings');
const {
  parseVitalityDelta,
  applyPlayerVitalityDelta,
  applyTeamVitalityDelta,
  loadVitalityForGame,
  resolveVitalityError,
} = require('../../lib/glVitality');
const { logRouteError } = require('../../lib/routeLog');
const { assignPlayerToTeamTx, unassignPlayerFromGameTx } = require('../../lib/glRoster');
const { canAccessGlGame } = require('../../lib/glGameAccess');
const { parseNarrationImageUrl } = require('../../lib/glJournalPresent');
const { verifyPresentationAnswer } = require('../../lib/glQcmChoices');
const { combineKeywords } = require('../../lib/glQcmImport');
const { buildGlossaryLookupMap, matchGlossaryTermsForSpecies } = require('../../lib/glGlossaryMatch');
const { loadBiomesForChapterIds } = require('../../lib/glChapterBiomes');
const { loadSpellsForChapterIds } = require('../../lib/glChapterSpells');
const { MARKER_SELECT, formatMarkerRow, isQuestionMarker } = require('../../lib/glMarkerRow');
const { drawQuestionFromMarker } = require('../../lib/glMarkerQuestionPool');
const { canPresentMarkerQuestion } = require('../../lib/glMarkerQuestionRetrigger');
const { loadPresentableQuestion, buildPresentation } = require('../../lib/glQcmQuestionQuery');

async function loadGlossaryLookup() {
  const rows = await queryAll(
    `SELECT glossary_code, terme, variantes, categorie, definition_courte
       FROM gl_glossary_terms WHERE statut = 'actif'`
  );
  return buildGlossaryLookupMap(rows);
}

async function enrichQuestionWithGlossary(questionRow, glossaryByKey) {
  if (!questionRow) return [];
  return matchGlossaryTermsForSpecies(combineKeywords(questionRow), glossaryByKey);
}

const router = express.Router();

function parseId(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function requireSpellCastPermission(req, res, next) {
  requireGlAuth(req, res, () => {
    if (
      hasGlPermission(req.glAuth, 'gl.action.request')
      || hasGlPermission(req.glAuth, 'gl.event.emit')
    ) {
      return next();
    }
    return res.status(403).json({ error: 'Permission insuffisante' });
  });
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

async function getPlayerGameMembership(gameId, playerId) {
  return queryOne(
    `SELECT team_id
       FROM gl_team_members
      WHERE game_id = ?
        AND player_id = ?
      LIMIT 1`,
    [gameId, playerId]
  );
}

const QCM_ANSWER_STAFF_PERMISSIONS = ['gl.event.emit', 'gl.game.manage', 'gl.mascot.position'];

function staffCanAnswerQcmForTeam(auth) {
  if (!auth || auth.userType === 'gl_player') return false;
  return QCM_ANSWER_STAFF_PERMISSIONS.some((key) => hasGlPermission(auth, key));
}

/** Contexte équipe / acteur pour POST /games/:id/qcm/answer (joueur ou MJ sur une équipe). */
async function resolveQcmAnswerContext(req, gameId) {
  const allowed = await canAccessGlGame(req.glAuth, gameId);
  if (!allowed) {
    return { ok: false, status: 403, error: 'Accès partie refusé' };
  }

  if (req.glAuth.userType === 'gl_player') {
    if (!hasGlPermission(req.glAuth, 'gl.action.request')) {
      return { ok: false, status: 403, error: 'Permission insuffisante' };
    }
    const player = await queryOne('SELECT id FROM gl_players WHERE id = ? LIMIT 1', [req.glAuth.userId]);
    if (!player) {
      return { ok: false, status: 403, error: 'Aucune équipe associée à ce joueur' };
    }
    const membership = await getPlayerGameMembership(gameId, player.id);
    if (!membership?.team_id) {
      return { ok: false, status: 403, error: 'Joueur non rattaché à cette partie' };
    }
    return {
      ok: true,
      teamId: Number(membership.team_id),
      actorType: 'team',
      actorId: String(player.id),
    };
  }

  if (!staffCanAnswerQcmForTeam(req.glAuth)) {
    return { ok: false, status: 403, error: 'Permission insuffisante' };
  }

  const teamId = req.body?.teamId != null ? parseId(req.body.teamId) : null;
  if (teamId == null) {
    return { ok: false, status: 400, error: 'teamId requis pour valider une réponse (mode MJ)' };
  }
  const team = await queryOne('SELECT id FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1', [teamId, gameId]);
  if (!team) {
    return { ok: false, status: 404, error: 'Équipe introuvable dans cette partie' };
  }
  return {
    ok: true,
    teamId,
    actorType: 'mj',
    actorId: String(req.glAuth.userId),
  };
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
            ch.slug AS chapter_slug, ch.title AS chapter_title, ch.biome, ch.map_image_url,
            ch.story_markdown, ch.biotope_markdown, ch.biocenose_markdown, ch.sortileges_markdown
       FROM gl_games g
  LEFT JOIN gl_classes c ON c.id = g.class_id
  LEFT JOIN gl_chapters ch ON ch.id = g.chapter_id
      WHERE g.id = ?
      LIMIT 1`,
    [gameId]
  );
  if (!game) return null;

  if (game.chapter_id != null) {
    const chapterId = Number(game.chapter_id);
    const biomesMap = await loadBiomesForChapterIds({ queryAll }, [chapterId]);
    game.chapter_biomes = biomesMap.get(chapterId) || [];
    const spellsMap = await loadSpellsForChapterIds({ queryAll }, [chapterId]);
    game.chapter_spells = spellsMap.get(chapterId) || [];
  } else {
    game.chapter_biomes = [];
    game.chapter_spells = [];
  }

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
  const markerRows = await queryAll(
    `SELECT ${MARKER_SELECT}
       FROM gl_chapter_markers
      WHERE chapter_id = ?
      ORDER BY order_index ASC, id ASC`,
    [game.chapter_id]
  );
  const markers = markerRows.map(formatMarkerRow);
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
  const settings = await getGameplaySettings();
  const vitality = await loadVitalityForGame(queryAll, queryOne, gameId, settings.vitalityEnabled);
  return {
    game,
    teams,
    markers,
    events,
    scores,
    pendingActions,
    replay,
    vitality,
  };
}

async function ensurePlayerInGameClass(playerId, gameId) {
  const row = await queryOne(
    `SELECT p.id
       FROM gl_players p
 INNER JOIN gl_games g ON g.class_id = p.class_id
      WHERE p.id = ? AND g.id = ?
      LIMIT 1`,
    [playerId, gameId]
  );
  if (!row) {
    const err = new Error('PLAYER_CLASS_MISMATCH');
    err.status = 409;
    throw err;
  }
}

async function recordVitalityChangeEvent(tx, {
  gameId,
  teamId,
  actorId,
  healthDelta,
  powerDelta,
  reason,
  results,
}) {
  const payload = {
    healthDelta: parseVitalityDelta(healthDelta),
    powerDelta: parseVitalityDelta(powerDelta),
    reason: normalizeOptionalString(reason),
    results,
  };
  await tx.execute(
    `INSERT INTO gl_game_events (game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at)
     VALUES (?, ?, 'mj', ?, 'vitality_change', ?, NOW())`,
    [gameId, teamId, actorId, JSON.stringify(payload)]
  );
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
  const spellCast = await getSpellCastConfig();
  return res.json({
    settings: {
      ...settings,
      spellCastEnabled: spellCast.enabled,
      spellCastContributionMode: spellCast.contributionMode,
      spellCastTeamScope: spellCast.teamScope,
      spellCastMjOnly: spellCast.mjOnly,
    },
  });
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

router.put('/games/:id', requireGlPermission('gl.game.manage'), async (req, res) => {
  const gameId = parseId(req.params.id);
  if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });

  const existing = await queryOne(
    'SELECT id, class_id, chapter_id, name, status FROM gl_games WHERE id = ? LIMIT 1',
    [gameId]
  );
  if (!existing) return res.status(404).json({ error: 'Partie introuvable' });

  const status = String(existing.status || '').toLowerCase();
  const hasName = req.body?.name != null;
  const hasChapterId = req.body?.chapterId != null;
  const hasClassId = req.body?.classId != null;
  if (!hasName && !hasChapterId && !hasClassId) {
    return res.status(400).json({ error: 'Aucune modification fournie' });
  }

  const nextName = hasName ? normalizeOptionalString(req.body.name) : null;
  if (hasName && !nextName) return res.status(400).json({ error: 'Nom de partie invalide' });

  let nextChapterId = null;
  if (hasChapterId) {
    nextChapterId = parseId(req.body.chapterId);
    if (!nextChapterId) return res.status(400).json({ error: 'chapterId invalide' });
    if (!['draft', 'paused'].includes(status)) {
      return res.status(409).json({ error: 'Chapitre modifiable uniquement en brouillon ou pause' });
    }
    const chapterRow = await queryOne('SELECT id FROM gl_chapters WHERE id = ? LIMIT 1', [nextChapterId]);
    if (!chapterRow) return res.status(404).json({ error: 'Chapitre introuvable' });
  }

  let nextClassId = null;
  if (hasClassId) {
    nextClassId = parseId(req.body.classId);
    if (!nextClassId) return res.status(400).json({ error: 'classId invalide' });
    if (status !== 'draft') {
      return res.status(409).json({ error: 'Classe modifiable uniquement en brouillon' });
    }
    if (Number(nextClassId) !== Number(existing.class_id)) {
      const memberCount = await queryOne(
        'SELECT COUNT(*) AS cnt FROM gl_team_members WHERE game_id = ?',
        [gameId]
      );
      if (Number(memberCount?.cnt || 0) > 0) {
        return res.status(409).json({ error: 'Classe non modifiable : des joueurs sont déjà assignés à cette partie' });
      }
    }
    const classRow = await queryOne(
      'SELECT id FROM gl_classes WHERE id = ? AND is_active = 1 LIMIT 1',
      [nextClassId]
    );
    if (!classRow) return res.status(404).json({ error: 'Classe introuvable' });
  }

  try {
    await execute(
      `UPDATE gl_games
          SET name = COALESCE(?, name),
              chapter_id = COALESCE(?, chapter_id),
              class_id = COALESCE(?, class_id),
              updated_at = NOW()
        WHERE id = ?`,
      [nextName, nextChapterId, nextClassId, gameId]
    );
  } catch (err) {
    if (err && err.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(409).json({ error: 'Classe ou chapitre supprimé entre-temps' });
    }
    logRouteError(err, req, 'PUT /api/gl/games/:id : UPDATE en échec');
    return res.status(500).json({ error: 'Erreur lors de la mise à jour de la partie' });
  }

  const state = await readGameState(gameId);
  if (!state) return res.status(404).json({ error: 'Partie introuvable' });
  return res.json(state);
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
  const teamExists = await queryOne(
    'SELECT id FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1',
    [teamId, gameId]
  );
  if (!teamExists) {
    return res.status(404).json({ error: 'Équipe introuvable' });
  }
  const team = await queryOne(
    `SELECT t.id, t.game_id
       FROM gl_teams t
 INNER JOIN gl_games g ON g.id = t.game_id
 INNER JOIN gl_players p ON p.id = ?
      WHERE t.id = ?
        AND t.game_id = ?
        AND p.class_id = g.class_id
      LIMIT 1`,
    [req.glAuth.userId, teamId, gameId]
  );
  if (!team) {
    return res.status(403).json({ error: 'Joueur non autorisé pour cette équipe' });
  }
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

  const settings = await getGameplaySettings();
  const vitalitySelect = settings.vitalityEnabled
    ? ', p.health_points, p.power_points'
    : '';
  const rows = await queryAll(
    `SELECT p.id, p.first_name, p.last_name, p.pseudo, p.is_active,
            tm.team_id, t.name AS team_name${vitalitySelect}
       FROM gl_players p
  LEFT JOIN gl_team_members tm ON tm.game_id = ? AND tm.player_id = p.id
  LEFT JOIN gl_teams t ON t.id = tm.team_id
      WHERE p.class_id = ?
      ORDER BY p.last_name ASC, p.first_name ASC, p.id ASC`,
    [gameId, game.class_id]
  );
  return res.json(rows.map((row) => {
    const out = {
      id: Number(row.id),
      firstName: row.first_name || '',
      lastName: row.last_name || '',
      pseudo: row.pseudo || '',
      isActive: !!Number(row.is_active),
      teamId: row.team_id != null ? Number(row.team_id) : null,
      teamName: row.team_name || null,
    };
    if (settings.vitalityEnabled) {
      out.healthPoints = Number(row.health_points) || 0;
      out.powerPoints = Number(row.power_points) || 0;
    }
    return out;
  }));
});

router.post('/games/:id/vitality/player', requireGlPermission('gl.event.emit'), async (req, res) => {
  const gameId = parseId(req.params.id);
  const playerId = parseId(req.body?.playerId);
  const healthDelta = req.body?.healthDelta;
  const powerDelta = req.body?.powerDelta;
  const reason = req.body?.reason;
  if (!gameId || !playerId) {
    return res.status(400).json({ error: 'gameId et playerId requis' });
  }
  if (parseVitalityDelta(healthDelta) === 0 && parseVitalityDelta(powerDelta) === 0) {
    return res.status(400).json({ error: 'Au moins un delta (healthDelta ou powerDelta) non nul requis' });
  }
  const settings = await getGameplaySettings();
  if (!settings.vitalityEnabled) {
    return res.status(409).json({ error: 'Points de vie et de pouvoir désactivés dans les réglages' });
  }
  const game = await queryOne('SELECT id FROM gl_games WHERE id = ? LIMIT 1', [gameId]);
  if (!game) return res.status(404).json({ error: 'Partie introuvable' });
  try {
    await ensurePlayerInGameClass(playerId, gameId);
    let result;
    await withTransaction(async (tx) => {
      result = await applyPlayerVitalityDelta(tx, { playerId, healthDelta, powerDelta });
      await recordVitalityChangeEvent(tx, {
        gameId,
        teamId: null,
        actorId: String(req.glAuth.userId),
        healthDelta,
        powerDelta,
        reason,
        results: [result],
      });
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
    return res.status(200).json({ ok: true, result });
  } catch (err) {
    const mapped = resolveVitalityError(err);
    if (mapped) return res.status(mapped.status).json({ error: mapped.error });
    throw err;
  }
});

router.post('/games/:id/vitality/team', requireGlPermission('gl.event.emit'), async (req, res) => {
  const gameId = parseId(req.params.id);
  const teamId = parseId(req.body?.teamId);
  const healthDelta = req.body?.healthDelta;
  const powerDelta = req.body?.powerDelta;
  const reason = req.body?.reason;
  if (!gameId || !teamId) {
    return res.status(400).json({ error: 'gameId et teamId requis' });
  }
  if (parseVitalityDelta(healthDelta) === 0 && parseVitalityDelta(powerDelta) === 0) {
    return res.status(400).json({ error: 'Au moins un delta (healthDelta ou powerDelta) non nul requis' });
  }
  const settings = await getGameplaySettings();
  if (!settings.vitalityEnabled) {
    return res.status(409).json({ error: 'Points de vie et de pouvoir désactivés dans les réglages' });
  }
  const team = await queryOne('SELECT id FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1', [teamId, gameId]);
  if (!team) return res.status(404).json({ error: 'Équipe introuvable' });
  try {
    let results;
    await withTransaction(async (tx) => {
      results = await applyTeamVitalityDelta(tx, { gameId, teamId, healthDelta, powerDelta });
      await recordVitalityChangeEvent(tx, {
        gameId,
        teamId,
        actorId: String(req.glAuth.userId),
        healthDelta,
        powerDelta,
        reason,
        results,
      });
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
    return res.status(200).json({ ok: true, results });
  } catch (err) {
    const mapped = resolveVitalityError(err);
    if (mapped) return res.status(mapped.status).json({ error: mapped.error });
    throw err;
  }
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
  let payloadToStore = payload;
  if (eventType === 'narration') {
    const text = normalizeOptionalString(payload?.text);
    if (!text) return res.status(400).json({ error: 'Texte de narration requis' });
    try {
      const imageUrl = parseNarrationImageUrl(payload?.imageUrl);
      payloadToStore = imageUrl ? { text, imageUrl } : { text };
    } catch (err) {
      if (err?.status === 400) return res.status(400).json({ error: err.message || 'URL image invalide' });
      throw err;
    }
  }
  const actorType = req.glAuth.userType === 'gl_admin' ? 'mj' : 'team';
  const actorId = String(req.glAuth.userId);
  await withTransaction(async (tx) => {
    await tx.execute(
      `INSERT INTO gl_game_events (game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [gameId, teamId, actorType, actorId, eventType, JSON.stringify(payloadToStore)]
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

  const player = await queryOne('SELECT id FROM gl_players WHERE id = ? LIMIT 1', [req.glAuth.userId]);
  if (!player) {
    return res.status(403).json({ error: 'Aucune équipe associée à ce joueur' });
  }
  const teamMembership = await getPlayerGameMembership(gameId, player.id);
  if (!teamMembership) {
    return res.status(403).json({ error: 'Joueur non rattaché à cette partie' });
  }
  const teamIdForGame = teamMembership.team_id;
  if (settings.turnsEnabled) {
    const game = await queryOne('SELECT current_team_id FROM gl_games WHERE id = ? LIMIT 1', [gameId]);
    if (game?.current_team_id != null && Number(game.current_team_id) !== Number(teamIdForGame)) {
      return res.status(409).json({ error: 'Ce n’est pas le tour de votre équipe' });
    }
  }

  let actionRequestId = null;
  await withTransaction(async (tx) => {
    await tx.execute(
      `INSERT INTO gl_action_requests (game_id, team_id, player_id, action_type, payload_json, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', NOW())`,
      [gameId, teamIdForGame, player.id, actionType, JSON.stringify(payload)]
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
        teamIdForGame,
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
router.post('/games/:id/qcm/answer', requireGlAuth, async (req, res) => {
  const gameId = parseId(req.params.id);
  if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });

  const answerCtx = await resolveQcmAnswerContext(req, gameId);
  if (!answerCtx.ok) {
    return res.status(answerCtx.status).json({ error: answerCtx.error });
  }
  const teamIdForGame = answerCtx.teamId;

  const questionCode = String(req.body?.questionCode || '').trim().toUpperCase();
  if (!questionCode) return res.status(400).json({ error: 'questionCode requis' });

  const settings = await getGameplaySettings();

  if (settings.turnsEnabled) {
    const gameTurn = await queryOne('SELECT current_team_id FROM gl_games WHERE id = ? LIMIT 1', [gameId]);
    if (gameTurn?.current_team_id != null && Number(gameTurn.current_team_id) !== Number(teamIdForGame)) {
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
       VALUES (?, ?, ?, ?, 'qcm_answer', ?, NOW())`,
      [
        gameId,
        teamIdForGame,
        answerCtx.actorType,
        answerCtx.actorId,
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
        [gameId, teamIdForGame, scoreDelta, 'Bonne réponse QCM']
      );
      await tx.execute(
        `INSERT INTO gl_game_events (game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at)
         VALUES (?, ?, ?, ?, 'score', ?, NOW())`,
        [
          gameId,
          teamIdForGame,
          answerCtx.actorType,
          answerCtx.actorId,
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

/** POST /api/gl/games/:id/markers/:markerId/present-question — tirage + présentation QCM depuis un repère. */
router.post('/games/:id/markers/:markerId/present-question', requireGlAuth, async (req, res) => {
  const gameId = parseId(req.params.id);
  const markerId = parseId(req.params.markerId);
  if (!gameId || !markerId) {
    return res.status(400).json({ error: 'Identifiants invalides' });
  }

  const allowed = await canAccessGlGame(req.glAuth, gameId);
  if (!allowed) return res.status(403).json({ error: 'Accès partie refusé' });

  const game = await queryOne('SELECT id, chapter_id, status FROM gl_games WHERE id = ? LIMIT 1', [gameId]);
  if (!game) return res.status(404).json({ error: 'Partie introuvable' });

  const markerRow = await queryOne(`SELECT ${MARKER_SELECT} FROM gl_chapter_markers WHERE id = ? LIMIT 1`, [markerId]);
  const marker = formatMarkerRow(markerRow);
  if (!marker || !isQuestionMarker(marker)) {
    return res.status(404).json({ error: 'Repère question introuvable' });
  }
  if (Number(marker.chapter_id) !== Number(game.chapter_id)) {
    return res.status(409).json({ error: 'Repère hors chapitre de la partie' });
  }

  let teamId = req.body?.teamId != null ? parseId(req.body.teamId) : null;
  if (req.glAuth.userType === 'gl_player') {
    const membership = await getPlayerGameMembership(gameId, req.glAuth.userId);
    if (!membership?.team_id) return res.status(403).json({ error: 'Joueur non rattaché à une équipe' });
    teamId = Number(membership.team_id);
  } else if (teamId == null) {
    return res.status(400).json({ error: 'teamId requis pour le MJ' });
  }

  const team = await queryOne('SELECT id FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1', [teamId, gameId]);
  if (!team) return res.status(404).json({ error: 'Équipe introuvable dans cette partie' });

  const settings = await getGameplaySettings();
  const canPresent = await canPresentMarkerQuestion(
    { queryAll },
    {
      gameId,
      teamId,
      markerId,
      retriggerMode: settings.markerQuestionRetrigger,
    }
  );
  if (!canPresent) {
    return res.status(409).json({ error: 'Question déjà présentée pour ce repère selon les réglages' });
  }

  const biomesMap = await loadBiomesForChapterIds({ queryAll }, [game.chapter_id]);
  const chapterBiomes = biomesMap.get(Number(game.chapter_id)) || [];
  const chapterBiomeSlugs = chapterBiomes.map((b) => b.slug);

  const excludeRaw = req.body?.excludeCodes;
  const excludeCodes = Array.isArray(excludeRaw)
    ? excludeRaw
    : (typeof excludeRaw === 'string' ? excludeRaw.split(',') : []);

  const draw = await drawQuestionFromMarker(
    { queryAll, queryOne },
    markerRow,
    chapterBiomeSlugs,
    excludeCodes
  );
  if (draw.error || !draw.questionCode) {
    return res.status(404).json({ error: draw.error || 'Aucune question disponible' });
  }

  const questionRow = await loadPresentableQuestion({ queryOne }, draw.questionCode);
  if (!questionRow) {
    return res.status(404).json({ error: draw.error || `Question ${draw.questionCode} non présentable` });
  }

  const glossaryByKey = await loadGlossaryLookup();
  const glossaryTerms = await enrichQuestionWithGlossary(questionRow, glossaryByKey);
  let presentation;
  try {
    presentation = buildPresentation(questionRow, glossaryTerms);
  } catch (err) {
    return res.status(400).json({ error: err.message || 'Présentation impossible' });
  }

  const actorType = req.glAuth.userType === 'gl_admin' ? 'mj' : 'team';
  await execute(
    `INSERT INTO gl_game_events (game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at)
     VALUES (?, ?, ?, ?, 'marker_question_presented', ?, NOW())`,
    [
      gameId,
      teamId,
      actorType,
      String(req.glAuth.userId),
      JSON.stringify({
        markerId,
        questionCode: draw.questionCode,
        markerLabel: marker.label,
      }),
    ]
  );
  const evt = await queryOne(
    `SELECT id, game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at
       FROM gl_game_events WHERE game_id = ? ORDER BY id DESC LIMIT 1`,
    [gameId]
  );
  if (evt) emitGlGameEvent(gameId, normalizeEventRow(evt));

  return res.json({
    questionCode: draw.questionCode,
    presentation,
    markerId,
    teamId,
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

async function handleSpellCastRoute(req, res, handler) {
  try {
    const gameId = parseId(req.params.id);
    if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
    const allowed = await canAccessGlGame(req.glAuth, gameId);
    if (!allowed) return res.status(403).json({ error: 'Accès partie refusé' });
    const config = await getSpellCastConfig();
    await assertSpellCastAvailable(config);
    assertSpellCastActorAllowed(req.glAuth, config);
    return handler({ gameId, config });
  } catch (err) {
    const mapped = resolveSpellCastError(err);
    if (mapped) return res.status(mapped.status).json({ error: mapped.error });
    throw err;
  }
}

router.get('/spell-cast-settings', requireGlAuth, async (_req, res) => {
  const config = await getSpellCastConfig();
  return res.json({
    settings: {
      enabled: config.enabled,
      vitalityRequired: true,
      contributionMode: config.contributionMode,
      teamScope: config.teamScope,
      mjOnly: config.mjOnly,
    },
  });
});

router.post('/games/:id/spell-casts/drafts', requireSpellCastPermission, async (req, res) => {
  return handleSpellCastRoute(req, res, async ({ gameId, config }) => {
    const spellCode = normalizeSpellCode(req.body?.spellCode);
    const teamId = parseId(req.body?.teamId);
    if (!spellCode || !teamId) {
      return res.status(400).json({ error: 'spellCode et teamId requis' });
    }
    const draft = await createOrGetDraft({
      gameId,
      teamId,
      spellCode,
      auth: req.glAuth,
      config,
    });
    emitGlSpellCastDraftChanged(gameId, { draftId: draft.id, type: 'draft_updated', draft });
    return res.status(201).json({ draft });
  });
});

router.get('/games/:id/spell-casts/drafts/:draftId', requireSpellCastPermission, async (req, res) => {
  return handleSpellCastRoute(req, res, async ({ gameId }) => {
    const draftId = parseId(req.params.draftId);
    if (!draftId) return res.status(400).json({ error: 'draftId invalide' });
    const draft = await getDraftById(draftId, gameId);
    return res.json({ draft });
  });
});

router.put('/games/:id/spell-casts/drafts/:draftId/contributions', requireSpellCastPermission, async (req, res) => {
  return handleSpellCastRoute(req, res, async ({ gameId, config }) => {
    const draftId = parseId(req.params.draftId);
    if (!draftId) return res.status(400).json({ error: 'draftId invalide' });
    const contributions = req.body?.contributions;
    const draft = await updateDraftContributions({
      gameId,
      draftId,
      contributions,
      auth: req.glAuth,
      config,
    });
    emitGlSpellCastDraftChanged(gameId, { draftId: draft.id, type: 'draft_updated', draft });
    return res.json({ draft });
  });
});

router.post('/games/:id/spell-casts/drafts/:draftId/launch', requireSpellCastPermission, async (req, res) => {
  return handleSpellCastRoute(req, res, async ({ gameId, config }) => {
    const draftId = parseId(req.params.draftId);
    if (!draftId) return res.status(400).json({ error: 'draftId invalide' });
    const { draft, eventPayload } = await launchDraft({
      gameId,
      draftId,
      auth: req.glAuth,
      config,
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
    emitGlSpellCastDraftChanged(gameId, { draftId: draft.id, type: 'draft_cast', draft });
    return res.json({ ok: true, draft, event: normalized, payload: eventPayload });
  });
});

router.delete('/games/:id/spell-casts/drafts/:draftId', requireSpellCastPermission, async (req, res) => {
  return handleSpellCastRoute(req, res, async ({ gameId }) => {
    const draftId = parseId(req.params.draftId);
    if (!draftId) return res.status(400).json({ error: 'draftId invalide' });
    await cancelDraft({ gameId, draftId, auth: req.glAuth });
    emitGlSpellCastDraftChanged(gameId, { draftId, type: 'draft_cancelled' });
    return res.json({ ok: true });
  });
});

module.exports = router;
