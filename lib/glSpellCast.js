'use strict';

const { queryAll, queryOne, execute, withTransaction } = require('../database');
const { getGameplaySettings, getGlModulesSettings } = require('./glSettings');
const { normalizeSpellCode } = require('./glChapterSpells');
const { applyPlayerVitalityDelta, clampVitality } = require('./glVitality');
const { hasGlPermission } = require('../middleware/requireGlAuth');

const CONTRIBUTION_MODES = new Set(['coordinator', 'self_only', 'both']);
const TEAM_SCOPES = new Set(['any_team', 'own_team', 'mj_any']);
const STAFF_PERMISSIONS = ['gl.event.emit', 'gl.game.manage', 'gl.mascot.position'];

function makeHttpError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function isStaff(auth) {
  if (!auth || auth.userType === 'gl_player') return false;
  return STAFF_PERMISSIONS.some((key) => hasGlPermission(auth, key));
}

function resolveActorContext(auth) {
  const actorId = String(auth?.userId || '');
  if (auth?.userType === 'gl_player') {
    return {
      actorType: 'team',
      actorId,
      playerId: Number(auth.userId),
    };
  }
  return {
    actorType: 'mj',
    actorId,
    playerId: null,
  };
}

function parseContributionAmount(value) {
  if (value == null) return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw makeHttpError('INVALID_CONTRIBUTION', 400);
  }
  return clampVitality(Math.floor(n));
}

async function getSpellCastConfig() {
  const [gameplay, modules] = await Promise.all([
    getGameplaySettings(),
    getGlModulesSettings(),
  ]);
  return {
    enabled: modules.spellCastEnabled === true,
    vitalityEnabled: gameplay.vitalityEnabled === true,
    contributionMode: gameplay.spellCastContributionMode,
    teamScope: gameplay.spellCastTeamScope,
    mjOnly: gameplay.spellCastMjOnly === true,
    turnsEnabled: gameplay.turnsEnabled === true,
  };
}

function assertSpellCastActorAllowed(auth, config) {
  if (!config.mjOnly) return;
  if (!isStaff(auth)) {
    throw makeHttpError('SPELL_CAST_MJ_ONLY', 403);
  }
}

async function assertSpellCastAvailable(config) {
  if (!config.enabled) {
    throw makeHttpError('SPELL_CAST_DISABLED', 409);
  }
  if (!config.vitalityEnabled) {
    throw makeHttpError('VITALITY_DISABLED', 409);
  }
}

function resolveSpellCastError(err) {
  const map = {
    SPELL_CAST_DISABLED: { status: 409, error: 'Le lancement de sortilèges est désactivé dans les réglages' },
    VITALITY_DISABLED: { status: 409, error: 'Les points de vie et de pouvoir doivent être activés pour lancer un sortilège' },
    GAME_NOT_LIVE: { status: 409, error: 'La partie doit être en cours pour lancer un sortilège' },
    SPELL_NOT_IN_CHAPTER: { status: 400, error: 'Ce sortilège n’est pas disponible pour ce chapitre' },
    SPELL_NOT_FOUND: { status: 404, error: 'Sortilège introuvable' },
    SPELL_ZERO_COST: { status: 400, error: 'Ce sortilège n’a aucun coût (gemmes ou cœurs)' },
    TEAM_NOT_FOUND: { status: 404, error: 'Équipe introuvable dans cette partie' },
    TEAM_FORBIDDEN: { status: 403, error: 'Vous ne pouvez pas lancer un sortilège pour cette équipe' },
    TURN_FORBIDDEN: { status: 409, error: 'Ce n’est pas le tour de cette équipe' },
    DRAFT_NOT_FOUND: { status: 404, error: 'Brouillon introuvable' },
    DRAFT_NOT_COLLECTING: { status: 409, error: 'Ce brouillon n’est plus modifiable' },
    DRAFT_NOT_READY: { status: 409, error: 'Les contributions ne couvrent pas encore le coût du sortilège' },
    CONTRIBUTION_FORBIDDEN: { status: 403, error: 'Vous ne pouvez pas modifier la contribution de ce joueur' },
    PLAYER_NOT_ON_ROSTER: { status: 400, error: 'Ce joueur n’est pas dans le roster de cette partie' },
    CONTRIBUTION_EXCEEDS_BALANCE: { status: 409, error: 'La contribution dépasse le solde du joueur' },
    INVALID_CONTRIBUTION: { status: 400, error: 'Montant de contribution invalide' },
    INSUFFICIENT_BALANCE: { status: 409, error: 'Solde insuffisant pour un ou plusieurs joueurs' },
    GAME_ACCESS_DENIED: { status: 403, error: 'Accès partie refusé' },
    PLAYER_NOT_IN_GAME: { status: 403, error: 'Joueur non rattaché à cette partie' },
    CANCEL_FORBIDDEN: { status: 403, error: 'Vous ne pouvez pas annuler ce brouillon' },
    SPELL_CAST_MJ_ONLY: { status: 403, error: 'Seul le MJ peut lancer des sortilèges dans cette partie' },
  };
  if (err?.message && map[err.message]) return map[err.message];
  return null;
}

async function loadGameContext(gameId) {
  const game = await queryOne(
    `SELECT g.id, g.class_id, g.chapter_id, g.status, g.current_team_id
       FROM gl_games g
      WHERE g.id = ?
      LIMIT 1`,
    [gameId]
  );
  if (!game) return null;
  return {
    id: Number(game.id),
    classId: Number(game.class_id),
    chapterId: game.chapter_id != null ? Number(game.chapter_id) : null,
    status: String(game.status || ''),
    currentTeamId: game.current_team_id != null ? Number(game.current_team_id) : null,
  };
}

async function loadSpellForChapter(spellCode, chapterId) {
  const code = normalizeSpellCode(spellCode);
  if (!code || !chapterId) return null;
  const row = await queryOne(
    `SELECT s.spell_code, s.nom, s.emoji, s.cout_gemmes, s.cout_coeurs
       FROM gl_spells s
 INNER JOIN gl_chapter_spells cs ON cs.spell_code = s.spell_code AND cs.chapter_id = ?
      WHERE s.spell_code = ?
      LIMIT 1`,
    [chapterId, code]
  );
  if (!row) return null;
  const gems = clampVitality(row.cout_gemmes);
  const hearts = clampVitality(row.cout_coeurs);
  return {
    spellCode: String(row.spell_code),
    nom: String(row.nom || row.spell_code),
    emoji: row.emoji != null ? String(row.emoji) : null,
    required: { gems, hearts },
  };
}

function mapRosterRow(row) {
  return {
    playerId: Number(row.id),
    teamId: row.team_id != null ? Number(row.team_id) : null,
    teamName: row.team_name != null ? String(row.team_name) : null,
    pseudo: row.pseudo || null,
    firstName: row.first_name || '',
    lastName: row.last_name || '',
    healthPoints: clampVitality(row.health_points),
    powerPoints: clampVitality(row.power_points),
  };
}

async function loadTeamRoster(gameId, teamId) {
  const rows = await queryAll(
    `SELECT p.id, tm.team_id, t.name AS team_name,
            p.pseudo, p.first_name, p.last_name, p.health_points, p.power_points
       FROM gl_team_members tm
 INNER JOIN gl_players p ON p.id = tm.player_id
 INNER JOIN gl_teams t ON t.id = tm.team_id
      WHERE tm.game_id = ? AND tm.team_id = ?
      ORDER BY t.name ASC, p.last_name ASC, p.first_name ASC, p.id ASC`,
    [gameId, teamId]
  );
  return rows.map(mapRosterRow);
}

async function loadGameRoster(gameId) {
  const rows = await queryAll(
    `SELECT p.id, tm.team_id, t.name AS team_name,
            p.pseudo, p.first_name, p.last_name, p.health_points, p.power_points
       FROM gl_team_members tm
 INNER JOIN gl_players p ON p.id = tm.player_id
 INNER JOIN gl_teams t ON t.id = tm.team_id
      WHERE tm.game_id = ?
      ORDER BY t.name ASC, p.last_name ASC, p.first_name ASC, p.id ASC`,
    [gameId]
  );
  return rows.map(mapRosterRow);
}

function resolveRosterScope(auth) {
  return isStaff(auth) ? 'game' : 'team';
}

async function loadDraftRoster(gameId, draftRow) {
  const scope = String(draftRow.roster_scope || 'team');
  if (scope === 'game') return loadGameRoster(gameId);
  return loadTeamRoster(gameId, draftRow.team_id);
}

async function resolveDraftTeamId(gameId, teamId, game) {
  if (teamId != null && Number.isFinite(Number(teamId)) && Number(teamId) > 0) {
    return Number(teamId);
  }
  if (game.currentTeamId != null) return Number(game.currentTeamId);
  const first = await queryOne(
    'SELECT id FROM gl_teams WHERE game_id = ? ORDER BY id ASC LIMIT 1',
    [gameId]
  );
  if (!first?.id) throw makeHttpError('TEAM_NOT_FOUND', 404);
  return Number(first.id);
}

async function getPlayerTeamIdForGame(gameId, playerId) {
  const row = await queryOne(
    `SELECT team_id FROM gl_team_members WHERE game_id = ? AND player_id = ? LIMIT 1`,
    [gameId, playerId]
  );
  return row?.team_id != null ? Number(row.team_id) : null;
}

function canSelectTeam(auth, { teamId, config, playerTeamId }) {
  if (isStaff(auth)) return true;
  if (config.teamScope === 'any_team') return true;
  if (config.teamScope === 'own_team' || config.teamScope === 'mj_any') {
    return playerTeamId != null && Number(playerTeamId) === Number(teamId);
  }
  return false;
}

function canEditPlayerContribution(auth, { targetPlayerId, actorPlayerId, config }) {
  if (isStaff(auth)) return true;
  const target = Number(targetPlayerId);
  const actor = Number(actorPlayerId);
  if (config.contributionMode === 'coordinator') return true;
  if (config.contributionMode === 'self_only') return target === actor;
  if (config.contributionMode === 'both') return true;
  return false;
}

function assertTurnAllowsTeam(game, teamId, config) {
  if (!config.turnsEnabled) return;
  if (game.currentTeamId == null) return;
  if (Number(game.currentTeamId) !== Number(teamId)) {
    throw makeHttpError('TURN_FORBIDDEN', 409);
  }
}

async function loadContributions(draftId) {
  const rows = await queryAll(
    `SELECT player_id, gems, hearts, updated_by_player_id, updated_at
       FROM gl_spell_cast_contributions
      WHERE draft_id = ?
      ORDER BY player_id ASC`,
    [draftId]
  );
  return rows.map((row) => ({
    playerId: Number(row.player_id),
    gems: Number(row.gems) || 0,
    hearts: Number(row.hearts) || 0,
    updatedByPlayerId: Number(row.updated_by_player_id),
    updatedAt: row.updated_at,
  }));
}

function sumContributions(contributions) {
  let gems = 0;
  let hearts = 0;
  for (const c of contributions) {
    gems += Number(c.gems) || 0;
    hearts += Number(c.hearts) || 0;
  }
  return { gems, hearts };
}

function isDraftReady(totals, required) {
  if (required.gems > 0 && totals.gems !== required.gems) return false;
  if (required.hearts > 0 && totals.hearts !== required.hearts) return false;
  if (required.gems === 0 && required.hearts === 0) return false;
  return true;
}

async function formatDraftPayload(draftRow, spell, roster) {
  const contributions = await loadContributions(draftRow.id);
  const totals = sumContributions(contributions);
  const rosterScope = String(draftRow.roster_scope || 'team');
  return {
    id: Number(draftRow.id),
    gameId: Number(draftRow.game_id),
    teamId: Number(draftRow.team_id),
    rosterScope,
    spellCode: String(draftRow.spell_code),
    status: String(draftRow.status),
    createdByPlayerId: draftRow.created_by_player_id != null
      ? Number(draftRow.created_by_player_id)
      : null,
    createdByActorType: String(draftRow.created_by_actor_type || 'team'),
    createdByActorId: String(draftRow.created_by_actor_id || ''),
    launchedByPlayerId: draftRow.launched_by_player_id != null
      ? Number(draftRow.launched_by_player_id)
      : null,
    launchedByActorType: draftRow.launched_by_actor_type || null,
    launchedByActorId: draftRow.launched_by_actor_id || null,
    createdAt: draftRow.created_at,
    updatedAt: draftRow.updated_at,
    castAt: draftRow.cast_at || null,
    spell,
    required: spell.required,
    totals,
    ready: isDraftReady(totals, spell.required),
    roster,
    contributions,
  };
}

const DRAFT_SELECT_COLS = `id, game_id, team_id, roster_scope, spell_code, status, created_by_player_id,
            created_by_actor_type, created_by_actor_id,
            launched_by_player_id, launched_by_actor_type, launched_by_actor_id,
            created_at, updated_at, cast_at`;

async function findCollectingDraft(gameId, teamId, spellCode, rosterScope) {
  const scope = rosterScope === 'game' ? 'game' : 'team';
  if (scope === 'game') {
    return queryOne(
      `SELECT ${DRAFT_SELECT_COLS}
         FROM gl_spell_cast_drafts
        WHERE game_id = ? AND spell_code = ? AND status = 'collecting' AND roster_scope = 'game'
        LIMIT 1`,
      [gameId, spellCode]
    );
  }
  return queryOne(
    `SELECT ${DRAFT_SELECT_COLS}
       FROM gl_spell_cast_drafts
      WHERE game_id = ? AND team_id = ? AND spell_code = ? AND status = 'collecting'
        AND (roster_scope = 'team' OR roster_scope IS NULL)
      LIMIT 1`,
    [gameId, teamId, spellCode]
  );
}

async function createOrGetDraft({
  gameId,
  teamId,
  spellCode,
  auth,
  config,
}) {
  const actor = resolveActorContext(auth);
  const actorPlayerId = actor.playerId;
  const game = await loadGameContext(gameId);
  if (!game) throw makeHttpError('GAME_ACCESS_DENIED', 403);
  if (game.status !== 'live') throw makeHttpError('GAME_NOT_LIVE', 409);

  const spell = await loadSpellForChapter(spellCode, game.chapterId);
  if (!spell) {
    const exists = await queryOne('SELECT spell_code FROM gl_spells WHERE spell_code = ? LIMIT 1', [
      normalizeSpellCode(spellCode),
    ]);
    if (!exists) throw makeHttpError('SPELL_NOT_FOUND', 404);
    throw makeHttpError('SPELL_NOT_IN_CHAPTER', 400);
  }
  if (spell.required.gems === 0 && spell.required.hearts === 0) {
    throw makeHttpError('SPELL_ZERO_COST', 400);
  }

  const rosterScope = resolveRosterScope(auth);
  const resolvedTeamId = rosterScope === 'game'
    ? await resolveDraftTeamId(gameId, teamId, game)
    : Number(teamId);

  const team = await queryOne('SELECT id FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1', [
    resolvedTeamId,
    gameId,
  ]);
  if (!team) throw makeHttpError('TEAM_NOT_FOUND', 404);

  const playerTeamId = auth.userType === 'gl_player'
    ? await getPlayerTeamIdForGame(gameId, actorPlayerId)
    : null;
  if (auth.userType === 'gl_player') {
    if (playerTeamId == null) throw makeHttpError('PLAYER_NOT_IN_GAME', 403);
    if (!Number.isFinite(Number(teamId)) || Number(teamId) <= 0) {
      throw makeHttpError('TEAM_NOT_FOUND', 404);
    }
  }
  if (!canSelectTeam(auth, { teamId: resolvedTeamId, config, playerTeamId })) {
    throw makeHttpError('TEAM_FORBIDDEN', 403);
  }
  assertTurnAllowsTeam(game, resolvedTeamId, config);

  const code = spell.spellCode;
  let draft = await findCollectingDraft(gameId, resolvedTeamId, code, rosterScope);
  if (!draft) {
    const insert = await execute(
      `INSERT INTO gl_spell_cast_drafts
        (game_id, team_id, roster_scope, spell_code, status, created_by_player_id,
         created_by_actor_type, created_by_actor_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'collecting', ?, ?, ?, NOW(), NOW())`,
      [gameId, resolvedTeamId, rosterScope, code, actorPlayerId, actor.actorType, actor.actorId]
    );
    draft = await queryOne(
      `SELECT ${DRAFT_SELECT_COLS}
         FROM gl_spell_cast_drafts WHERE id = ? LIMIT 1`,
      [insert.insertId]
    );
  }

  const roster = await loadDraftRoster(gameId, draft);
  return formatDraftPayload(draft, spell, roster);
}

async function getDraftById(draftId, gameId) {
  const draft = await queryOne(
    `SELECT ${DRAFT_SELECT_COLS}
       FROM gl_spell_cast_drafts
      WHERE id = ? AND game_id = ?
      LIMIT 1`,
    [draftId, gameId]
  );
  if (!draft) throw makeHttpError('DRAFT_NOT_FOUND', 404);
  const game = await loadGameContext(gameId);
  const spell = await loadSpellForChapter(draft.spell_code, game?.chapterId);
  if (!spell) throw makeHttpError('SPELL_NOT_IN_CHAPTER', 400);
  const roster = await loadDraftRoster(gameId, draft);
  return formatDraftPayload(draft, spell, roster);
}

async function updateDraftContributions({
  gameId,
  draftId,
  contributions,
  auth,
  config,
}) {
  const actor = resolveActorContext(auth);
  const actorPlayerId = actor.playerId ?? Number(auth.userId);
  const draft = await queryOne(
    `SELECT id, game_id, team_id, spell_code, status, created_by_player_id
       FROM gl_spell_cast_drafts
      WHERE id = ? AND game_id = ?
      LIMIT 1`,
    [draftId, gameId]
  );
  if (!draft) throw makeHttpError('DRAFT_NOT_FOUND', 404);
  if (String(draft.status) !== 'collecting') throw makeHttpError('DRAFT_NOT_COLLECTING', 409);

  const game = await loadGameContext(gameId);
  if (!game || game.status !== 'live') throw makeHttpError('GAME_NOT_LIVE', 409);
  assertTurnAllowsTeam(game, draft.team_id, config);

  const roster = await loadDraftRoster(gameId, draft);
  const rosterById = new Map(roster.map((r) => [r.playerId, r]));
  const list = Array.isArray(contributions) ? contributions : [];

  for (const item of list) {
    const playerId = Number(item?.playerId);
    if (!Number.isFinite(playerId) || playerId <= 0) continue;
    const rosterRow = rosterById.get(playerId);
    if (!rosterRow) throw makeHttpError('PLAYER_NOT_ON_ROSTER', 400);
    if (!canEditPlayerContribution(auth, {
      targetPlayerId: playerId,
      actorPlayerId,
      config,
    })) {
      throw makeHttpError('CONTRIBUTION_FORBIDDEN', 403);
    }
    const gems = parseContributionAmount(item.gems);
    const hearts = parseContributionAmount(item.hearts);
    if (gems > rosterRow.powerPoints || hearts > rosterRow.healthPoints) {
      throw makeHttpError('CONTRIBUTION_EXCEEDS_BALANCE', 409);
    }
    await execute(
      `INSERT INTO gl_spell_cast_contributions
        (draft_id, player_id, gems, hearts, updated_by_player_id, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         gems = VALUES(gems),
         hearts = VALUES(hearts),
         updated_by_player_id = VALUES(updated_by_player_id),
         updated_at = NOW()`,
      [draftId, playerId, gems, hearts, actorPlayerId]
    );
  }

  return getDraftById(draftId, gameId);
}

async function launchDraft({
  gameId,
  draftId,
  auth,
  config,
}) {
  const actor = resolveActorContext(auth);
  const actorPlayerId = actor.playerId;
  const draft = await queryOne(
    `SELECT id, game_id, team_id, spell_code, status
       FROM gl_spell_cast_drafts
      WHERE id = ? AND game_id = ?
      LIMIT 1`,
    [draftId, gameId]
  );
  if (!draft) throw makeHttpError('DRAFT_NOT_FOUND', 404);
  if (String(draft.status) !== 'collecting') throw makeHttpError('DRAFT_NOT_COLLECTING', 409);

  const game = await loadGameContext(gameId);
  if (!game || game.status !== 'live') throw makeHttpError('GAME_NOT_LIVE', 409);
  assertTurnAllowsTeam(game, draft.team_id, config);

  const spell = await loadSpellForChapter(draft.spell_code, game.chapterId);
  if (!spell) throw makeHttpError('SPELL_NOT_IN_CHAPTER', 400);

  const contributions = await loadContributions(draftId);
  const totals = sumContributions(contributions);
  if (!isDraftReady(totals, spell.required)) {
    throw makeHttpError('DRAFT_NOT_READY', 409);
  }

  const activeContribs = contributions.filter((c) => (c.gems > 0 || c.hearts > 0));
  const launchRoster = await loadDraftRoster(gameId, draft);
  const rosterByIdLaunch = new Map(launchRoster.map((r) => [r.playerId, r]));
  let eventPayload = null;
  let results = [];

  await withTransaction(async (tx) => {
    for (const c of activeContribs) {
      const row = await tx.queryOne(
        'SELECT health_points, power_points FROM gl_players WHERE id = ? LIMIT 1',
        [c.playerId]
      );
      if (!row) throw makeHttpError('INSUFFICIENT_BALANCE', 409);
      const health = clampVitality(row.health_points);
      const power = clampVitality(row.power_points);
      if (c.hearts > health || c.gems > power) {
        throw makeHttpError('INSUFFICIENT_BALANCE', 409);
      }
    }

    for (const c of activeContribs) {
      const updated = await applyPlayerVitalityDelta(tx, {
        playerId: c.playerId,
        healthDelta: -c.hearts,
        powerDelta: -c.gems,
      });
      results.push({
        playerId: c.playerId,
        gems: c.gems,
        hearts: c.hearts,
        health: updated.health,
        power: updated.power,
      });
    }

    await tx.execute(
      `UPDATE gl_spell_cast_drafts
          SET status = 'cast',
              launched_by_player_id = ?,
              launched_by_actor_type = ?,
              launched_by_actor_id = ?,
              cast_at = NOW(),
              updated_at = NOW()
        WHERE id = ?`,
      [actorPlayerId, actor.actorType, actor.actorId, draftId]
    );

    eventPayload = {
      spellCode: spell.spellCode,
      spellName: spell.nom,
      spellEmoji: spell.emoji,
      teamId: Number(draft.team_id),
      draftId: Number(draftId),
      cost: { ...spell.required },
      contributions: activeContribs.map((c) => {
        const rosterRow = rosterByIdLaunch.get(c.playerId);
        return {
          playerId: c.playerId,
          gems: c.gems,
          hearts: c.hearts,
          teamId: rosterRow?.teamId ?? null,
        };
      }),
      results,
    };

    await tx.execute(
      `INSERT INTO gl_game_events (game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at)
       VALUES (?, ?, ?, ?, 'spell_cast', ?, NOW())`,
      [
        gameId,
        draft.team_id,
        actor.actorType,
        actor.actorId,
        JSON.stringify(eventPayload),
      ]
    );
  });

  const formatted = await getDraftById(draftId, gameId);
  return { draft: formatted, eventPayload, results };
}

async function cancelDraft({
  gameId,
  draftId,
  auth,
}) {
  const actor = resolveActorContext(auth);
  const draft = await queryOne(
    `SELECT id, game_id, status, created_by_player_id, created_by_actor_id
       FROM gl_spell_cast_drafts
      WHERE id = ? AND game_id = ?
      LIMIT 1`,
    [draftId, gameId]
  );
  if (!draft) throw makeHttpError('DRAFT_NOT_FOUND', 404);
  if (String(draft.status) !== 'collecting') throw makeHttpError('DRAFT_NOT_COLLECTING', 409);

  const canCancel = isStaff(auth)
    || (actor.playerId != null && Number(draft.created_by_player_id) === Number(actor.playerId))
    || String(draft.created_by_actor_id) === actor.actorId;
  if (!canCancel) throw makeHttpError('CANCEL_FORBIDDEN', 403);

  await execute(
    `UPDATE gl_spell_cast_drafts SET status = 'cancelled', updated_at = NOW() WHERE id = ?`,
    [draftId]
  );
  return { ok: true };
}

module.exports = {
  CONTRIBUTION_MODES,
  TEAM_SCOPES,
  getSpellCastConfig,
  assertSpellCastAvailable,
  assertSpellCastActorAllowed,
  resolveSpellCastError,
  isStaff,
  resolveActorContext,
  canSelectTeam,
  canEditPlayerContribution,
  createOrGetDraft,
  getDraftById,
  updateDraftContributions,
  launchDraft,
  cancelDraft,
  isDraftReady,
  sumContributions,
};
