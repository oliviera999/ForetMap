const express = require('express');
const dbModule = require('../../database');
const { queryAll, queryOne, execute, withTransaction } = dbModule;
const {
  requireGlAuth,
  requireGlPermission,
  isMj,
  actorTypeOf,
} = require('../../middleware/requireGlAuth');
const { normalizeEventRow, insertGameEvent } = require('../../lib/glGameEvents');
const { emitGlGameEvent } = require('../../lib/realtime');
const { getSpellCastConfig } = require('../../lib/glSpellCast');
const { getGameplaySettings } = require('../../lib/glSettings');
const { assignPlayerToTeamTx } = require('../../lib/glRoster');
const { canAccessGlGame } = require('../../lib/glGameAccess');

const { parsePct, validateEventPayload } = require('../../lib/gl/gameEventPayload');
const { buildDynamicUpdate, hasAnyDynamicField } = require('../../lib/gl/buildDynamicUpdate');
const {
  canPresentZoneContent,
  resolveZoneContentRetrigger,
  PRESENT_EVENT_TYPE: ZONE_CONTENT_PRESENT_EVENT,
} = require('../../lib/glZoneContentRetrigger');
const { serializeZonePopoverRow, zoneHasPopoverContent } = require('../../lib/glZoneContent');
const { MARKER_QUESTION_RETRIGGER_VALUES } = require('../../lib/glSettings');
const { resolveBoardMovementMode } = require('../../lib/glBoardPath');
const { parseDiceRollPayload } = require('../../lib/glDiceRoll');
// O10 — helpers runtime à I/O (DB) déplacés en l'état vers lib/gl/gamesRuntime.js
// (déplacement pur byte-identique) ; débloque le découpage futur en sous-routeurs.
const {
  getPlayerGameMembership,
  resolveRosterError,
  applyTeamMoveTx,
  readGameState,
} = require('../../lib/gl/gamesRuntime');

const router = express.Router();

function parseId(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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
    z.number().finite().nullable().catch(null),
  ),
  status: z.preprocess((v) => normalizeOptionalString(v), z.string().nullable().catch(null)),
});
const glGamesFeuilletPresentedQuerySchema = z.object({
  teamId: z.preprocess(
    (v) => (v == null ? null : Number(v)),
    z.number().finite().nullable().catch(null),
  ),
});

router.get(
  '/chapters',
  requireGlPermission('gl.read'),
  asyncHandler(async (_req, res) => {
    const rows = await queryAll(
      `SELECT id, slug, title, biome, map_image_url, order_index
       FROM gl_chapters
      ORDER BY order_index ASC, id ASC`,
    );
    return res.json(rows);
  }),
);

/**
 * Snapshot public des toggles gameplay (joueur + admin) :
 * le frontend en a besoin pour conditionner l'UI (tour, narration, actions, score).
 */
router.get(
  '/gameplay-settings',
  requireGlAuth,
  asyncHandler(async (_req, res) => {
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
  }),
);

router.get(
  '/games',
  requireGlPermission('gl.game.manage'),
  validate({ query: glGamesListQuerySchema }),
  asyncHandler(async (req, res) => {
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
      params,
    );
    return res.json(
      rows.map((row) => ({
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
      })),
    );
  }),
);

router.get(
  '/games/:id',
  requireGlAuth,
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
    const state = await readGameState(gameId);
    if (!state) return res.status(404).json({ error: 'Partie introuvable' });
    if (!(await canAccessGlGame(req.glAuth, gameId))) {
      // Message historique distinct des autres 403 « Accès partie refusé »
      // (contrat figé par tests/gl-game-access.test.js) — ne pas unifier.
      return res.status(403).json({ error: 'Accès refusé à cette partie' });
    }
    return res.json(state);
  }),
);

router.post(
  '/games',
  requireGlPermission('gl.game.manage'),
  asyncHandler(async (req, res) => {
    const classId = parseId(req.body?.classId);
    const chapterId = parseId(req.body?.chapterId);
    const name = normalizeOptionalString(req.body?.name) || 'Nouvelle partie';
    if (!classId || !chapterId)
      return res.status(400).json({ error: 'classId et chapterId requis' });

    // Validation préalable des FK : évite un 500 ER_NO_REFERENCED_ROW_2 (cf. POST /api/gl/games en prod, v1.52.3).
    const classRow = await queryOne(
      'SELECT id FROM gl_classes WHERE id = ? AND is_active = 1 LIMIT 1',
      [classId],
    );
    if (!classRow) return res.status(404).json({ error: 'Classe introuvable' });
    const chapterRow = await queryOne('SELECT id FROM gl_chapters WHERE id = ? LIMIT 1', [
      chapterId,
    ]);
    if (!chapterRow) return res.status(404).json({ error: 'Chapitre introuvable' });

    let insertResult;
    try {
      insertResult = await execute(
        `INSERT INTO gl_games (class_id, chapter_id, name, status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, 'draft', ?, NOW(), NOW())`,
        [classId, chapterId, name, req.glAuth.userId],
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
  }),
);

/** Booléen optionnel des toggles de partie : null (hérite), 1 ou 0. */
function parseOptionalBool(raw) {
  if (raw == null || raw === '') return null;
  if (raw === true || raw === 1 || raw === '1' || raw === 'true') return 1;
  if (raw === false || raw === 0 || raw === '0' || raw === 'false') return 0;
  return null;
}

function makeGameRetriggerParse(label) {
  return (raw) => {
    if (raw == null || raw === '') return { value: null };
    const mode = String(raw).trim();
    if (!MARKER_QUESTION_RETRIGGER_VALUES.has(mode)) return { error: `${label} invalide` };
    return { value: mode };
  };
}

// O-audit §4 — PUT /games/:id : champs optionnels déclaratifs (buildDynamicUpdate).
// Sémantique « présent mais null » préservée : null/'' → NULL en base (hérite du réglage
// global) ; champ absent → colonne non touchée. Alias snake_case historiques conservés.
const GAME_UPDATE_TOGGLE_FIELDS = [
  {
    key: 'zoneContentRetrigger',
    aliases: ['zone_content_retrigger'],
    column: 'zone_content_retrigger',
    parse: makeGameRetriggerParse('zoneContentRetrigger'),
  },
  {
    key: 'loreFeuilletRetrigger',
    aliases: ['lore_feuillet_retrigger'],
    column: 'lore_feuillet_retrigger',
    parse: makeGameRetriggerParse('loreFeuilletRetrigger'),
  },
  {
    key: 'loreEffacementEnabled',
    aliases: ['lore_effacement_enabled'],
    column: 'lore_effacement_enabled',
    parse: (raw) => ({ value: parseOptionalBool(raw) }),
  },
  {
    key: 'loreGemmeCostsEnabled',
    aliases: ['lore_gemme_costs_enabled'],
    column: 'lore_gemme_costs_enabled',
    parse: (raw) => ({ value: parseOptionalBool(raw) }),
  },
  {
    key: 'loreHeartRewardsEnabled',
    aliases: ['lore_heart_rewards_enabled'],
    column: 'lore_heart_rewards_enabled',
    parse: (raw) => ({ value: parseOptionalBool(raw) }),
  },
  {
    key: 'boardMovementMode',
    aliases: ['board_movement_mode'],
    column: 'board_movement_mode',
    parse: (raw) => {
      if (raw == null || raw === '') return { value: null };
      const mode = String(raw).trim();
      if (!['free', 'numbered_path'].includes(mode)) {
        return { error: 'boardMovementMode invalide' };
      }
      return { value: mode === 'free' ? null : mode };
    },
  },
  {
    key: 'boardPathStartIndex',
    aliases: ['board_path_start_index'],
    column: 'board_path_start_index',
    parse: (raw) => {
      if (raw == null || raw === '') return { value: null };
      const idx = Number(raw);
      if (idx !== 0 && idx !== 1) return { error: 'boardPathStartIndex invalide (0 ou 1)' };
      return { value: idx };
    },
  },
];

router.put(
  '/games/:id',
  requireGlPermission('gl.game.manage'),
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });

    const existing = await queryOne(
      'SELECT id, class_id, chapter_id, name, status FROM gl_games WHERE id = ? LIMIT 1',
      [gameId],
    );
    if (!existing) return res.status(404).json({ error: 'Partie introuvable' });

    const status = String(existing.status || '').toLowerCase();
    const hasName = req.body?.name != null;
    const hasChapterId = req.body?.chapterId != null;
    const hasClassId = req.body?.classId != null;
    if (
      !hasName &&
      !hasChapterId &&
      !hasClassId &&
      !hasAnyDynamicField(req.body, GAME_UPDATE_TOGGLE_FIELDS)
    ) {
      return res.status(400).json({ error: 'Aucune modification fournie' });
    }

    const nextName = hasName ? normalizeOptionalString(req.body.name) : null;
    if (hasName && !nextName) return res.status(400).json({ error: 'Nom de partie invalide' });

    let nextChapterId = null;
    if (hasChapterId) {
      nextChapterId = parseId(req.body.chapterId);
      if (!nextChapterId) return res.status(400).json({ error: 'chapterId invalide' });
      if (!['draft', 'paused'].includes(status)) {
        return res
          .status(409)
          .json({ error: 'Chapitre modifiable uniquement en brouillon ou pause' });
      }
      const chapterRow = await queryOne('SELECT id FROM gl_chapters WHERE id = ? LIMIT 1', [
        nextChapterId,
      ]);
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
          [gameId],
        );
        if (Number(memberCount?.cnt || 0) > 0) {
          return res.status(409).json({
            error: 'Classe non modifiable : des joueurs sont déjà assignés à cette partie',
          });
        }
      }
      const classRow = await queryOne(
        'SELECT id FROM gl_classes WHERE id = ? AND is_active = 1 LIMIT 1',
        [nextClassId],
      );
      if (!classRow) return res.status(404).json({ error: 'Classe introuvable' });
    }

    const { updates, params, error } = await buildDynamicUpdate(
      req.body,
      GAME_UPDATE_TOGGLE_FIELDS,
    );
    if (error) return res.status(400).json({ error });

    const sets = [];
    const setParams = [];
    if (hasName) {
      sets.push('name = ?');
      setParams.push(nextName);
    }
    if (hasChapterId) {
      sets.push('chapter_id = ?');
      setParams.push(nextChapterId);
    }
    if (hasClassId) {
      sets.push('class_id = ?');
      setParams.push(nextClassId);
    }
    sets.push(...updates, 'updated_at = NOW()');
    setParams.push(...params);

    try {
      await execute(`UPDATE gl_games SET ${sets.join(', ')} WHERE id = ?`, [...setParams, gameId]);
    } catch (err) {
      if (err && err.code === 'ER_NO_REFERENCED_ROW_2') {
        return res.status(409).json({ error: 'Classe ou chapitre supprimé entre-temps' });
      }
      throw err;
    }

    const state = await readGameState(gameId);
    if (!state) return res.status(404).json({ error: 'Partie introuvable' });
    return res.json(state);
  }),
);

router.post(
  '/games/:id/join-team',
  requireGlAuth,
  asyncHandler(async (req, res) => {
    if (req.glAuth.userType !== 'gl_player')
      return res.status(403).json({ error: 'Réservé aux joueurs' });
    const gameId = parseId(req.params.id);
    const teamId = parseId(req.body?.teamId);
    if (!gameId || !teamId) return res.status(400).json({ error: 'gameId/teamId invalides' });
    // Une seule requête : l'existence de l'équipe décide du 404, l'appartenance de
    // classe (comparaison SQL, NULL-safe comme l'ancien INNER JOIN) décide du 403.
    const team = await queryOne(
      `SELECT t.id, t.game_id, (p.class_id = g.class_id) AS class_match
       FROM gl_teams t
 INNER JOIN gl_games g ON g.id = t.game_id
  LEFT JOIN gl_players p ON p.id = ?
      WHERE t.id = ?
        AND t.game_id = ?
      LIMIT 1`,
      [req.glAuth.userId, teamId, gameId],
    );
    if (!team) {
      return res.status(404).json({ error: 'Équipe introuvable' });
    }
    if (!Number(team.class_match)) {
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
  }),
);

router.post(
  '/games/:id/events',
  requireGlPermission('gl.event.emit'),
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    const teamId = req.body?.teamId != null ? parseId(req.body.teamId) : null;
    const eventType = normalizeOptionalString(req.body?.eventType);
    const payload = req.body?.payload ?? {};
    if (!gameId || !eventType) return res.status(400).json({ error: 'gameId et eventType requis' });

    const settings = await getGameplaySettings();
    const validated = validateEventPayload(eventType, payload, settings, { teamId });
    if (validated.error) {
      return res.status(validated.error.status).json({ error: validated.error.message });
    }
    const { payloadToStore } = validated;
    const { markerId: moveMarkerId, xp: moveXp, yp: moveYp, hasPctPayload } = validated.move;

    // Contrôle dépendant de la partie (lecture DB) : déplacement libre interdit en mode
    // repères numérotés — resté hors de validateEventPayload (validation pure).
    if (eventType === 'move' && teamId != null && moveMarkerId == null && hasPctPayload) {
      const gameRow = await queryOne(
        'SELECT board_movement_mode FROM gl_games WHERE id = ? LIMIT 1',
        [gameId],
      );
      if (gameRow && resolveBoardMovementMode(gameRow) === 'numbered_path') {
        return res.status(409).json({
          error: 'Déplacement libre désactivé : mode repères numérotés (utilisez le dé)',
        });
      }
    }
    const actorType = actorTypeOf(req);
    const actorId = String(req.glAuth.userId);
    // Mode classique : un déplacement MJ consomme aussi le tour de l'équipe (1 par tour).
    let moveRoundNumber = null;
    if (eventType === 'move' && teamId != null) {
      const roundRow = await queryOne(
        'SELECT current_round_number FROM gl_games WHERE id = ? LIMIT 1',
        [gameId],
      );
      moveRoundNumber = roundRow ? Number(roundRow.current_round_number) || 0 : 0;
    }
    let createdEvent = null;
    await withTransaction(async (tx) => {
      createdEvent = await insertGameEvent(tx, {
        gameId,
        teamId,
        actorType,
        actorId,
        eventType,
        payload: payloadToStore,
      });
      if (eventType === 'move' && teamId != null) {
        await applyTeamMoveTx(tx, {
          gameId,
          teamId,
          markerId: moveMarkerId,
          xp: moveXp,
          yp: moveYp,
          roundNumber: moveRoundNumber,
        });
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
            [gameId, teamId, delta, reason],
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
    emitGlGameEvent(gameId, createdEvent);
    return res.status(201).json(createdEvent);
  }),
);

/**
 * Lancement d'un nouveau tour (mode classique). Toutes les équipes jouent simultanément ;
 * chaque équipe peut de nouveau déplacer sa mascotte (réarmement implicite via le numéro de tour).
 * Refus si `gameplay.turns_enabled = false`. Alias historique : POST /turn/next.
 */
async function startNextRound(req, res) {
  const gameId = parseId(req.params.id);
  if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
  const settings = await getGameplaySettings();
  if (!settings.turnsEnabled) {
    return res.status(409).json({ error: 'Tours desactivés dans les réglages' });
  }
  const game = await queryOne(
    'SELECT id, current_round_number FROM gl_games WHERE id = ? LIMIT 1',
    [gameId],
  );
  if (!game) return res.status(404).json({ error: 'Partie introuvable' });
  const teamsCount = await queryOne('SELECT COUNT(*) AS cnt FROM gl_teams WHERE game_id = ?', [
    gameId,
  ]);
  if (Number(teamsCount?.cnt || 0) === 0) {
    return res.status(400).json({ error: 'Aucune équipe sur cette partie' });
  }
  const previousRound = Number(game.current_round_number) || 0;
  const nextRound = previousRound + 1;
  let roundEvent = null;
  await withTransaction(async (tx) => {
    if (previousRound > 0) {
      await tx.execute(
        'UPDATE gl_game_rounds SET ended_at = NOW() WHERE game_id = ? AND round_number = ? AND ended_at IS NULL',
        [gameId, previousRound],
      );
    }
    await tx.execute(
      'UPDATE gl_games SET current_round_number = ?, current_round_started_at = NOW(), updated_at = NOW() WHERE id = ?',
      [nextRound, gameId],
    );
    await tx.execute(
      `INSERT INTO gl_game_rounds (game_id, round_number, started_by, started_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE started_by = VALUES(started_by), started_at = NOW(), ended_at = NULL`,
      [gameId, nextRound, String(req.glAuth.userId)],
    );
    roundEvent = await insertGameEvent(tx, {
      gameId,
      actorType: 'mj',
      actorId: String(req.glAuth.userId),
      eventType: 'round_start',
      payload: { roundNumber: nextRound },
    });
  });
  emitGlGameEvent(gameId, roundEvent);
  return res.json({ ok: true, roundNumber: nextRound, event: roundEvent });
}

router.post(
  '/games/:id/turn/start',
  requireGlPermission('gl.game.manage'),
  asyncHandler(startNextRound),
);
router.post(
  '/games/:id/turn/next',
  requireGlPermission('gl.game.manage'),
  asyncHandler(startNextRound),
);

/** État du tour courant + statut de déplacement de chaque équipe. */
router.get(
  '/games/:id/turn',
  requireGlAuth,
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
    if (!(await canAccessGlGame(req.glAuth, gameId))) {
      return res.status(403).json({ error: 'Accès partie refusé' });
    }
    const game = await queryOne(
      'SELECT current_round_number, current_round_started_at FROM gl_games WHERE id = ? LIMIT 1',
      [gameId],
    );
    if (!game) return res.status(404).json({ error: 'Partie introuvable' });
    const roundNumber = Number(game.current_round_number) || 0;
    const teams = await queryAll(
      'SELECT id, name, last_move_round_number, last_dice_round_number FROM gl_teams WHERE game_id = ? ORDER BY id ASC',
      [gameId],
    );
    return res.json({
      roundNumber,
      startedAt: game.current_round_started_at || null,
      teams: teams.map((t) => ({
        teamId: Number(t.id),
        name: t.name || '',
        hasMovedThisRound: roundNumber > 0 && Number(t.last_move_round_number || 0) >= roundNumber,
        hasRolledDiceThisRound:
          roundNumber > 0 && Number(t.last_dice_round_number || 0) >= roundNumber,
      })),
    });
  }),
);

/**
 * Enregistre le lancer de dés d'une équipe pour le tour courant (mode classique).
 * MJ : toute équipe de la partie ; joueur : uniquement son équipe.
 */
router.post(
  '/games/:id/teams/:teamId/dice-roll',
  requireGlAuth,
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    const teamId = parseId(req.params.teamId);
    if (!gameId || !teamId) return res.status(400).json({ error: 'Identifiants invalides' });

    const roll = parseDiceRollPayload(req.body);
    if (!roll) {
      return res.status(400).json({ error: 'Jet de dés invalide (values[], total requis)' });
    }

    if (!(await canAccessGlGame(req.glAuth, gameId))) {
      return res.status(403).json({ error: 'Accès partie refusé' });
    }

    const game = await queryOne(
      'SELECT id, status, current_round_number FROM gl_games WHERE id = ? LIMIT 1',
      [gameId],
    );
    if (!game) return res.status(404).json({ error: 'Partie introuvable' });
    if (String(game.status || '').toLowerCase() !== 'live') {
      return res.status(409).json({ error: 'La partie doit être en cours' });
    }

    const team = await queryOne(
      'SELECT id, last_dice_round_number FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1',
      [teamId, gameId],
    );
    if (!team) return res.status(404).json({ error: 'Équipe introuvable dans cette partie' });

    const isStaff =
      isMj(req) &&
      (req.glAuth.permissions || []).some((perm) =>
        ['gl.event.emit', 'gl.game.manage', 'gl.mascot.position'].includes(perm),
      );

    if (!isStaff) {
      if (req.glAuth.userType !== 'gl_player') {
        return res.status(403).json({ error: 'Action non autorisée' });
      }
      const membership = await getPlayerGameMembership(gameId, req.glAuth.userId);
      if (!membership?.team_id || Number(membership.team_id) !== Number(teamId)) {
        return res
          .status(403)
          .json({ error: 'Vous ne pouvez lancer les dés que pour votre équipe' });
      }
    }

    const settings = await getGameplaySettings();
    const roundNumber = Number(game.current_round_number) || 0;
    if (settings.turnsEnabled) {
      if (roundNumber === 0) {
        return res.status(409).json({ error: 'Aucun tour en cours : attendez le lancement du MJ' });
      }
      if (Number(team.last_dice_round_number || 0) >= roundNumber) {
        return res.status(409).json({ error: 'Dés déjà lancés pour ce tour' });
      }
    }

    const actorType = isStaff ? 'mj' : 'team';
    const actorId = String(req.glAuth.userId);
    const payload = { values: roll.values, total: roll.total, roundNumber };

    let diceEvent = null;
    await withTransaction(async (tx) => {
      diceEvent = await insertGameEvent(tx, {
        gameId,
        teamId,
        actorType,
        actorId,
        eventType: 'dice_roll',
        payload,
      });
      if (settings.turnsEnabled && roundNumber > 0) {
        await tx.execute(
          'UPDATE gl_teams SET last_dice_round_number = ?, updated_at = NOW() WHERE id = ? AND game_id = ?',
          [roundNumber, teamId, gameId],
        );
      }
    });

    emitGlGameEvent(gameId, diceEvent);
    return res.status(201).json(diceEvent);
  }),
);

/**
 * Déplacement de mascotte par un joueur (mode classique). Activé seulement si
 * `gameplay.mascot_move_actor = 'players'`. Le joueur doit être membre de l'équipe ;
 * une seule fois par tour lorsque les tours sont actifs.
 */
router.post(
  '/games/:id/teams/:teamId/move',
  requireGlAuth,
  asyncHandler(async (req, res) => {
    if (req.glAuth.userType !== 'gl_player') {
      return res.status(403).json({ error: 'Réservé aux joueurs' });
    }
    const gameId = parseId(req.params.id);
    const teamId = parseId(req.params.teamId);
    if (!gameId || !teamId) return res.status(400).json({ error: 'Identifiants invalides' });

    const settings = await getGameplaySettings();
    if (settings.mascotMoveActor !== 'players') {
      return res.status(403).json({ error: 'Déplacement de la mascotte réservé au maître du jeu' });
    }

    const game = await queryOne(
      'SELECT id, status, current_round_number, board_movement_mode FROM gl_games WHERE id = ? LIMIT 1',
      [gameId],
    );
    if (!game) return res.status(404).json({ error: 'Partie introuvable' });
    if (String(game.status || '').toLowerCase() !== 'live') {
      return res.status(409).json({ error: 'La partie doit être en cours' });
    }

    const membership = await getPlayerGameMembership(gameId, req.glAuth.userId);
    if (!membership?.team_id || Number(membership.team_id) !== Number(teamId)) {
      return res
        .status(403)
        .json({ error: 'Vous ne pouvez déplacer que la mascotte de votre équipe' });
    }

    const team = await queryOne(
      'SELECT id, last_move_round_number FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1',
      [teamId, gameId],
    );
    if (!team) return res.status(404).json({ error: 'Équipe introuvable dans cette partie' });

    const roundNumber = Number(game.current_round_number) || 0;
    if (settings.turnsEnabled) {
      if (roundNumber === 0) {
        return res.status(409).json({ error: 'Aucun tour en cours : attendez le lancement du MJ' });
      }
      if (Number(team.last_move_round_number || 0) >= roundNumber) {
        return res.status(409).json({ error: 'Mascotte déjà déplacée pour ce tour' });
      }
    }

    const payload = req.body?.payload ?? req.body ?? {};
    const moveMarkerId = payload?.markerId != null ? parseId(payload.markerId) : null;
    const hasMovePctPayload = payload?.xp != null || payload?.yp != null;
    const moveXp = parsePct(payload?.xp);
    const moveYp = parsePct(payload?.yp);
    if (moveMarkerId == null && !hasMovePctPayload) {
      return res.status(400).json({ error: 'payload move invalide (markerId ou xp/yp requis)' });
    }
    if (hasMovePctPayload && (moveXp == null || moveYp == null)) {
      return res.status(400).json({ error: 'xp/yp invalides (attendus entre 0 et 100)' });
    }
    if (
      moveMarkerId == null &&
      hasMovePctPayload &&
      resolveBoardMovementMode(game) === 'numbered_path'
    ) {
      return res.status(409).json({
        error: 'Déplacement libre désactivé : mode repères numérotés (utilisez le dé)',
      });
    }

    let moveEvent = null;
    try {
      await withTransaction(async (tx) => {
        moveEvent = await insertGameEvent(tx, {
          gameId,
          teamId,
          actorType: 'team',
          actorId: String(req.glAuth.userId),
          eventType: 'move',
          payload: moveMarkerId != null ? { markerId: moveMarkerId } : { xp: moveXp, yp: moveYp },
        });
        await applyTeamMoveTx(tx, {
          gameId,
          teamId,
          markerId: moveMarkerId,
          xp: moveXp,
          yp: moveYp,
          roundNumber,
        });
      });
    } catch (err) {
      if (err?.status === 404 && err?.message === 'MARKER_NOT_FOUND') {
        return res.status(404).json({ error: 'Repère introuvable' });
      }
      throw err;
    }

    emitGlGameEvent(gameId, moveEvent);
    return res.status(201).json(moveEvent);
  }),
);

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
router.post(
  '/games/:id/zones/:zoneId/present-content',
  requireGlAuth,
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    const zoneId = parseId(req.params.zoneId);
    if (!gameId || !zoneId) {
      return res.status(400).json({ error: 'Identifiants invalides' });
    }

    const allowed = await canAccessGlGame(req.glAuth, gameId);
    if (!allowed) return res.status(403).json({ error: 'Accès partie refusé' });

    const game = await queryOne(
      'SELECT id, chapter_id, status, zone_content_retrigger FROM gl_games WHERE id = ? LIMIT 1',
      [gameId],
    );
    if (!game) return res.status(404).json({ error: 'Partie introuvable' });
    if (!['live', 'paused'].includes(String(game.status || '').toLowerCase())) {
      return res.status(409).json({ error: 'Partie non active' });
    }

    const zoneRow = await queryOne(
      `SELECT id, chapter_id, label, description, points_json, color,
            music_url, music_volume, popover_markdown, popover_images_json
       FROM gl_kingdom_zones WHERE id = ? LIMIT 1`,
      [zoneId],
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
      if (!membership?.team_id)
        return res.status(403).json({ error: 'Joueur non rattaché à une équipe' });
      teamId = Number(membership.team_id);
    } else if (teamId == null) {
      return res.status(400).json({ error: 'teamId requis pour le MJ' });
    }

    const team = await queryOne('SELECT id FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1', [
      teamId,
      gameId,
    ]);
    if (!team) return res.status(404).json({ error: 'Équipe introuvable dans cette partie' });

    const settings = await getGameplaySettings();
    const retriggerMode = resolveZoneContentRetrigger(game, settings);
    const canPresent = await canPresentZoneContent(
      { queryAll },
      { gameId, teamId, zoneId, retriggerMode },
    );
    if (!canPresent) {
      return res.status(409).json({ error: 'Contenu zone déjà présenté selon les réglages' });
    }

    const popover = serializeZonePopoverRow(zoneRow);
    const actorType = actorTypeOf(req);
    const contentEvent = await insertGameEvent(dbModule, {
      gameId,
      teamId,
      actorType,
      actorId: String(req.glAuth.userId),
      eventType: ZONE_CONTENT_PRESENT_EVENT,
      payload: { zoneId, zoneLabel: zoneRow.label },
    });
    emitGlGameEvent(gameId, contentEvent);

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
  }),
);

router.delete(
  '/games/:id',
  requireGlPermission('gl.game.manage'),
  asyncHandler(async (req, res) => {
    const gameId = parseId(req.params.id);
    if (!gameId) return res.status(400).json({ error: 'Identifiant de partie invalide' });
    const existing = await queryOne('SELECT id, status FROM gl_games WHERE id = ? LIMIT 1', [
      gameId,
    ]);
    if (!existing) return res.status(404).json({ error: 'Partie introuvable' });
    if (!['draft', 'ended'].includes(String(existing.status || '').toLowerCase())) {
      return res
        .status(409)
        .json({ error: 'Suppression autorisée uniquement pour une partie brouillon ou terminée' });
    }
    await execute('DELETE FROM gl_games WHERE id = ?', [gameId]);
    return res.json({ ok: true });
  }),
);

// O10 — sous-domaine status extrait en sous-routeur dédié (chemins inchangés) :
//   POST /games/:id/start
//   POST /games/:id/pause
//   POST /games/:id/end
router.use(require('./games/status'));

// O10 — sous-domaine spell-casts extrait en sous-routeur dédié (chemins inchangés).
router.use(require('./games/spell-casts'));

// O10 — sous-domaine feuillet-zones extrait en sous-routeur dédié (chemins inchangés) :
//   GET  /games/:id/feuillet-zones/presented
//   POST /games/:id/feuillet-zones/:zoneId/present
router.use(require('./games/feuillet-zones'));

module.exports = router;
// exportés pour test no-DB du contrat O7
module.exports.glGamesListQuerySchema = glGamesListQuerySchema;
module.exports.glGamesFeuilletPresentedQuerySchema = glGamesFeuilletPresentedQuerySchema;
// exportée pour tests de contrat §4 (sémantique champ par champ du PUT /games/:id)
module.exports.GAME_UPDATE_TOGGLE_FIELDS = GAME_UPDATE_TOGGLE_FIELDS;
