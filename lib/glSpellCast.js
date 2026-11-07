'use strict';

const { queryAll, queryOne, execute, withTransaction } = require('../database');
const { getGameplaySettings, getGlModulesSettings } = require('./glSettings');
const { normalizeSpellCode } = require('./glChapterSpells');
const { applyPlayerVitalityDelta, clampVitality } = require('./glVitality');
const { loadGameRosterForState, loadTeamRosterForGame } = require('./glRoster');
const { normalizeCasterKind, isCasterKindAllowed } = require('./glSpellOptions');
const { hasGlPermission } = require('../middleware/requireGlAuth');
const { httpError } = require('./shared/httpError');
/** Signature historique `(message, status)` du marché / des sorts. */
const makeHttpError = (message, status) => httpError(status, message);
// « Tenir à deux » v2 : fenêtres, limites, coût par ressource, pot pré-rempli, effets exécutés.
const {
  isTenirGame,
  resolveTenirSettings,
  resourceOfPeople,
  listPresentMembers,
} = require('./glTenir');
const { assertFenetre, assertLimite, suggestContributions } = require('./glSpellFenetres');
const {
  applySpellEffectTx,
  appliquerNommerTx,
  resolveSpellEffect,
} = require('./glSpellEffectsApply');
const { effectType } = require('./glSpellEffects');

// Audit S13 — `gl.mascot.position` est accordée aux joueurs (`lib/rbac.js`) : la garder
// ici faisait reposer la distinction staff/joueur sur la seule sortie anticipée par
// `userType` dans `isStaff`. Ces deux permissions-là sont bien réservées au staff.
const STAFF_PERMISSIONS = ['gl.event.emit', 'gl.game.manage'];

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
  const [gameplay, modules] = await Promise.all([getGameplaySettings(), getGlModulesSettings()]);
  return {
    enabled: modules.spellCastEnabled === true,
    vitalityEnabled: gameplay.vitalityEnabled === true,
    contributionMode: gameplay.spellCastContributionMode,
    teamScope: gameplay.spellCastTeamScope,
    mjOnly: gameplay.spellCastMjOnly === true,
    approvalMode: gameplay.spellCastApprovalMode || 'per_spell',
    turnsEnabled: gameplay.turnsEnabled === true,
  };
}

/**
 * Approbation MJ effective pour un sortilège, combinant le réglage global et le type de sort.
 * - 'auto'        → jamais d'approbation ;
 * - 'mj_required' → toujours soumis ;
 * - 'per_spell'   → suit `spell.approvalMode` ('mj_required' du catalogue de sorts).
 */
function spellRequiresApproval(config, spell) {
  const mode = config?.approvalMode || 'per_spell';
  if (mode === 'auto') return false;
  if (mode === 'mj_required') return true;
  return String(spell?.approvalMode || 'auto') === 'mj_required';
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
  if (err?.code === 'SPELL_FENETRE' || err?.code === 'SPELL_LIMITE') {
    return { status: 409, error: err.message, code: err.code };
  }
  const map = {
    SPELL_NOT_OFFICIEL: {
      status: 409,
      error: 'Ce sort n’est pas lançable (proposé, non officiel)',
      code: 'SPELL_NOT_OFFICIEL',
    },
    SPELL_PEUPLE: {
      status: 403,
      error: 'Ce sort est réservé à l’autre peuple',
      code: 'SPELL_PEUPLE',
    },
    SPELL_PARTENAIRE: {
      status: 400,
      error: 'Un sort du pacte demande une équipe partenaire de l’autre peuple',
      code: 'SPELL_PARTENAIRE',
    },
    SPELL_CLASSE: {
      status: 409,
      error: 'La Lumière se joue depuis l’écran du tour (palier de cartes)',
      code: 'SPELL_CLASSE',
    },
    SPELL_LIMITE_ELEVE: {
      status: 400,
      error: 'Ce sort est limité par élève : playerId requis',
      code: 'SPELL_LIMITE_ELEVE',
    },
    SPELL_PARAM_DELTA: {
      status: 400,
      error: 'Progression : sens attendu (−1 ou +1)',
      code: 'SPELL_PARAM_DELTA',
    },
    SPELL_PARAM_CIBLE: {
      status: 400,
      error: 'Ce sort vise une autre équipe : targetTeamId requis',
      code: 'SPELL_PARAM_CIBLE',
    },
    SPELL_PARAM_PARTENAIRE: {
      status: 400,
      error: 'Équipe partenaire requise',
      code: 'SPELL_PARAM_PARTENAIRE',
    },
    SPELL_PARAM_RESSOURCE: {
      status: 400,
      error: 'Ressource attendue (coeurs ou gemmes)',
      code: 'SPELL_PARAM_RESSOURCE',
    },
    SPELL_PARAM_LEGATAIRE: {
      status: 400,
      error: 'Héritage : l’élève qui lègue est requis',
      code: 'SPELL_PARAM_LEGATAIRE',
    },
    SPELL_PARAM_BENEFICIAIRE: {
      status: 400,
      error: 'Héritage : bénéficiaire de la classe requis',
      code: 'SPELL_PARAM_BENEFICIAIRE',
    },
    SPELL_AUCUNE_ZONE: {
      status: 409,
      error: 'Aucune page endormie à révéler',
      code: 'SPELL_AUCUNE_ZONE',
    },
    SPELL_AUCUNE_CIBLE: {
      status: 409,
      error: 'Aucune équipe à faire venir',
      code: 'SPELL_AUCUNE_CIBLE',
    },
    CONTRIBUTION_PACTE_PEUPLE: {
      status: 400,
      error: 'Pacte : cœurs des Gnomes, gemmes des Licornes',
      code: 'CONTRIBUTION_PACTE_PEUPLE',
    },
    NOMMER_ZONE_REQUISE: {
      status: 400,
      error: 'Nommer : la page pâlie (zoneKey) est requise',
      code: 'NOMMER_ZONE_REQUISE',
    },
    PAGE_PAS_PALIE: { status: 409, error: 'Cette page n’est pas pâlie', code: 'PAGE_PAS_PALIE' },
    ZONE_INTROUVABLE: { status: 404, error: 'Page introuvable', code: 'ZONE_INTROUVABLE' },
    NO_PATH: { status: 409, error: 'Le chapitre n’a pas de chemin numéroté', code: 'NO_PATH' },
    SPELL_CAST_DISABLED: {
      status: 409,
      error: 'Le lancement de sortilèges est désactivé dans les réglages',
    },
    VITALITY_DISABLED: {
      status: 409,
      error: 'Les points de vie et de pouvoir doivent être activés pour lancer un sortilège',
    },
    GAME_NOT_LIVE: { status: 409, error: 'La partie doit être en cours pour lancer un sortilège' },
    SPELL_NOT_IN_CHAPTER: {
      status: 400,
      error: 'Ce sortilège n’est pas disponible pour ce chapitre',
    },
    SPELL_NOT_FOUND: { status: 404, error: 'Sortilège introuvable' },
    SPELL_ZERO_COST: { status: 400, error: 'Ce sortilège n’a aucun coût (gemmes ou cœurs)' },
    TEAM_NOT_FOUND: { status: 404, error: 'Équipe introuvable dans cette partie' },
    TEAM_FORBIDDEN: {
      status: 403,
      error: 'Vous ne pouvez pas lancer un sortilège pour cette équipe',
    },
    TURN_FORBIDDEN: { status: 409, error: 'Ce n’est pas le tour de cette équipe' },
    DRAFT_NOT_FOUND: { status: 404, error: 'Brouillon introuvable' },
    DRAFT_NOT_COLLECTING: { status: 409, error: 'Ce brouillon n’est plus modifiable' },
    DRAFT_ALREADY_CAST: { status: 409, error: 'Ce sortilège a déjà été lancé' },
    DRAFT_NOT_LAUNCHABLE: { status: 409, error: 'Ce brouillon ne peut plus être lancé' },
    DRAFT_PENDING_EXISTS: {
      status: 409,
      error: 'Ce sortilège attend déjà la validation du maître du jeu pour cette équipe',
    },
    CONTRIBUTION_GEMS_NOT_REQUIRED: {
      status: 400,
      error: 'Ce sortilège ne coûte aucune gemme : aucune gemme ne peut y être versée',
    },
    CONTRIBUTION_HEARTS_NOT_REQUIRED: {
      status: 400,
      error: 'Ce sortilège ne coûte aucun cœur : aucun cœur ne peut y être versé',
    },
    DRAFT_NOT_READY: {
      status: 409,
      error: 'Les contributions ne couvrent pas encore le coût du sortilège',
    },
    DRAFT_NOT_PENDING: {
      status: 409,
      error: 'Ce sortilège n’est pas en attente de validation',
    },
    SPELL_SCOPE_SOLO: {
      status: 409,
      error: 'Ce sortilège se lance en solo (un seul contributeur)',
    },
    SPELL_SCOPE_COLLECTIVE: {
      status: 409,
      error: 'Ce sortilège est collectif (au moins deux contributeurs)',
    },
    CONTRIBUTION_FORBIDDEN: {
      status: 403,
      error: 'Vous ne pouvez pas modifier la contribution de ce joueur',
    },
    PLAYER_NOT_ON_ROSTER: {
      status: 400,
      error: 'Ce joueur n’est pas dans le roster de cette partie',
    },
    CONTRIBUTION_EXCEEDS_BALANCE: {
      status: 409,
      error: 'La contribution dépasse le solde du joueur',
    },
    INVALID_CONTRIBUTION: { status: 400, error: 'Montant de contribution invalide' },
    INSUFFICIENT_BALANCE: { status: 409, error: 'Solde insuffisant pour un ou plusieurs joueurs' },
    GAME_ACCESS_DENIED: { status: 403, error: 'Accès partie refusé' },
    PLAYER_NOT_IN_GAME: { status: 403, error: 'Joueur non rattaché à cette partie' },
    CANCEL_FORBIDDEN: { status: 403, error: 'Vous ne pouvez pas annuler ce brouillon' },
    SPELL_CAST_MJ_ONLY: {
      status: 403,
      error: 'Seul le MJ peut lancer des sortilèges dans cette partie',
    },
    SPELL_CASTER_GNOME_ONLY: {
      status: 403,
      error: 'Ce sortilège ne peut être lancé que par des gnomes',
    },
    SPELL_CASTER_UNICORN_ONLY: {
      status: 403,
      error: 'Ce sortilège ne peut être lancé que par des licornes',
    },
    PLAYER_NOT_FOUND: { status: 404, error: 'Joueur introuvable' },
    SPELL_CAST_SCHEMA_OUTDATED: {
      status: 503,
      error:
        'Schéma sortilèges incomplet (migrations 113, 139, 173 et 195 requises). ' +
        'Contactez l’administrateur.',
    },
    CAST_NOT_FOUND: { status: 404, error: 'Sortilège lancé introuvable' },
    EFFECT_ALREADY_APPLIED: {
      status: 409,
      error: 'L’effet de ce sortilège est déjà noté appliqué',
    },
    TEAM_TYPE_UNKNOWN: {
      status: 409,
      error: 'Le peuple de cette équipe est indéterminé : impossible de vérifier la restriction',
    },
  };
  if (err?.message && map[err.message]) return map[err.message];
  return null;
}

/** Erreur MySQL colonne manquante (ex. roster_scope avant migration 113). */
function isSpellCastSchemaError(err) {
  const code = String(err?.code || '');
  const errno = Number(err?.errno);
  const msg = String(err?.sqlMessage || err?.message || '');
  if (errno === 1054 || code === 'ER_BAD_FIELD_ERROR') {
    return /roster_scope|gl_spell_cast|approval_mode|cast_scope|caster_kind|approval_required|effect_applied/i.test(
      msg,
    );
  }
  return false;
}

function mapSpellCastSqlError(err) {
  if (isSpellCastSchemaError(err)) {
    const e = makeHttpError('SPELL_CAST_SCHEMA_OUTDATED', 503);
    return e;
  }
  return err;
}

async function loadGameContext(gameId) {
  const game = await queryOne(
    `SELECT g.id, g.class_id, g.chapter_id, g.status, g.current_team_id, g.current_round_number,
            g.tenir_profil, g.tenir_overrides_json, g.tenir_surface, ch.plateau_number
       FROM gl_games g
       LEFT JOIN gl_chapters ch ON ch.id = g.chapter_id
      WHERE g.id = ?
      LIMIT 1`,
    [gameId],
  );
  if (!game) return null;
  const gameplay = await getGameplaySettings();
  const tenir = isTenirGame(gameplay, game);
  return {
    id: Number(game.id),
    classId: Number(game.class_id),
    chapterId: game.chapter_id != null ? Number(game.chapter_id) : null,
    status: String(game.status || ''),
    currentTeamId: game.current_team_id != null ? Number(game.current_team_id) : null,
    roundNumber: Number(game.current_round_number) || 0,
    tenir,
    settings: gameplay,
    resolved: tenir ? resolveTenirSettings(gameplay, game) : null,
    row: game,
  };
}

/**
 * « Tenir à deux » : coût effectif d'un sort v2 selon la ressource (`peuple` → celle du
 * peuple de l'équipe ; `choix` → `ressourceChoisie`, à défaut celle du peuple ; `pacte` →
 * 2 cœurs + 2 gemmes ; `cartes` → pas une bourse). Hors v2 : `cout_gemmes` / `cout_coeurs`.
 */
function resolveRequired(spell, { teamType = null, ressourceChoisie = null } = {}) {
  if (!spell?.tenirV2) return { ...spell.required };
  const cout = Math.max(0, Number(spell.cout) || 0);
  const peuple = resourceOfPeople(teamType) === 'power' ? 'gemmes' : 'coeurs';
  let ressource = String(spell.ressource || 'choix');
  if (ressource === 'peuple') ressource = peuple;
  if (ressource === 'choix') {
    ressource =
      ressourceChoisie === 'gemmes' || ressourceChoisie === 'coeurs' ? ressourceChoisie : peuple;
  }
  if (ressource === 'gemmes') return { gems: cout, hearts: 0 };
  if (ressource === 'coeurs') return { gems: 0, hearts: cout };
  if (ressource === 'pacte') {
    const effect = resolveSpellEffect(spell) || {};
    const rep = effect.repartition || {};
    return {
      gems: Number(rep.unicorn?.montant) || 2,
      hearts: Number(rep.gnome?.montant) || 2,
    };
  }
  return { gems: 0, hearts: 0 };
}

async function teamHasRolled(teamId, roundNumber) {
  if (!roundNumber) return false;
  const row = await queryOne('SELECT last_dice_round_number FROM gl_teams WHERE id = ? LIMIT 1', [
    teamId,
  ]);
  return Number(row?.last_dice_round_number) >= Number(roundNumber);
}

/** Fenêtre et limite d'un sort v2 (409 `SPELL_FENETRE` / `SPELL_LIMITE`). */
async function assertTenirWindowAndLimit(
  game,
  { spell, teamId, partnerTeamId = null, playerId = null },
) {
  if (!game?.tenir || !spell?.tenirV2) return;
  const tour = require('./glTour');
  const round = game.roundNumber
    ? await tour.loadRoundView({ queryAll, queryOne }, game.id, game.roundNumber)
    : null;
  assertFenetre({
    spell,
    round,
    teamRolled: await teamHasRolled(teamId, game.roundNumber),
    partnerRolled: partnerTeamId ? await teamHasRolled(partnerTeamId, game.roundNumber) : false,
    resolved: game.resolved,
    gameLive: game.status === 'live',
    teamId,
  });
  await assertLimite(
    { queryOne },
    {
      spell,
      gameId: game.id,
      teamId,
      playerId,
      roundNumber: game.roundNumber,
      resolved: game.resolved,
    },
  );
}

/**
 * Pot pré-rempli (spec § 10) : parts égales entre membres présents non en retrait, reste au
 * plus riche. Pacte : cœurs de l'équipe gnome, gemmes de l'équipe licorne.
 */
async function buildSuggestedContributions(game, { draftRow, spell, required }) {
  if (!game?.tenir || !spell?.tenirV2) return [];
  const teamIds = [Number(draftRow.team_id)];
  if (draftRow.partner_team_id) teamIds.push(Number(draftRow.partner_team_id));
  const out = [];
  for (const tid of teamIds) {
    const team = await queryOne('SELECT id, type FROM gl_teams WHERE id = ? LIMIT 1', [tid]);
    if (!team) continue;
    const present = await listPresentMembers({ queryAll }, game.id, tid, game.roundNumber);
    if (!present.length) continue;
    const rows = await queryAll(
      `SELECT id, health_points, power_points FROM gl_players WHERE id IN (${present.map(() => '?').join(', ')})`,
      present,
    );
    const members = rows.map((r) => ({
      playerId: Number(r.id),
      health: Number(r.health_points) || 0,
      power: Number(r.power_points) || 0,
    }));
    const peuple = resourceOfPeople(team.type);
    const pacte = String(spell.ressource) === 'pacte';
    const wantsHearts = pacte ? peuple === 'health' : required.hearts > 0;
    const wantsGems = pacte ? peuple === 'power' : required.gems > 0;
    const hearts = wantsHearts
      ? suggestContributions({ members, ressource: 'health', cout: required.hearts })
      : [];
    const gems = wantsGems
      ? suggestContributions({ members, ressource: 'power', cout: required.gems })
      : [];
    for (const m of members) {
      out.push({
        playerId: m.playerId,
        teamId: tid,
        hearts: hearts.find((h) => h.playerId === m.playerId)?.amount || 0,
        gems: gems.find((g) => g.playerId === m.playerId)?.amount || 0,
      });
    }
  }
  return out;
}

async function loadSpellForChapter(spellCode, chapterId, { tenir = false } = {}) {
  const code = normalizeSpellCode(spellCode);
  if (!code || !chapterId) return null;
  const row = await queryOne(
    `SELECT s.spell_code, s.nom, s.emoji, s.cout_gemmes, s.cout_coeurs, s.approval_mode,
            s.cast_scope, s.caster_kind, s.effet_court, s.effet_detaille,
            s.portee, s.cible, s.timing, s.limite_usage, s.cumul, s.statut,
            s.famille, s.peuple, s.cout, s.ressource, s.fenetre, s.limite_json, s.execution,
            s.effet_auto_json, s.tenir_v2
       FROM gl_spells s
 INNER JOIN gl_chapter_spells cs ON cs.spell_code = s.spell_code AND cs.chapter_id = ?
      WHERE s.spell_code = ?
      LIMIT 1`,
    [chapterId, code],
  );
  if (!row) return null;
  // « Tenir à deux » : seuls les sorts v2 officiels sont lançables (les anciens restent `propose`).
  if (tenir && (Number(row.tenir_v2) !== 1 || String(row.statut) !== 'officiel')) {
    throw makeHttpError('SPELL_NOT_OFFICIEL', 409);
  }
  const gems = clampVitality(row.cout_gemmes);
  const hearts = clampVitality(row.cout_coeurs);
  const text = (value) => {
    if (value == null) return null;
    const trimmed = String(value).trim();
    return trimmed.length > 0 ? trimmed : null;
  };
  return {
    spellCode: String(row.spell_code),
    nom: String(row.nom || row.spell_code),
    emoji: row.emoji != null ? String(row.emoji) : null,
    approvalMode: String(row.approval_mode || 'auto'),
    castScope: String(row.cast_scope || 'any'),
    casterKind: normalizeCasterKind(row.caster_kind),
    // G11 — l'effet reste du texte que le MJ applique à la main : on le transporte avec
    // le sort pour pouvoir le lui rappeler au moment où il doit agir.
    effetCourt: text(row.effet_court),
    effetDetaille: text(row.effet_detaille),
    portee: text(row.portee),
    cible: text(row.cible),
    timing: text(row.timing),
    limiteUsage: text(row.limite_usage),
    cumul: text(row.cumul),
    required: { gems, hearts },
    // Grimoire v2 (« Tenir à deux »).
    tenirV2: Number(row.tenir_v2) === 1,
    statut: text(row.statut) || 'officiel',
    famille: text(row.famille),
    peuple: text(row.peuple) || 'any',
    cout: row.cout != null ? Number(row.cout) : null,
    ressource: text(row.ressource),
    fenetre: text(row.fenetre),
    limiteJson: text(row.limite_json),
    execution: text(row.execution) || 'prof',
    effetAutoJson: text(row.effet_auto_json),
  };
}

/** Erreur « peuple interdit » correspondant à la restriction du sort. */
function casterKindError(casterKind) {
  return makeHttpError(
    normalizeCasterKind(casterKind) === 'gnome'
      ? 'SPELL_CASTER_GNOME_ONLY'
      : 'SPELL_CASTER_UNICORN_ONLY',
    403,
  );
}

/**
 * Vérifie qu'une équipe peut lancer ce sort (restriction `gl_spells.caster_kind`).
 * Appelé à la création du brouillon quand le roster est celui d'une seule équipe.
 */
function assertTeamCasterKindAllowed(spell, teamType) {
  const kind = normalizeCasterKind(spell?.casterKind);
  if (kind === 'any') return;
  if (teamType == null) throw makeHttpError('TEAM_TYPE_UNKNOWN', 409);
  if (!isCasterKindAllowed(kind, teamType)) throw casterKindError(kind);
}

/**
 * Vérifie que **tous** les contributeurs effectifs appartiennent à un peuple autorisé.
 * Rejouée au lancement et à l'acceptation MJ : la restriction du sort a pu changer
 * entre l'alimentation du brouillon et le débit.
 * @param {object} spell
 * @param {Array<{playerId:number}>} activeContribs contributions non nulles
 * @param {Array<{playerId:number, teamType:string|null}>} roster
 */
function assertCastersCasterKindAllowed(spell, activeContribs, roster) {
  const kind = normalizeCasterKind(spell?.casterKind);
  if (kind === 'any') return;
  const rosterById = new Map((roster || []).map((r) => [Number(r.playerId), r]));
  for (const contrib of activeContribs) {
    const rosterRow = rosterById.get(Number(contrib.playerId));
    if (!isCasterKindAllowed(kind, rosterRow?.teamType)) throw casterKindError(kind);
  }
}

async function loadTeamRoster(gameId, teamId) {
  return loadTeamRosterForGame(queryAll, gameId, teamId, { vitalityEnabled: true });
}

async function loadGameRoster(gameId) {
  return loadGameRosterForState(queryAll, gameId, { vitalityEnabled: true });
}

function resolveRosterScope(auth) {
  return isStaff(auth) ? 'game' : 'team';
}

async function loadDraftRoster(gameId, draftRow) {
  const scope = String(draftRow.roster_scope || 'team');
  // Pacte : les deux équipes (lanceuse + partenaire), rien d'autre.
  if (draftRow.partner_team_id) {
    const all = await loadGameRoster(gameId);
    const ids = new Set([Number(draftRow.team_id), Number(draftRow.partner_team_id)]);
    return all.filter((r) => ids.has(Number(r.teamId)));
  }
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
    [gameId],
  );
  if (!first?.id) throw makeHttpError('TEAM_NOT_FOUND', 404);
  return Number(first.id);
}

async function getPlayerTeamIdForGame(gameId, playerId) {
  const row = await queryOne(
    `SELECT team_id FROM gl_team_members WHERE game_id = ? AND player_id = ? LIMIT 1`,
    [gameId, playerId],
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

// Mode classique : toutes les équipes jouent simultanément, plus de blocage « tour de l'équipe ».
// Conservée comme no-op pour compatibilité d'appel (et future réintroduction d'un mode séquentiel).
function assertTurnAllowsTeam() {}

async function loadContributions(draftId) {
  const rows = await queryAll(
    `SELECT player_id, gems, hearts, updated_by_player_id, updated_at
       FROM gl_spell_cast_contributions
      WHERE draft_id = ?
      ORDER BY player_id ASC`,
    [draftId],
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
  // Audit S3 — un axe non demandé doit rester à zéro : sans ce contrôle, des gemmes
  // versées sur un sort qui n'en coûte pas n'étaient comparées à rien… mais bien
  // débitées. Filet arrière du refus posé à l'écriture des contributions.
  if (required.gems === 0 && totals.gems > 0) return false;
  if (required.hearts === 0 && totals.hearts > 0) return false;
  if (required.gems === 0 && required.hearts === 0) return false;
  return true;
}

function parseJsonSafe(raw) {
  if (raw == null || raw === '') return null;
  try {
    return typeof raw === 'object' ? raw : JSON.parse(String(raw));
  } catch (_) {
    return null;
  }
}

async function formatDraftPayload(draftRow, spell, roster, { game = null } = {}) {
  const contributions = await loadContributions(draftRow.id);
  const totals = sumContributions(contributions);
  const rosterScope = String(draftRow.roster_scope || 'team');
  const teamRow = roster.find((r) => Number(r.teamId) === Number(draftRow.team_id));
  const required = resolveRequired(spell, {
    teamType: teamRow?.teamType || null,
    ressourceChoisie: draftRow.ressource_choisie || null,
  });
  const suggestedContributions = game
    ? await buildSuggestedContributions(game, { draftRow, spell, required })
    : [];
  return {
    // « Tenir à deux » v2
    castRoundNumber: draftRow.cast_round_number != null ? Number(draftRow.cast_round_number) : null,
    partnerTeamId: draftRow.partner_team_id != null ? Number(draftRow.partner_team_id) : null,
    playerId: draftRow.player_id != null ? Number(draftRow.player_id) : null,
    ressourceChoisie: draftRow.ressource_choisie || null,
    effectParams: parseJsonSafe(draftRow.effect_params_json),
    suggestedContributions,
    fenetre: spell?.fenetre || null,
    limite: parseJsonSafe(spell?.limiteJson),
    execution: spell?.execution || null,
    id: Number(draftRow.id),
    gameId: Number(draftRow.game_id),
    teamId: Number(draftRow.team_id),
    rosterScope,
    spellCode: String(draftRow.spell_code),
    status: String(draftRow.status),
    approvalRequired: Number(draftRow.approval_required) === 1,
    submittedAt: draftRow.submitted_at || null,
    decidedAt: draftRow.decided_at || null,
    castScope: spell?.castScope || 'any',
    casterKind: normalizeCasterKind(spell?.casterKind),
    createdByPlayerId:
      draftRow.created_by_player_id != null ? Number(draftRow.created_by_player_id) : null,
    createdByActorType: String(draftRow.created_by_actor_type || 'team'),
    createdByActorId: String(draftRow.created_by_actor_id || ''),
    launchedByPlayerId:
      draftRow.launched_by_player_id != null ? Number(draftRow.launched_by_player_id) : null,
    launchedByActorType: draftRow.launched_by_actor_type || null,
    launchedByActorId: draftRow.launched_by_actor_id || null,
    createdAt: draftRow.created_at,
    updatedAt: draftRow.updated_at,
    castAt: draftRow.cast_at || null,
    effectAppliedAt: draftRow.effect_applied_at || null,
    effectAppliedByActorType: draftRow.effect_applied_by_actor_type || null,
    effectAppliedByActorId: draftRow.effect_applied_by_actor_id || null,
    spell: { ...spell, required },
    required,
    totals,
    ready: isDraftReady(totals, required),
    roster,
    contributions,
  };
}

const DRAFT_SELECT_COLS = `id, game_id, team_id, roster_scope, spell_code, status, approval_required,
            created_by_player_id,
            created_by_actor_type, created_by_actor_id,
            launched_by_player_id, launched_by_actor_type, launched_by_actor_id,
            created_at, updated_at, cast_at, submitted_at,
            decided_by_actor_type, decided_by_actor_id, decided_at,
            effect_applied_at, effect_applied_by_actor_type, effect_applied_by_actor_id,
            cast_round_number, effect_params_json, partner_team_id, player_id, ressource_choisie`;

async function findCollectingDraft(gameId, teamId, spellCode, rosterScope) {
  const scope = rosterScope === 'game' ? 'game' : 'team';
  if (scope === 'game') {
    return queryOne(
      `SELECT ${DRAFT_SELECT_COLS}
         FROM gl_spell_cast_drafts
        WHERE game_id = ? AND spell_code = ? AND status = 'collecting' AND roster_scope = 'game'
        LIMIT 1`,
      [gameId, spellCode],
    );
  }
  return queryOne(
    `SELECT ${DRAFT_SELECT_COLS}
       FROM gl_spell_cast_drafts
      WHERE game_id = ? AND team_id = ? AND spell_code = ? AND status = 'collecting'
        AND (roster_scope = 'team' OR roster_scope IS NULL)
      LIMIT 1`,
    [gameId, teamId, spellCode],
  );
}

/**
 * Brouillon du même sort déjà soumis au MJ pour cette équipe (audit S10).
 * Même découpage de portée que `findCollectingDraft`.
 */
async function findPendingApprovalDraft(gameId, teamId, spellCode, rosterScope) {
  const scope = rosterScope === 'game' ? 'game' : 'team';
  if (scope === 'game') {
    return queryOne(
      `SELECT id
         FROM gl_spell_cast_drafts
        WHERE game_id = ? AND spell_code = ? AND status = 'pending_approval'
          AND roster_scope = 'game'
        LIMIT 1`,
      [gameId, spellCode],
    );
  }
  return queryOne(
    `SELECT id
       FROM gl_spell_cast_drafts
      WHERE game_id = ? AND team_id = ? AND spell_code = ? AND status = 'pending_approval'
        AND (roster_scope = 'team' OR roster_scope IS NULL)
      LIMIT 1`,
    [gameId, teamId, spellCode],
  );
}

async function createOrGetDraft({ gameId, teamId, spellCode, auth, config, options = {} }) {
  const actor = resolveActorContext(auth);
  const actorPlayerId = actor.playerId;
  const game = await loadGameContext(gameId);
  if (!game) throw makeHttpError('GAME_ACCESS_DENIED', 403);
  if (game.status !== 'live') throw makeHttpError('GAME_NOT_LIVE', 409);

  const spell = await loadSpellForChapter(spellCode, game.chapterId, { tenir: game.tenir });
  if (!spell) {
    const exists = await queryOne('SELECT spell_code FROM gl_spells WHERE spell_code = ? LIMIT 1', [
      normalizeSpellCode(spellCode),
    ]);
    if (!exists) throw makeHttpError('SPELL_NOT_FOUND', 404);
    throw makeHttpError('SPELL_NOT_IN_CHAPTER', 400);
  }
  const tenirV2 = game.tenir && spell.tenirV2;
  if (tenirV2 && String(spell.peuple) === 'classe') throw makeHttpError('SPELL_CLASSE', 409);

  const rosterScope = resolveRosterScope(auth);
  const resolvedTeamId =
    rosterScope === 'game' ? await resolveDraftTeamId(gameId, teamId, game) : Number(teamId);

  const team = await queryOne(
    'SELECT id, type FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1',
    [resolvedTeamId, gameId],
  );
  if (!team) throw makeHttpError('TEAM_NOT_FOUND', 404);

  // « Tenir à deux » : peuple du sort, partenaire du pacte, ressource au choix, fenêtre, limite.
  let partnerTeamId = null;
  let ressourceChoisie = null;
  let scopePlayerId = null;
  if (tenirV2) {
    const peuple = String(spell.peuple || 'any');
    if (
      (peuple === 'gnome' || peuple === 'unicorn') &&
      resourceOfPeople(team.type) !== resourceOfPeople(peuple)
    ) {
      throw makeHttpError('SPELL_PEUPLE', 403);
    }
    if (peuple === 'pacte') {
      partnerTeamId = Number(options.partnerTeamId) || null;
      const partner = partnerTeamId
        ? await queryOne('SELECT id, type FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1', [
            partnerTeamId,
            gameId,
          ])
        : null;
      if (!partner || resourceOfPeople(partner.type) === resourceOfPeople(team.type)) {
        throw makeHttpError('SPELL_PARTENAIRE', 400);
      }
    }
    if (String(spell.ressource) === 'choix') {
      ressourceChoisie =
        options.ressource === 'gemmes' || options.ressource === 'coeurs' ? options.ressource : null;
    }
    const limite = parseJsonSafe(spell.limiteJson);
    if (limite?.portee === 'eleve') {
      scopePlayerId = Number(options.playerId) || actorPlayerId || null;
      if (!scopePlayerId) throw makeHttpError('SPELL_LIMITE_ELEVE', 400);
    }
    await assertTenirWindowAndLimit(game, {
      spell,
      teamId: resolvedTeamId,
      partnerTeamId,
      playerId: scopePlayerId,
    });
  }
  const required = resolveRequired(spell, { teamType: team.type, ressourceChoisie });
  if (required.gems === 0 && required.hearts === 0) {
    throw makeHttpError('SPELL_ZERO_COST', 400);
  }
  // Restriction de peuple : refus immédiat quand le roster est celui d'une seule
  // équipe. En roster `game` (MJ), le contrôle se fait contributeur par contributeur —
  // toutes les équipes sont présentes, seules certaines peuvent alimenter le sort.
  if (!tenirV2 && rosterScope === 'team') assertTeamCasterKindAllowed(spell, team.type);

  const playerTeamId =
    auth.userType === 'gl_player' ? await getPlayerTeamIdForGame(gameId, actorPlayerId) : null;
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
    // Audit S10 — sans ce garde-fou, une équipe dont le sort attend le MJ pouvait en
    // ouvrir un second identique : la file de validation affichait deux entrées, et
    // les accepter toutes les deux débitait deux fois.
    const pending = await findPendingApprovalDraft(gameId, resolvedTeamId, code, rosterScope);
    if (pending) throw makeHttpError('DRAFT_PENDING_EXISTS', 409);

    const effectParams =
      options.effectParams && typeof options.effectParams === 'object'
        ? options.effectParams
        : null;
    const insert = await execute(
      `INSERT INTO gl_spell_cast_drafts
        (game_id, team_id, roster_scope, spell_code, status, created_by_player_id,
         created_by_actor_type, created_by_actor_id, cast_round_number, effect_params_json,
         partner_team_id, player_id, ressource_choisie, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'collecting', ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        gameId,
        resolvedTeamId,
        rosterScope,
        code,
        actorPlayerId,
        actor.actorType,
        actor.actorId,
        tenirV2 ? game.roundNumber || null : null,
        effectParams ? JSON.stringify(effectParams) : null,
        partnerTeamId,
        scopePlayerId,
        ressourceChoisie,
      ],
    );
    draft = await queryOne(
      `SELECT ${DRAFT_SELECT_COLS}
         FROM gl_spell_cast_drafts WHERE id = ? LIMIT 1`,
      [insert.insertId],
    );
    // Pot pré-rempli : parts égales entre présents non en retrait, reste au plus riche.
    if (tenirV2) {
      const suggested = await buildSuggestedContributions(game, {
        draftRow: draft,
        spell,
        required,
      });
      for (const c of suggested) {
        if (!c.gems && !c.hearts) continue;
        await execute(
          `INSERT INTO gl_spell_cast_contributions (draft_id, player_id, gems, hearts, updated_by_player_id, updated_at)
           VALUES (?, ?, ?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE gems = VALUES(gems), hearts = VALUES(hearts), updated_at = NOW()`,
          [draft.id, c.playerId, c.gems, c.hearts, actorPlayerId ?? c.playerId],
        );
      }
    }
  } else if (effectParamsChanged(draft, options.effectParams)) {
    await execute(
      'UPDATE gl_spell_cast_drafts SET effect_params_json = ?, updated_at = NOW() WHERE id = ?',
      [JSON.stringify(options.effectParams), draft.id],
    );
    draft.effect_params_json = JSON.stringify(options.effectParams);
  }

  const roster = await loadDraftRoster(gameId, draft);
  return formatDraftPayload(draft, spell, roster, { game });
}

function effectParamsChanged(draft, params) {
  if (!params || typeof params !== 'object') return false;
  return String(draft.effect_params_json || '') !== JSON.stringify(params);
}

async function getDraftById(draftId, gameId) {
  const draft = await queryOne(
    `SELECT ${DRAFT_SELECT_COLS}
       FROM gl_spell_cast_drafts
      WHERE id = ? AND game_id = ?
      LIMIT 1`,
    [draftId, gameId],
  );
  if (!draft) throw makeHttpError('DRAFT_NOT_FOUND', 404);
  const game = await loadGameContext(gameId);
  const spell = await loadSpellForChapter(draft.spell_code, game?.chapterId);
  if (!spell) throw makeHttpError('SPELL_NOT_IN_CHAPTER', 400);
  const roster = await loadDraftRoster(gameId, draft);
  return formatDraftPayload(draft, spell, roster, { game });
}

/** Liste les brouillons en attente de validation MJ (mode classique) pour une partie. */
async function listPendingApprovalDrafts(gameId) {
  const rows = await queryAll(
    `SELECT ${DRAFT_SELECT_COLS}
       FROM gl_spell_cast_drafts
      WHERE game_id = ? AND status = 'pending_approval'
      ORDER BY submitted_at ASC, id ASC`,
    [gameId],
  );
  if (rows.length === 0) return [];
  const game = await loadGameContext(gameId);
  const out = [];
  for (const draft of rows) {
    const spell = await loadSpellForChapter(draft.spell_code, game?.chapterId);
    if (!spell) continue;
    // « Tenir à deux » : la file ne garde que les sorts exécutés par le prof.
    if (game?.tenir && spell.tenirV2 && String(spell.execution) !== 'prof') continue;
    const roster = await loadDraftRoster(gameId, draft);
    out.push(await formatDraftPayload(draft, spell, roster, { game }));
  }
  return out;
}

async function updateDraftContributions({ gameId, draftId, contributions, auth, config }) {
  const actor = resolveActorContext(auth);
  const actorPlayerId = actor.playerId ?? Number(auth.userId);
  const draft = await queryOne(
    `SELECT id, game_id, team_id, roster_scope, spell_code, status, created_by_player_id,
            partner_team_id, ressource_choisie
       FROM gl_spell_cast_drafts
      WHERE id = ? AND game_id = ?
      LIMIT 1`,
    [draftId, gameId],
  );
  if (!draft) throw makeHttpError('DRAFT_NOT_FOUND', 404);
  if (String(draft.status) !== 'collecting') throw makeHttpError('DRAFT_NOT_COLLECTING', 409);

  const game = await loadGameContext(gameId);
  if (!game || game.status !== 'live') throw makeHttpError('GAME_NOT_LIVE', 409);
  assertTurnAllowsTeam(game, draft.team_id, config);

  const spell = await loadSpellForChapter(draft.spell_code, game.chapterId);
  if (!spell) throw makeHttpError('SPELL_NOT_IN_CHAPTER', 400);

  const roster = await loadDraftRoster(gameId, draft);
  const rosterById = new Map(roster.map((r) => [r.playerId, r]));
  const list = Array.isArray(contributions) ? contributions : [];
  const teamRow = roster.find((r) => Number(r.teamId) === Number(draft.team_id));
  const requiredForDraft = resolveRequired(spell, {
    teamType: teamRow?.teamType || null,
    ressourceChoisie: draft.ressource_choisie || null,
  });
  const pacte = game.tenir && spell.tenirV2 && String(spell.ressource) === 'pacte';

  for (const item of list) {
    const playerId = Number(item?.playerId);
    if (!Number.isFinite(playerId) || playerId <= 0) continue;
    const rosterRow = rosterById.get(playerId);
    if (!rosterRow) throw makeHttpError('PLAYER_NOT_ON_ROSTER', 400);
    if (
      !canEditPlayerContribution(auth, {
        targetPlayerId: playerId,
        actorPlayerId,
        config,
      })
    ) {
      throw makeHttpError('CONTRIBUTION_FORBIDDEN', 403);
    }
    const gems = parseContributionAmount(item.gems);
    const hearts = parseContributionAmount(item.hearts);
    // Audit S3 — on ne verse pas dans un axe que le sort ne demande pas : l'écran
    // n'affiche pas le champ, mais une requête fabriquée passait et la ressource
    // était débitée sans contrepartie.
    if (requiredForDraft.gems === 0 && gems > 0) {
      throw makeHttpError('CONTRIBUTION_GEMS_NOT_REQUIRED', 400);
    }
    if (requiredForDraft.hearts === 0 && hearts > 0) {
      throw makeHttpError('CONTRIBUTION_HEARTS_NOT_REQUIRED', 400);
    }
    // Pacte : les cœurs viennent de l'équipe gnome, les gemmes de l'équipe licorne.
    if (pacte) {
      const peuple = resourceOfPeople(rosterRow.teamType);
      if ((gems > 0 && peuple !== 'power') || (hearts > 0 && peuple !== 'health')) {
        throw makeHttpError('CONTRIBUTION_PACTE_PEUPLE', 400);
      }
    }
    if (gems > rosterRow.powerPoints || hearts > rosterRow.healthPoints) {
      throw makeHttpError('CONTRIBUTION_EXCEEDS_BALANCE', 409);
    }
    // Restriction de peuple : seule une contribution effective est refusée. Le front
    // envoie une ligne par joueur du roster (zéros compris) — un zéro venant d'un
    // joueur non autorisé reste donc un no-op légitime.
    if (
      !(game.tenir && spell.tenirV2) &&
      (gems > 0 || hearts > 0) &&
      !isCasterKindAllowed(spell.casterKind, rosterRow.teamType)
    ) {
      throw casterKindError(spell.casterKind);
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
      [draftId, playerId, gems, hearts, actorPlayerId],
    );
  }

  return getDraftById(draftId, gameId);
}

/** Périmètre solo/collectif d'un sortilège (`gl_spells.cast_scope`). */
function assertCastScope(spell, activeContribs) {
  const scope = String(spell?.castScope || 'any');
  if (scope === 'solo' && activeContribs.length > 1) {
    throw makeHttpError('SPELL_SCOPE_SOLO', 409);
  }
  if (scope === 'collective' && activeContribs.length < 2) {
    throw makeHttpError('SPELL_SCOPE_COLLECTIVE', 409);
  }
}

/**
 * Finalise un sortilège dans une transaction : débit de la vitalité des contributeurs,
 * passage du brouillon en 'cast' et émission de l'événement spell_cast. Partagé par le
 * lancement auto et l'acceptation MJ d'un sort en attente.
 * @returns {{ eventPayload: object, results: Array, eventId: number }}
 */
async function finalizeCastTx(
  tx,
  { gameId, draftId, draft, spell, contributions, roster, actor, game = null },
) {
  const activeContribs = contributions.filter((c) => c.gems > 0 || c.hearts > 0);
  const rosterById = new Map(roster.map((r) => [r.playerId, r]));
  const results = [];

  // Audit S2 — verrouiller le brouillon EN PREMIER (avant les joueurs, pour un ordre
  // de verrou stable) : deux lancements concurrents dont les soldes suffiraient à
  // payer deux fois ne doivent ni double-débiter ni émettre deux `spell_cast`.
  const lockedDraft = await tx.queryOne(
    'SELECT id, status FROM gl_spell_cast_drafts WHERE id = ? LIMIT 1 FOR UPDATE',
    [draftId],
  );
  if (!lockedDraft) throw makeHttpError('DRAFT_NOT_FOUND', 404);
  const lockedStatus = String(lockedDraft.status || '');
  if (lockedStatus !== 'collecting' && lockedStatus !== 'pending_approval') {
    throw makeHttpError(
      lockedStatus === 'cast' ? 'DRAFT_ALREADY_CAST' : 'DRAFT_NOT_LAUNCHABLE',
      409,
    );
  }

  for (const c of activeContribs) {
    // Verrou pessimiste (comme le marché) : sérialise deux lancements concurrents
    // alimentés par le même joueur, évitant la double-dépense de vitalité.
    const row = await tx.queryOne(
      'SELECT health_points, power_points FROM gl_players WHERE id = ? LIMIT 1 FOR UPDATE',
      [c.playerId],
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
      cause: 'sort_pot',
      gameId,
    });
    results.push({
      playerId: c.playerId,
      gems: c.gems,
      hearts: c.hearts,
      health: updated.health,
      power: updated.power,
    });
  }

  const castUpdate = await tx.execute(
    `UPDATE gl_spell_cast_drafts
        SET status = 'cast',
            launched_by_player_id = ?,
            launched_by_actor_type = ?,
            launched_by_actor_id = ?,
            cast_at = NOW(),
            updated_at = NOW()
      WHERE id = ? AND status IN ('collecting', 'pending_approval')`,
    [actor.playerId, actor.actorType, actor.actorId, draftId],
  );
  if (!castUpdate.affectedRows) throw makeHttpError('DRAFT_ALREADY_CAST', 409);

  const eventPayload = {
    spellCode: spell.spellCode,
    spellName: spell.nom,
    spellEmoji: spell.emoji,
    teamId: Number(draft.team_id),
    // Audit S14 — le journal doit pouvoir dire « pot commun de toute la partie »
    // plutôt que d'attribuer à une seule équipe un sort payé par plusieurs.
    rosterScope: String(draft.roster_scope || 'team') === 'game' ? 'game' : 'team',
    // G11 — l'effet à appliquer voyage avec l'événement : la console MJ l'affiche
    // immédiatement, sans second appel, au moment où il doit agir.
    spellEffectShort: spell.effetCourt || null,
    draftId: Number(draftId),
    cost: { ...spell.required },
    contributions: activeContribs.map((c) => {
      const rosterRow = rosterById.get(c.playerId);
      return {
        playerId: c.playerId,
        gems: c.gems,
        hearts: c.hearts,
        teamId: rosterRow?.teamId ?? null,
      };
    }),
    casters: activeContribs.map((c) => {
      const rosterRow = rosterById.get(c.playerId);
      const pseudo = rosterRow?.pseudo ? String(rosterRow.pseudo) : '';
      const name = `${rosterRow?.firstName || ''} ${rosterRow?.lastName || ''}`.trim();
      const displayName = pseudo || name || `Joueur #${c.playerId}`;
      return {
        playerId: c.playerId,
        displayName,
        gems: c.gems,
        hearts: c.hearts,
        teamId: rosterRow?.teamId ?? null,
      };
    }),
    results,
  };

  const insertEvt = await tx.execute(
    `INSERT INTO gl_game_events (game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at)
       VALUES (?, ?, ?, ?, 'spell_cast', ?, NOW())`,
    [gameId, draft.team_id, actor.actorType, actor.actorId, JSON.stringify(eventPayload)],
  );

  // « Tenir à deux » : l'effet automatique s'exécute après le débit ; `effect_applied_at` est
  // posé par le système. Les sorts du prof entrent en file (`spell_file`).
  let effectEvents = [];
  let effectResult = null;
  if (game?.tenir && spell.tenirV2) {
    const outcome = await applySpellEffectTx(tx, {
      gameId,
      draft,
      spell,
      params: parseJsonSafe(draft.effect_params_json) || {},
      roundNumber: draft.cast_round_number || game.roundNumber || 0,
      settings: game.settings,
      actor,
    });
    effectEvents = outcome.events || [];
    effectResult = outcome.result || null;
    if (outcome.auto) {
      await tx.execute(
        `UPDATE gl_spell_cast_drafts SET effect_applied_at = NOW(), effect_applied_by_actor_type = 'system',
                effect_applied_by_actor_id = 'auto', updated_at = NOW() WHERE id = ?`,
        [draftId],
      );
    }
  }
  return { eventPayload, results, eventId: insertEvt.insertId, effectEvents, effectResult };
}

async function launchDraft({ gameId, draftId, auth, config }) {
  const actor = resolveActorContext(auth);
  const draft = await queryOne(
    `SELECT id, game_id, team_id, roster_scope, spell_code, status, cast_round_number,
            effect_params_json, partner_team_id, player_id, ressource_choisie
       FROM gl_spell_cast_drafts
      WHERE id = ? AND game_id = ?
      LIMIT 1`,
    [draftId, gameId],
  );
  if (!draft) throw makeHttpError('DRAFT_NOT_FOUND', 404);
  if (String(draft.status) !== 'collecting') throw makeHttpError('DRAFT_NOT_COLLECTING', 409);

  const game = await loadGameContext(gameId);
  if (!game || game.status !== 'live') throw makeHttpError('GAME_NOT_LIVE', 409);

  const spell = await loadSpellForChapter(draft.spell_code, game.chapterId, { tenir: game.tenir });
  if (!spell) throw makeHttpError('SPELL_NOT_IN_CHAPTER', 400);
  const launchRoster = await loadDraftRoster(gameId, draft);
  const teamRow = launchRoster.find((r) => Number(r.teamId) === Number(draft.team_id));
  const required = resolveRequired(spell, {
    teamType: teamRow?.teamType || null,
    ressourceChoisie: draft.ressource_choisie || null,
  });
  const tenirV2 = game.tenir && spell.tenirV2;
  if (tenirV2) {
    // La fenêtre et la limite se rejouent au lancement : l'état a pu changer depuis le brouillon.
    await assertTenirWindowAndLimit(game, {
      spell,
      teamId: Number(draft.team_id),
      partnerTeamId: draft.partner_team_id ? Number(draft.partner_team_id) : null,
      playerId: draft.player_id ? Number(draft.player_id) : null,
    });
  }
  spell.required = required;

  const contributions = await loadContributions(draftId);
  const totals = sumContributions(contributions);
  if (!isDraftReady(totals, required)) {
    throw makeHttpError('DRAFT_NOT_READY', 409);
  }
  const activeContribs = contributions.filter((c) => c.gems > 0 || c.hearts > 0);
  assertCastScope(spell, activeContribs);

  if (!tenirV2) assertCastersCasterKindAllowed(spell, activeContribs, launchRoster);

  // Approbation MJ : un joueur soumet le sort, le débit n'a lieu qu'à l'acceptation du MJ.
  // Le staff (MJ) reste l'approbateur : son lancement est immédiat même en mode mj_required.
  // « Tenir à deux » : la file du prof (`spell_file`) remplace la validation préalable.
  if (spellRequiresApproval(config, spell) && !isStaff(auth) && !tenirV2) {
    const submitted = await execute(
      `UPDATE gl_spell_cast_drafts
          SET status = 'pending_approval',
              approval_required = 1,
              launched_by_player_id = ?,
              launched_by_actor_type = ?,
              launched_by_actor_id = ?,
              submitted_at = NOW(),
              updated_at = NOW()
        WHERE id = ? AND status = 'collecting'`,
      [actor.playerId, actor.actorType, actor.actorId, draftId],
    );
    // Audit S2 — deux soumissions concurrentes : une seule doit passer.
    if (!submitted.affectedRows) throw makeHttpError('DRAFT_NOT_COLLECTING', 409);
    const formatted = await getDraftById(draftId, gameId);
    const requestPayload = {
      spellCode: spell.spellCode,
      spellName: spell.nom,
      spellEmoji: spell.emoji,
      teamId: Number(draft.team_id),
      draftId: Number(draftId),
      cost: { ...spell.required },
    };
    let eventId = null;
    const insertEvt = await execute(
      `INSERT INTO gl_game_events (game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at)
         VALUES (?, ?, ?, ?, 'spell_cast_request', ?, NOW())`,
      [gameId, draft.team_id, actor.actorType, actor.actorId, JSON.stringify(requestPayload)],
    );
    eventId = insertEvt.insertId;
    return { draft: formatted, pending: true, eventPayload: requestPayload, results: [], eventId };
  }

  let result;
  try {
    await withTransaction(async (tx) => {
      result = await finalizeCastTx(tx, {
        gameId,
        draftId,
        draft,
        spell,
        contributions,
        roster: launchRoster,
        actor,
        game,
      });
    });
  } catch (err) {
    throw mapSpellCastSqlError(err);
  }

  const formatted = await getDraftById(draftId, gameId);
  return {
    draft: formatted,
    eventPayload: result.eventPayload,
    results: result.results,
    eventId: result.eventId,
    effectEvents: result.effectEvents || [],
    effectResult: result.effectResult || null,
  };
}

/**
 * Résolution MJ d'un sortilège en attente : accept (débit + cast) ou reject (aucun débit).
 * @param {'accept'|'reject'} decision
 */
async function resolveDraftApproval({ gameId, draftId, decision, auth }) {
  const actor = resolveActorContext(auth);
  const draft = await queryOne(
    `SELECT id, game_id, team_id, roster_scope, spell_code, status,
            launched_by_player_id, launched_by_actor_type, launched_by_actor_id,
            cast_round_number, effect_params_json, partner_team_id, player_id, ressource_choisie
       FROM gl_spell_cast_drafts
      WHERE id = ? AND game_id = ?
      LIMIT 1`,
    [draftId, gameId],
  );
  if (!draft) throw makeHttpError('DRAFT_NOT_FOUND', 404);
  if (String(draft.status) !== 'pending_approval') {
    throw makeHttpError('DRAFT_NOT_PENDING', 409);
  }
  // Le « lanceur » reste le joueur soumetteur ; le MJ est tracé via decided_by_*.
  const submitter = {
    playerId: draft.launched_by_player_id != null ? Number(draft.launched_by_player_id) : null,
    actorType: draft.launched_by_actor_type || 'team',
    actorId: draft.launched_by_actor_id || actor.actorId,
  };

  const game = await loadGameContext(gameId);
  if (!game || game.status !== 'live') throw makeHttpError('GAME_NOT_LIVE', 409);
  const spell = await loadSpellForChapter(draft.spell_code, game.chapterId);
  if (!spell) throw makeHttpError('SPELL_NOT_IN_CHAPTER', 400);
  const roster = await loadDraftRoster(gameId, draft);

  if (decision === 'reject') {
    const rejectPayload = {
      spellCode: spell.spellCode,
      spellName: spell.nom,
      teamId: Number(draft.team_id),
      draftId: Number(draftId),
    };
    let eventId = null;
    await withTransaction(async (tx) => {
      const rejected = await tx.execute(
        `UPDATE gl_spell_cast_drafts
            SET status = 'rejected',
                decided_by_actor_type = ?,
                decided_by_actor_id = ?,
                decided_at = NOW(),
                updated_at = NOW()
          WHERE id = ? AND status = 'pending_approval'`,
        [actor.actorType, actor.actorId, draftId],
      );
      // Audit S2 — deux refus concurrents : un seul événement `spell_cast_rejected`.
      if (!rejected.affectedRows) throw makeHttpError('DRAFT_NOT_PENDING', 409);
      const insertEvt = await tx.execute(
        `INSERT INTO gl_game_events (game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at)
           VALUES (?, ?, ?, ?, 'spell_cast_rejected', ?, NOW())`,
        [gameId, draft.team_id, actor.actorType, actor.actorId, JSON.stringify(rejectPayload)],
      );
      eventId = insertEvt.insertId;
    });
    const formatted = await getDraftById(draftId, gameId);
    return {
      draft: formatted,
      decision: 'reject',
      eventPayload: rejectPayload,
      results: [],
      eventId,
    };
  }

  // accept : revérifie la complétude puis débite.
  const acceptTeamRow = roster.find((r) => Number(r.teamId) === Number(draft.team_id));
  spell.required = resolveRequired(spell, {
    teamType: acceptTeamRow?.teamType || null,
    ressourceChoisie: draft.ressource_choisie || null,
  });
  const contributions = await loadContributions(draftId);
  const totals = sumContributions(contributions);
  if (!isDraftReady(totals, spell.required)) {
    throw makeHttpError('DRAFT_NOT_READY', 409);
  }
  // La restriction de peuple a pu être posée pendant que le sort attendait le MJ :
  // on la rejoue avant le débit plutôt que de se fier au contrôle de soumission.
  const acceptActiveContribs = contributions.filter((c) => c.gems > 0 || c.hearts > 0);
  if (!(game.tenir && spell.tenirV2)) {
    assertCastersCasterKindAllowed(spell, acceptActiveContribs, roster);
  }
  // Audit S9 — même raison pour la portée solo/collectif, qui a pu changer elle
  // aussi pendant l'attente : on la rejoue au lieu de se fier au contrôle du lancement.
  assertCastScope(spell, acceptActiveContribs);
  let result;
  try {
    await withTransaction(async (tx) => {
      // Débit au nom du soumetteur ; on trace le décideur MJ séparément.
      result = await finalizeCastTx(tx, {
        gameId,
        draftId,
        draft,
        spell,
        contributions,
        roster,
        actor: submitter,
        game,
      });
      await tx.execute(
        `UPDATE gl_spell_cast_drafts
            SET decided_by_actor_type = ?, decided_by_actor_id = ?, decided_at = NOW()
          WHERE id = ?`,
        [actor.actorType, actor.actorId, draftId],
      );
    });
  } catch (err) {
    throw mapSpellCastSqlError(err);
  }
  const formatted = await getDraftById(draftId, gameId);
  return {
    draft: formatted,
    decision: 'accept',
    eventPayload: result.eventPayload,
    results: result.results,
    eventId: result.eventId,
    effectEvents: result.effectEvents || [],
  };
}

/**
 * G11 — sortilèges lancés dont l'effet n'a pas encore été appliqué par le MJ.
 * L'application est un geste humain : cette file est le rappel, pas une exécution.
 */
async function listCastsAwaitingEffect(gameId) {
  const rows = await queryAll(
    `SELECT ${DRAFT_SELECT_COLS}
       FROM gl_spell_cast_drafts
      WHERE game_id = ? AND status = 'cast' AND effect_applied_at IS NULL
      ORDER BY cast_at ASC, id ASC`,
    [gameId],
  );
  if (rows.length === 0) return [];
  const game = await loadGameContext(gameId);
  const out = [];
  for (const draft of rows) {
    const spell = await loadSpellForChapter(draft.spell_code, game?.chapterId);
    if (!spell) continue;
    const roster = await loadDraftRoster(gameId, draft);
    out.push(await formatDraftPayload(draft, spell, roster));
  }
  return out;
}

/**
 * G11 — le MJ note qu'il a appliqué l'effet à la table. Écriture conditionnelle : deux
 * clics concurrents ne produisent qu'une trace et qu'un événement.
 */
async function markEffectApplied({ gameId, draftId, auth, body = {} }) {
  const actor = resolveActorContext(auth);
  const draft = await queryOne(
    `SELECT id, game_id, team_id, roster_scope, spell_code, status, effect_applied_at,
            cast_round_number, effect_params_json
       FROM gl_spell_cast_drafts
      WHERE id = ? AND game_id = ?
      LIMIT 1`,
    [draftId, gameId],
  );
  if (!draft) throw makeHttpError('DRAFT_NOT_FOUND', 404);
  if (String(draft.status) !== 'cast') throw makeHttpError('CAST_NOT_FOUND', 404);
  if (draft.effect_applied_at) throw makeHttpError('EFFECT_ALREADY_APPLIED', 409);

  const game = await loadGameContext(gameId);
  const spell = await loadSpellForChapter(draft.spell_code, game?.chapterId);
  // « Nommer » (prof) : la page pâlie désignée est réparée au clic de validation.
  let nommerZoneKey = null;
  if (game?.tenir && spell?.tenirV2) {
    const effect = resolveSpellEffect(spell);
    if (effect && effectType(effect) === 'reparer_zone') {
      const params = parseJsonSafe(draft.effect_params_json) || {};
      nommerZoneKey = String(body?.zoneKey || params?.zoneKey || '').trim();
      if (!nommerZoneKey) throw makeHttpError('NOMMER_ZONE_REQUISE', 400);
    }
  }

  const payload = {
    spellCode: String(draft.spell_code),
    spellName: spell?.nom || String(draft.spell_code),
    spellEmoji: spell?.emoji || null,
    teamId: Number(draft.team_id),
    rosterScope: String(draft.roster_scope || 'team') === 'game' ? 'game' : 'team',
    draftId: Number(draftId),
  };

  let eventId = null;
  const extraEvents = [];
  try {
    await withTransaction(async (tx) => {
      const updated = await tx.execute(
        `UPDATE gl_spell_cast_drafts
            SET effect_applied_at = NOW(),
                effect_applied_by_actor_type = ?,
                effect_applied_by_actor_id = ?,
                updated_at = NOW()
          WHERE id = ? AND status = 'cast' AND effect_applied_at IS NULL`,
        [actor.actorType, actor.actorId, draftId],
      );
      if (!updated.affectedRows) throw makeHttpError('EFFECT_ALREADY_APPLIED', 409);
      if (nommerZoneKey) {
        const nommer = await appliquerNommerTx(tx, {
          gameId,
          draft,
          zoneKey: nommerZoneKey,
          settings: game.settings,
          actor,
          roundNumber: draft.cast_round_number || game.roundNumber || 0,
        });
        extraEvents.push(...(nommer.events || []));
        payload.zoneKey = nommer.zoneKey;
      }
      const insertEvt = await tx.execute(
        `INSERT INTO gl_game_events (game_id, team_id, actor_type, actor_id, event_type, payload_json, created_at)
           VALUES (?, ?, ?, ?, 'spell_effect_applied', ?, NOW())`,
        [gameId, draft.team_id, actor.actorType, actor.actorId, JSON.stringify(payload)],
      );
      eventId = insertEvt.insertId;
    });
  } catch (err) {
    throw mapSpellCastSqlError(err);
  }

  const formatted = await getDraftById(draftId, gameId);
  return { draft: formatted, eventPayload: payload, eventId, extraEvents };
}

async function cancelDraft({ gameId, draftId, auth }) {
  const actor = resolveActorContext(auth);
  const draft = await queryOne(
    `SELECT id, game_id, status, created_by_player_id, created_by_actor_id
       FROM gl_spell_cast_drafts
      WHERE id = ? AND game_id = ?
      LIMIT 1`,
    [draftId, gameId],
  );
  if (!draft) throw makeHttpError('DRAFT_NOT_FOUND', 404);
  if (String(draft.status) !== 'collecting') throw makeHttpError('DRAFT_NOT_COLLECTING', 409);

  const canCancel =
    isStaff(auth) ||
    (actor.playerId != null && Number(draft.created_by_player_id) === Number(actor.playerId)) ||
    String(draft.created_by_actor_id) === actor.actorId;
  if (!canCancel) throw makeHttpError('CANCEL_FORBIDDEN', 403);

  await execute(
    `UPDATE gl_spell_cast_drafts SET status = 'cancelled', updated_at = NOW() WHERE id = ?`,
    [draftId],
  );
  return { ok: true };
}

module.exports = {
  resolveRequired,
  loadGameContext,
  loadSpellForChapter,
  getSpellCastConfig,
  assertSpellCastAvailable,
  assertSpellCastActorAllowed,
  resolveSpellCastError,
  isSpellCastSchemaError,
  mapSpellCastSqlError,
  isStaff,
  resolveActorContext,
  canSelectTeam,
  canEditPlayerContribution,
  createOrGetDraft,
  getDraftById,
  updateDraftContributions,
  launchDraft,
  resolveDraftApproval,
  listPendingApprovalDrafts,
  listCastsAwaitingEffect,
  markEffectApplied,
  cancelDraft,
  isDraftReady,
  sumContributions,
  spellRequiresApproval,
  assertTeamCasterKindAllowed,
  assertCastersCasterKindAllowed,
};
