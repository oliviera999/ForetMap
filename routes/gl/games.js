const express = require('express');
const { queryAll, queryOne, execute, withTransaction } = require('../../database');
const { requireGlAuth, requireGlPermission } = require('../../middleware/requireGlAuth');
const { normalizeEventRow } = require('../../lib/glGameEvents');
const { emitGlGameEvent } = require('../../lib/realtime');
const { getSpellCastConfig } = require('../../lib/glSpellCast');
const { getGameplaySettings } = require('../../lib/glSettings');
const { assignPlayerToTeamTx } = require('../../lib/glRoster');
const { canAccessGlGame } = require('../../lib/glGameAccess');

const { parseNarrationImageUrl } = require('../../lib/glJournalPresent');
const {
  canPresentZoneContent,
  resolveZoneContentRetrigger,
  PRESENT_EVENT_TYPE: ZONE_CONTENT_PRESENT_EVENT,
} = require('../../lib/glZoneContentRetrigger');
const {
  listPresentedFeuilletZones,
  presentFeuilletZone,
} = require('../../lib/glFeuilletZonePresent');
const { getFeuilletZoneById } = require('../../lib/glFeuilletZonesCatalog');
const {
  serializeZonePopoverRow,
  zoneHasPopoverContent,
} = require('../../lib/glZoneContent');
const { MARKER_QUESTION_RETRIGGER_VALUES } = require('../../lib/glSettings');
// O10 — helpers runtime à I/O (DB) déplacés en l'état vers lib/gl/gamesRuntime.js
// (déplacement pur byte-identique) ; débloque le découpage futur en sous-routeurs.
const {
  getPlayerGameMembership,
  resolveRosterError,
  readGameState,
} = require('../../lib/gl/gamesRuntime');

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

const { normalizeOptionalString } = require('../../lib/shared/httpHelpers');
const asyncHandler = require('../../lib/asyncHandler');
const { z, validate } = require('../../lib/validate');

// O7 — query friction-free (coercition permissive, jamais de 400 issu du schéma) :
// `classId` (GET /games) et `teamId` (GET /games/:id/feuillet-zones/presented) reproduisent
// l'ancien `parseId` (Number fini → n, sinon null) ; `status` reproduit
// `normalizeOptionalString` (trim, '' → null). Les 400 historiques (« classId invalide »,
// « status invalide », « teamId requis pour le MJ ») restent décidés par les handlers,
// conditions inchangées.
const glGamesListQuerySchema = z.object({
  classId: z.preprocess(
    (v) => (v == null ? null : Number(v)),
    z.number().finite().nullable().catch(null)
  ),
  status: z.preprocess(
    (v) => normalizeOptionalString(v),
    z.string().nullable().catch(null)
  ),
});
const glGamesFeuilletPresentedQuerySchema = z.object({
  teamId: z.preprocess(
    (v) => (v == null ? null : Number(v)),
    z.number().finite().nullable().catch(null)
  ),
});

router.get('/chapters', requireGlPermission('gl.read'), asyncHandler(async (_req, res) => {
  const rows = await queryAll(
    `SELECT id, slug, title, biome, map_image_url, order_index
       FROM gl_chapters
      ORDER BY order_index ASC, id ASC`
  );
  return res.json(rows);
}));

/**
 * Snapshot public des toggles gameplay (joueur + admin) :
 * le frontend en a besoin pour conditionner l'UI (tour, narration, actions, score).
 */
router.get('/gameplay-settings', requireGlAuth, asyncHandler(async (_req, res) => {
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
}));

router.get('/games', requireGlPermission('gl.game.manage'), validate({ query: glGamesListQuerySchema }), asyncHandler(async (req, res) => {
  const classId = req.validatedQuery?.classId;
  const status = req.validatedQuery?.status;
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
}));

router.get('/games/:id', requireGlAuth, asyncHandler(async (req, res) => {
  const gameId = parseId(req.params.id);
  if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
  const state = await readGameState(gameId);
  if (!state) return res.status(404).json({ error: 'Partie introuvable' });
  if (!(await canAccessGlGame(req.glAuth, gameId))) {
    return res.status(403).json({ error: 'Accès refusé à cette partie' });
  }
  return res.json(state);
}));

router.post('/games', requireGlPermission('gl.game.manage'), asyncHandler(async (req, res) => {
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
    throw err;
  }
  const newId = insertResult?.insertId;
  const state = await readGameState(newId);
  return res.status(201).json(state);
}));

router.put('/games/:id', requireGlPermission('gl.game.manage'), asyncHandler(async (req, res) => {
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
  const hasZoneContentRetrigger = Object.prototype.hasOwnProperty.call(req.body || {}, 'zoneContentRetrigger')
    || Object.prototype.hasOwnProperty.call(req.body || {}, 'zone_content_retrigger');
  const hasLoreFeuilletRetrigger = Object.prototype.hasOwnProperty.call(req.body || {}, 'loreFeuilletRetrigger')
    || Object.prototype.hasOwnProperty.call(req.body || {}, 'lore_feuillet_retrigger');
  const hasLoreEffacementEnabled = Object.prototype.hasOwnProperty.call(req.body || {}, 'loreEffacementEnabled')
    || Object.prototype.hasOwnProperty.call(req.body || {}, 'lore_effacement_enabled');
  const hasLoreGemmeCostsEnabled = Object.prototype.hasOwnProperty.call(req.body || {}, 'loreGemmeCostsEnabled')
    || Object.prototype.hasOwnProperty.call(req.body || {}, 'lore_gemme_costs_enabled');
  const hasLoreHeartRewardsEnabled = Object.prototype.hasOwnProperty.call(req.body || {}, 'loreHeartRewardsEnabled')
    || Object.prototype.hasOwnProperty.call(req.body || {}, 'lore_heart_rewards_enabled');
  if (!hasName && !hasChapterId && !hasClassId && !hasZoneContentRetrigger
    && !hasLoreFeuilletRetrigger && !hasLoreEffacementEnabled
    && !hasLoreGemmeCostsEnabled && !hasLoreHeartRewardsEnabled) {
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

  let nextZoneContentRetrigger = undefined;
  if (hasZoneContentRetrigger) {
    const raw = req.body?.zoneContentRetrigger ?? req.body?.zone_content_retrigger;
    if (raw == null || raw === '') {
      nextZoneContentRetrigger = null;
    } else {
      const mode = String(raw).trim();
      if (!MARKER_QUESTION_RETRIGGER_VALUES.has(mode)) {
        return res.status(400).json({ error: 'zoneContentRetrigger invalide' });
      }
      nextZoneContentRetrigger = mode;
    }
  }

  function parseOptionalBool(raw) {
    if (raw == null || raw === '') return null;
    if (raw === true || raw === 1 || raw === '1' || raw === 'true') return 1;
    if (raw === false || raw === 0 || raw === '0' || raw === 'false') return 0;
    return null;
  }

  let nextLoreFeuilletRetrigger = undefined;
  if (hasLoreFeuilletRetrigger) {
    const raw = req.body?.loreFeuilletRetrigger ?? req.body?.lore_feuillet_retrigger;
    if (raw == null || raw === '') {
      nextLoreFeuilletRetrigger = null;
    } else {
      const mode = String(raw).trim();
      if (!MARKER_QUESTION_RETRIGGER_VALUES.has(mode)) {
        return res.status(400).json({ error: 'loreFeuilletRetrigger invalide' });
      }
      nextLoreFeuilletRetrigger = mode;
    }
  }
  const nextLoreEffacementEnabled = hasLoreEffacementEnabled
    ? parseOptionalBool(req.body?.loreEffacementEnabled ?? req.body?.lore_effacement_enabled)
    : undefined;
  const nextLoreGemmeCostsEnabled = hasLoreGemmeCostsEnabled
    ? parseOptionalBool(req.body?.loreGemmeCostsEnabled ?? req.body?.lore_gemme_costs_enabled)
    : undefined;
  const nextLoreHeartRewardsEnabled = hasLoreHeartRewardsEnabled
    ? parseOptionalBool(req.body?.loreHeartRewardsEnabled ?? req.body?.lore_heart_rewards_enabled)
    : undefined;

  try {
    await execute(
      `UPDATE gl_games
          SET name = COALESCE(?, name),
              chapter_id = COALESCE(?, chapter_id),
              class_id = COALESCE(?, class_id),
              zone_content_retrigger = ${hasZoneContentRetrigger ? '?' : 'zone_content_retrigger'},
              lore_feuillet_retrigger = ${hasLoreFeuilletRetrigger ? '?' : 'lore_feuillet_retrigger'},
              lore_effacement_enabled = ${hasLoreEffacementEnabled ? '?' : 'lore_effacement_enabled'},
              lore_gemme_costs_enabled = ${hasLoreGemmeCostsEnabled ? '?' : 'lore_gemme_costs_enabled'},
              lore_heart_rewards_enabled = ${hasLoreHeartRewardsEnabled ? '?' : 'lore_heart_rewards_enabled'},
              updated_at = NOW()
        WHERE id = ?`,
      [
        nextName,
        nextChapterId,
        nextClassId,
        ...(hasZoneContentRetrigger ? [nextZoneContentRetrigger] : []),
        ...(hasLoreFeuilletRetrigger ? [nextLoreFeuilletRetrigger] : []),
        ...(hasLoreEffacementEnabled ? [nextLoreEffacementEnabled] : []),
        ...(hasLoreGemmeCostsEnabled ? [nextLoreGemmeCostsEnabled] : []),
        ...(hasLoreHeartRewardsEnabled ? [nextLoreHeartRewardsEnabled] : []),
        gameId,
      ]
    );
  } catch (err) {
    if (err && err.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(409).json({ error: 'Classe ou chapitre supprimé entre-temps' });
    }
    throw err;
  }

  const state = await readGameState(gameId);
  if (!state) return res.status(404).json({ error: 'Partie introuvable' });
  return res.json(state);
}));

router.post('/games/:id/join-team', requireGlAuth, asyncHandler(async (req, res) => {
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
}));

router.post('/games/:id/events', requireGlPermission('gl.event.emit'), asyncHandler(async (req, res) => {
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
}));

/**
 * Avancement du tour. Cyclique sur les equipes triees par id ASC.
 * Refus si `gameplay.turns_enabled = false`.
 */
router.post('/games/:id/turn/next', requireGlPermission('gl.game.manage'), asyncHandler(async (req, res) => {
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
}));

// O10 — sous-domaine actions extrait en sous-routeur dédié (chemins inchangés) :
//   POST /games/:id/actions
//   POST /games/:id/actions/:actionId/resolve
router.use(require('./games/actions'));
/** POST /api/gl/games/:id/qcm/answer — validation QCM en partie (+ score si activé). */
router.use(require('./games/qcm'));
// O10 — sous-domaine markers extrait en sous-routeur dédié (chemins inchangés) :
//   POST /games/:id/markers/:markerId/present-question
//   POST /games/:id/markers/:markerId/present-arrival
//   POST /games/:id/markers/:markerId/apply-effects
router.use(require('./games/markers'));
// O10 — sous-domaine vitality extrait en sous-routeur dédié (chemins inchangés) :
//   POST /games/:id/vitality/player
//   POST /games/:id/vitality/team
router.use(require('./games/vitality'));
router.use(require('./games/roster'));
// O10 — sous-domaine teams extrait en sous-routeur dédié (chemins inchangés) :
//   POST /games/:id/teams
//   PUT /games/:id/teams/:teamId
//   DELETE /games/:id/teams/:teamId
router.use(require('./games/teams'));

/** POST /api/gl/games/:id/zones/:zoneId/present-content — popover texte/images à l'entrée ou traversée. */
router.post('/games/:id/zones/:zoneId/present-content', requireGlAuth, asyncHandler(async (req, res) => {
  const gameId = parseId(req.params.id);
  const zoneId = parseId(req.params.zoneId);
  if (!gameId || !zoneId) {
    return res.status(400).json({ error: 'Identifiants invalides' });
  }

  const allowed = await canAccessGlGame(req.glAuth, gameId);
  if (!allowed) return res.status(403).json({ error: 'Accès partie refusé' });

  const game = await queryOne(
    'SELECT id, chapter_id, status, zone_content_retrigger FROM gl_games WHERE id = ? LIMIT 1',
    [gameId]
  );
  if (!game) return res.status(404).json({ error: 'Partie introuvable' });
  if (!['live', 'paused'].includes(String(game.status || '').toLowerCase())) {
    return res.status(409).json({ error: 'Partie non active' });
  }

  const zoneRow = await queryOne(
    `SELECT id, chapter_id, label, description, points_json, color,
            music_url, music_volume, popover_markdown, popover_images_json
       FROM gl_kingdom_zones WHERE id = ? LIMIT 1`,
    [zoneId]
  );
  if (!zoneRow || Number(zoneRow.chapter_id) !== Number(game.chapter_id)) {
    return res.status(404).json({ error: 'Zone introuvable' });
  }
  if (!zoneHasPopoverContent(zoneRow)) {
    return res.status(404).json({ error: 'Cette zone n’a pas de contenu popover' });
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
  const retriggerMode = resolveZoneContentRetrigger(game, settings);
  const canPresent = await canPresentZoneContent(
    { queryAll },
    { gameId, teamId, zoneId, retriggerMode }
  );
  if (!canPresent) {
    return res.status(409).json({ error: 'Contenu zone déjà présenté selon les réglages' });
  }

  const popover = serializeZonePopoverRow(zoneRow);
  const actorType = req.glAuth.userType === 'gl_admin' ? 'mj' : 'team';
  await execute(
    `INSERT INTO gl_game_events (game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [
      gameId,
      teamId,
      actorType,
      String(req.glAuth.userId),
      ZONE_CONTENT_PRESENT_EVENT,
      JSON.stringify({ zoneId, zoneLabel: zoneRow.label }),
    ]
  );
  const evt = await queryOne(
    `SELECT id, game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at
       FROM gl_game_events WHERE game_id = ? ORDER BY id DESC LIMIT 1`,
    [gameId]
  );
  if (evt) emitGlGameEvent(gameId, normalizeEventRow(evt));

  return res.json({
    zone: {
      id: Number(zoneRow.id),
      label: zoneRow.label,
      color: zoneRow.color,
    },
    teamId,
    popoverMarkdown: popover.popoverMarkdown,
    popoverImages: popover.popoverImages,
  });
}));

/** GET /api/gl/games/:id/feuillet-zones/presented — zones feuillets déjà lues par équipe. */
router.get('/games/:id/feuillet-zones/presented', requireGlAuth, validate({ query: glGamesFeuilletPresentedQuerySchema }), asyncHandler(async (req, res) => {
  const gameId = parseId(req.params.id);
  if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });

  const allowed = await canAccessGlGame(req.glAuth, gameId);
  if (!allowed) return res.status(403).json({ error: 'Accès partie refusé' });

  let teamId = req.validatedQuery?.teamId;
  if (req.glAuth.userType === 'gl_player') {
    const membership = await getPlayerGameMembership(gameId, req.glAuth.userId);
    if (!membership?.team_id) return res.status(403).json({ error: 'Joueur non rattaché à une équipe' });
    teamId = Number(membership.team_id);
  } else if (teamId == null) {
    return res.status(400).json({ error: 'teamId requis pour le MJ' });
  }

  const team = await queryOne('SELECT id FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1', [teamId, gameId]);
  if (!team) return res.status(404).json({ error: 'Équipe introuvable dans cette partie' });

  const zoneIds = await listPresentedFeuilletZones({ queryAll }, { gameId, teamId });
  return res.json({ teamId, zoneIds });
}));

/** POST /api/gl/games/:id/feuillet-zones/:zoneId/present — première traversée d'une zone feuillet. */
router.post('/games/:id/feuillet-zones/:zoneId/present', requireGlAuth, asyncHandler(async (req, res) => {
  const gameId = parseId(req.params.id);
  const zoneId = String(req.params.zoneId || '').trim();
  if (!gameId || !zoneId) {
    return res.status(400).json({ error: 'Identifiants invalides' });
  }

  const allowed = await canAccessGlGame(req.glAuth, gameId);
  if (!allowed) return res.status(403).json({ error: 'Accès partie refusé' });

  const game = await queryOne(
    `SELECT g.id, g.chapter_id, g.status,
            g.lore_gemme_costs_enabled, g.lore_heart_rewards_enabled,
            g.lore_effacement_enabled, g.lore_feuillet_retrigger,
            ch.plateau_number AS chapter_plateau_number
       FROM gl_games g
       LEFT JOIN gl_chapters ch ON ch.id = g.chapter_id
      WHERE g.id = ?
      LIMIT 1`,
    [gameId]
  );
  if (!game) return res.status(404).json({ error: 'Partie introuvable' });
  if (!['live', 'paused'].includes(String(game.status || '').toLowerCase())) {
    return res.status(409).json({ error: 'Partie non active' });
  }

  const catalogZone = getFeuilletZoneById(zoneId);
  if (!catalogZone) return res.status(404).json({ error: 'Zone feuillet introuvable' });

  const chapterPlateau = Number(game.chapter_plateau_number);
  if (!Number.isFinite(chapterPlateau) || chapterPlateau < 1 || chapterPlateau > 5) {
    return res.status(409).json({ error: 'Chapitre sans plateau configuré' });
  }
  if (Number(catalogZone.plateau) !== chapterPlateau) {
    return res.status(404).json({ error: 'Zone feuillet incompatible avec ce chapitre' });
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

  const actorType = req.glAuth.userType === 'gl_admin' ? 'mj' : 'team';
  const result = await presentFeuilletZone(
    { queryAll, withTransaction },
    {
      gameId,
      teamId,
      zoneId,
      feuilletCode: catalogZone.feuillet_code,
      plateau: catalogZone.plateau,
      titre: catalogZone.titre,
      coutGemme: catalogZone.cout_gemme,
      gainCoeur: catalogZone.gain_coeur,
      actorType,
      actorId: req.glAuth.userId,
      gameRow: game,
    }
  );

  if (result.error) {
    return res.status(result.error.status).json({ error: result.error.message });
  }

  const evt = await queryOne(
    `SELECT id, game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at
       FROM gl_game_events WHERE game_id = ? ORDER BY id DESC LIMIT 1`,
    [gameId]
  );
  if (evt) emitGlGameEvent(gameId, normalizeEventRow(evt));

  return res.json({
    zone: {
      zoneId: result.zoneId,
      feuilletCode: result.feuilletCode,
      titre: result.titre,
      popover: catalogZone.popover,
      coutGemme: result.coutGemme,
      gainCoeur: result.gainCoeur,
      plateau: catalogZone.plateau,
    },
    teamId,
    vitality: result.vitality,
  });
}));

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

router.delete('/games/:id', requireGlPermission('gl.game.manage'), asyncHandler(async (req, res) => {
  const gameId = parseId(req.params.id);
  if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
  const existing = await queryOne('SELECT id, status FROM gl_games WHERE id = ? LIMIT 1', [gameId]);
  if (!existing) return res.status(404).json({ error: 'Partie introuvable' });
  if (!['draft', 'ended'].includes(String(existing.status || '').toLowerCase())) {
    return res.status(409).json({ error: 'Suppression autorisée uniquement pour une partie brouillon ou terminée' });
  }
  await execute('DELETE FROM gl_games WHERE id = ?', [gameId]);
  return res.json({ ok: true });
}));

router.post('/games/:id/start', requireGlPermission('gl.game.manage'), asyncHandler((req, res) => updateGameStatus(req, res, 'live')));
router.post('/games/:id/pause', requireGlPermission('gl.game.manage'), asyncHandler((req, res) => updateGameStatus(req, res, 'paused')));
router.post('/games/:id/end', requireGlPermission('gl.game.manage'), asyncHandler((req, res) => updateGameStatus(req, res, 'ended')));

// O10 — sous-domaine spell-casts extrait en sous-routeur dédié (chemins inchangés).
router.use(require('./games/spell-casts'));

module.exports = router;
// exportés pour test no-DB du contrat O7
module.exports.glGamesListQuerySchema = glGamesListQuerySchema;
module.exports.glGamesFeuilletPresentedQuerySchema = glGamesFeuilletPresentedQuerySchema;
