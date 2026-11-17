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
  resolveSurface,
  resourceOfPeople,
  listPresentMembers,
} = require('./glTenir');
const { sortOuvert } = require('./shared/glTenirEscalierCore');
const { isSortPermisSurSurface } = require('./shared/glTenirPermissionsCore');
const {
  assertFenetre,
  assertLimite,
  suggestContributions,
  fenetreMessage,
} = require('./glSpellFenetres');
// E4 : la réserve de la caravane paie en premier le pot des sorts d'une équipe.
const { loadReserve, debitReserveTx, creditReserveTx } = require('./glBourses');
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

/** Tablette d'équipe (session ouverte par le lien de classe, validée par le middleware). */
function isTablette(auth) {
  return auth?.actor?.kind === 'team';
}

function resolveActorContext(auth) {
  const actorId = String(auth?.userId || '');
  // Tablette d'équipe : elle agit pour son équipe, jamais sous l'identité d'un élève.
  if (isTablette(auth)) {
    return {
      actorType: 'team',
      actorId: `equipe-${Number(auth.actor.teamId)}`,
      playerId: null,
      teamId: Number(auth.actor.teamId),
    };
  }
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
    TENIR_PERMISSION: {
      status: 403,
      error: 'Au tableau, ce sort se lance avec le prof.',
      code: 'TENIR_PERMISSION',
    },
    SPELL_COMPTE_ELEVE: {
      status: 403,
      error: 'Ce sort se lance depuis ton propre compte.',
      code: 'SPELL_COMPTE_ELEVE',
    },
    CONTRIBUTION_TABLETTE: {
      status: 403,
      error: 'Sur la tablette de l’équipe, le pot se partage tout seul : touchez « pas moi ».',
      code: 'CONTRIBUTION_TABLETTE',
    },
    CONTRIBUTION_AUTRE_EQUIPE: {
      status: 403,
      error: 'Seule l’équipe qui lance le sort règle son pot.',
      code: 'CONTRIBUTION_AUTRE_EQUIPE',
    },
    EXCLUSION_FORBIDDEN: {
      status: 403,
      error: 'On ne se retire que soi-même du pot.',
      code: 'EXCLUSION_FORBIDDEN',
    },
    EXCLUSION_ABSENT: {
      status: 409,
      error: 'Cette personne n’est pas dans le pot : choisissez quelqu’un qui est là.',
      code: 'EXCLUSION_ABSENT',
    },
    CONTRIBUTION_HORS_POT: {
      status: 409,
      error: 'Cette part n’est pas dans le pot : seuls les présents versent.',
      code: 'CONTRIBUTION_HORS_POT',
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
    RELANCE_SANS_JET: {
      status: 409,
      error: 'Aucun jet à annuler : la case d’arrivée s’est déjà appliquée',
      code: 'RELANCE_SANS_JET',
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
    SPELL_CIBLE_SOUS_VOILE: {
      status: 409,
      error: 'Cette équipe résiste déjà au voile : choisissez-en une autre.',
      code: 'SPELL_CIBLE_SOUS_VOILE',
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
    // Escalier du chapitre 1 (M8) : les sorts s'ouvrent aux séances 3 et 4.
    SPELL_ESCALIER: {
      status: 409,
      error: 'Ce sort s’ouvre plus tard dans le chapitre.',
      code: 'SPELL_ESCALIER',
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
    DRAFT_NOT_CAST: {
      status: 409,
      error: 'Ce sort n’est pas lancé, ou il est déjà remboursé',
      code: 'DRAFT_NOT_CAST',
    },
    DRAFT_NOT_COLLECTING: { status: 409, error: 'Ce brouillon n’est plus modifiable' },
    DRAFT_ALREADY_CAST: { status: 409, error: 'Ce sortilège a déjà été lancé' },
    DRAFT_NOT_LAUNCHABLE: { status: 409, error: 'Ce brouillon ne peut plus être lancé' },
    DRAFT_CHANGED: {
      status: 409,
      error: 'Le pot vient de changer : relisez les parts puis relancez',
      code: 'DRAFT_CHANGED',
    },
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

/**
 * Ensemble unifié (M16) : au plateau 4, la première Cordée de chaque équipe est offerte — son
 * pot vaut zéro. Une Cordée rendue (pas faite) ne compte pas.
 */
async function cordeeOfferte(game, spell, teamId) {
  if (!game?.tenir || !spell?.tenirV2 || !(Number(teamId) > 0)) return false;
  if (Number(game.row?.plateau_number) !== 4) return false;
  const effet = resolveSpellEffect(spell) || {};
  if (effet.type !== 'cordee' || effet.offerte_plateau_4 === false) return false;
  const row = await queryOne(
    `SELECT COUNT(*) AS c FROM gl_spell_cast_drafts
      WHERE game_id = ? AND team_id = ? AND spell_code = ? AND status = 'cast'`,
    [game.id, teamId, spell.spellCode],
  );
  return (Number(row?.c) || 0) === 0;
}

/** Coût effectif d'un sort pour une équipe : `resolveRequired`, à zéro pour une Cordée offerte. */
async function requiredFor(
  game,
  spell,
  { teamId = null, teamType = null, ressourceChoisie = null },
) {
  if (game && (await cordeeOfferte(game, spell, teamId))) return { gems: 0, hearts: 0 };
  return resolveRequired(spell, { teamType, ressourceChoisie });
}

async function teamHasRolled(teamId, roundNumber) {
  if (!roundNumber) return false;
  const row = await queryOne('SELECT last_dice_round_number FROM gl_teams WHERE id = ? LIMIT 1', [
    teamId,
  ]);
  return Number(row?.last_dice_round_number) >= Number(roundNumber);
}

const RELANCE_FENETRE_MESSAGE =
  'Relance se lance juste après le jet de l’équipe, tant que la case d’arrivée ne s’est pas appliquée.';

/** Fenêtre et limite d'un sort v2 (409 `SPELL_FENETRE` / `SPELL_LIMITE`). */
/**
 * « Tenir à deux » : permission de **surface** rejouée côté serveur (constat du 14 novembre
 * 2026 : seul le client grisait). Au tableau, un élève ne crée ni ne lance un sort dont la
 * fenêtre exige la phase `jeu` : c'est le prof qui porte les gestes du tour.
 * @throws 403 `TENIR_PERMISSION`
 */
function assertTenirSurfacePermission(game, spell, auth) {
  if (!game?.tenir || !spell?.tenirV2) return;
  if (isStaff(auth)) return;
  const surface = resolveSurface(game.row, game.settings);
  if (!isSortPermisSurSurface({ surface, actorKind: 'player', fenetre: spell.fenetre })) {
    throw makeHttpError('TENIR_PERMISSION', 403);
  }
}

async function assertTenirWindowAndLimit(
  game,
  { spell, teamId, partnerTeamId = null, playerId = null, round: roundPrecharge = undefined },
) {
  if (!game?.tenir || !spell?.tenirV2) return;
  const tour = require('./glTour');
  // `round` préchargé : l'écran d'équipe contrôle tous les sorts du chapitre d'un coup.
  const round =
    roundPrecharge !== undefined
      ? roundPrecharge
      : game.roundNumber
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
    // Lot 2 : en hybride et sur tablette, la fenêtre « après le jet » est celle de l'équipe.
    parallele: resolveSurface(game.row, game.settings) !== 'tableau',
  });
  // Relance (9 novembre 2026) : le sort annule un jet dont la case s'affiche sans s'être
  // appliquée. Sans jet en suspens (case déjà jouée, autre équipe passée, pas encore de jet),
  // il n'y a rien à annuler : refus avec le message de la fenêtre.
  if (effectType(resolveSpellEffect(spell) || {}) === 'reroll') {
    const { listEnSuspens } = require('./glArriveeSuspendue');
    const enSuspens = await listEnSuspens({ queryAll }, game.id, { teamId });
    if (!enSuspens.length) {
      const err = new Error(RELANCE_FENETRE_MESSAGE);
      err.status = 409;
      err.code = 'SPELL_FENETRE';
      err.fenetre = spell.fenetre || 'apres_jet';
      throw err;
    }
  }
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
  // M23 : un Mentorat par séance et par classe ; Lettre et Mentorat ne se paient qu'une fois.
  await require('./glLettreMentorat').assertSortPersonnelLibre(
    { queryOne },
    { gameId: game.id, type: effectType(resolveSpellEffect(spell) || {}), playerId },
  );
}

/**
 * Pot pré-rempli (spec § 10) : parts égales entre membres présents non en retrait, reste au
 * plus riche. Pacte : cœurs de l'équipe gnome, gemmes de l'équipe licorne.
 */
/**
 * E4 — part du coût payée par la réserve de la caravane (mode tenir, sorts v2) : l'équipe
 * lanceuse (et, pour un pacte, chaque équipe dans sa ressource) puise d'abord dans sa réserve ;
 * le pot des membres ne couvre que le reste. `{ covered: { gems, hearts }, parTeam, remaining }`.
 */
async function reserveCoverage(game, { draftRow, spell, required }, db = { queryOne, queryAll }) {
  const zero = {
    covered: { gems: 0, hearts: 0 },
    parTeam: [],
    remaining: {
      gems: Math.max(0, required?.gems || 0),
      hearts: Math.max(0, required?.hearts || 0),
    },
  };
  if (!game?.tenir || !spell?.tenirV2 || !draftRow) return zero;
  if (game.resolved && game.resolved.surplus_reserve === false) return zero;
  const pacte = String(spell.ressource) === 'pacte';
  const teamIds = [Number(draftRow.team_id)];
  if (pacte && draftRow.partner_team_id) teamIds.push(Number(draftRow.partner_team_id));
  let gemsLeft = Math.max(0, Number(required?.gems) || 0);
  let heartsLeft = Math.max(0, Number(required?.hearts) || 0);
  const parTeam = [];
  for (const tid of teamIds) {
    const team = await db.queryOne('SELECT id, type FROM gl_teams WHERE id = ? LIMIT 1', [tid]);
    if (!team) continue;
    const reserve = await loadReserve(db, game.id, tid);
    const peuple = resourceOfPeople(team.type);
    const hearts = !pacte || peuple === 'health' ? Math.min(heartsLeft, reserve.health) : 0;
    const gems = !pacte || peuple === 'power' ? Math.min(gemsLeft, reserve.power) : 0;
    heartsLeft -= hearts;
    gemsLeft -= gems;
    if (hearts || gems) parTeam.push({ teamId: Number(tid), hearts, gems });
  }
  return {
    covered: {
      gems: Math.max(0, (required?.gems || 0) - gemsLeft),
      hearts: Math.max(0, (required?.hearts || 0) - heartsLeft),
    },
    parTeam,
    remaining: { gems: gemsLeft, hearts: heartsLeft },
  };
}

/**
 * Équipes dont les membres alimentent un pot : la lanceuse, et sa partenaire seulement quand le
 * coût se partage entre les deux peuples (`ressource: 'pacte'`). Une Cordée offerte (lot 2) a
 * une partenaire, mais la lanceuse paie seule.
 */
function equipesDuPot(draftRow, spell) {
  const ids = [Number(draftRow.team_id)];
  if (draftRow.partner_team_id && String(spell?.ressource) === 'pacte') {
    ids.push(Number(draftRow.partner_team_id));
  }
  return ids;
}

/** « Pas moi » : identifiants exclus du pot (`exclus_json`), toujours un tableau d'entiers. */
function parseExclus(raw) {
  const list = parseJsonSafe(raw);
  return Array.isArray(list)
    ? [...new Set(list.map(Number).filter((n) => Number.isInteger(n) && n > 0))]
    : [];
}

async function buildSuggestedContributions(game, { draftRow, spell, required }) {
  if (!game?.tenir || !spell?.tenirV2) return [];
  // E4 : la réserve paie en premier ; le pot suggéré ne couvre que le reste.
  const coverage = await reserveCoverage(game, { draftRow, spell, required });
  const reste = coverage.remaining;
  const teamIds = equipesDuPot(draftRow, spell);
  const out = [];
  for (const tid of teamIds) {
    const team = await queryOne('SELECT id, type FROM gl_teams WHERE id = ? LIMIT 1', [tid]);
    if (!team) continue;
    const exclus = parseExclus(draftRow.exclus_json);
    const present = (await listPresentMembers({ queryAll }, game.id, tid, game.roundNumber)).filter(
      (id) => !exclus.includes(id),
    );
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
    const wantsHearts = pacte ? peuple === 'health' : reste.hearts > 0;
    const wantsGems = pacte ? peuple === 'power' : reste.gems > 0;
    const hearts = wantsHearts
      ? suggestContributions({ members, ressource: 'health', cout: reste.hearts })
      : [];
    const gems = wantsGems
      ? suggestContributions({ members, ressource: 'power', cout: reste.gems })
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

async function loadDraftRoster(gameId, draftRow, spell = null) {
  const scope = String(draftRow.roster_scope || 'team');
  // Pacte payé à deux : les deux équipes (lanceuse + partenaire), rien d'autre. Une Cordée
  // offerte (lot 2) garde une partenaire, mais seule la lanceuse alimente le pot.
  if (spell && draftRow.partner_team_id && String(spell.ressource) !== 'pacte') {
    return loadTeamRoster(gameId, draftRow.team_id);
  }
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

function isDraftReady(totals, required, covered = null, offerte = false) {
  // M16 : une Cordée offerte (pot à zéro) est prête sans aucune part.
  if (required.gems === 0 && required.hearts === 0) {
    return offerte === true && totals.gems === 0 && totals.hearts === 0;
  }
  // E4 : la réserve de la caravane a déjà payé `covered` ; le pot couvre exactement le reste.
  const reste = {
    gems: Math.max(0, required.gems - (covered?.gems || 0)),
    hearts: Math.max(0, required.hearts - (covered?.hearts || 0)),
  };
  if (totals.gems !== reste.gems) return false;
  if (totals.hearts !== reste.hearts) return false;
  // Audit S3 — un axe non demandé doit rester à zéro : sans ce contrôle, des gemmes
  // versées sur un sort qui n'en coûte pas n'étaient comparées à rien… mais bien
  // débitées (couvert par l'égalité stricte ci-dessus). Filet arrière du refus posé à
  // l'écriture des contributions.
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

/** Le sort tel qu'un écran le reçoit : sans `effetAutoJson` (champs réservés au prof). */
function sortPublic(spell) {
  if (!spell) return spell;
  const { effetAutoJson: _reserve, ...reste } = spell;
  return reste;
}

async function formatDraftPayload(draftRow, spell, roster, { game: gameArg = null } = {}) {
  // Le coût dépend de la partie (Cordée offerte au plateau 4, M16) : elle est relue au besoin.
  const game =
    gameArg ||
    (spell?.tenirV2 && draftRow?.game_id ? await loadGameContext(draftRow.game_id) : null);
  const contributions = await loadContributions(draftRow.id);
  const totals = sumContributions(contributions);
  const rosterScope = String(draftRow.roster_scope || 'team');
  const teamRow = roster.find((r) => Number(r.teamId) === Number(draftRow.team_id));
  const required = await requiredFor(game, spell, {
    teamId: Number(draftRow.team_id),
    teamType: teamRow?.teamType || null,
    ressourceChoisie: draftRow.ressource_choisie || null,
  });
  const suggestedContributions = game
    ? await buildSuggestedContributions(game, { draftRow, spell, required })
    : [];
  const coverage = game ? await reserveCoverage(game, { draftRow, spell, required }) : null;
  return {
    // E4 : part du coût payée par la réserve de la caravane, reste dû par le pot.
    reserve: coverage ? { ...coverage.covered, parTeam: coverage.parTeam } : null,
    requiredAfterReserve: coverage ? { ...coverage.remaining } : { ...required },
    // « Tenir à deux » v2
    castRoundNumber: draftRow.cast_round_number != null ? Number(draftRow.cast_round_number) : null,
    partnerTeamId: draftRow.partner_team_id != null ? Number(draftRow.partner_team_id) : null,
    playerId: draftRow.player_id != null ? Number(draftRow.player_id) : null,
    ressourceChoisie: draftRow.ressource_choisie || null,
    effectParams: parseJsonSafe(draftRow.effect_params_json),
    suggestedContributions,
    // Lot 2 : le pot se partage entre les présents ; `exclus` ont touché « pas moi ».
    presents: game?.tenir ? await presentsDuPot(game, draftRow, spell) : null,
    exclus: parseExclus(draftRow.exclus_json),
    // Équipes qui règlent ce pot (une Cordée offerte a une partenaire qui ne paie rien).
    equipesDuPot: equipesDuPot(draftRow, spell),
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
    // `effet_auto_json` reste côté serveur : il porte des champs réservés au prof (critère du
    // Mentorat, points de relecture de la Lettre) et aucun écran ne le lit.
    spell: { ...sortPublic(spell), required },
    required,
    // M16 : Cordée offerte (plateau 4, première de l'équipe) — pot à zéro.
    offerte: game ? await cordeeOfferte(game, spell, Number(draftRow.team_id)) : false,
    totals,
    ready: isDraftReady(
      totals,
      required,
      coverage?.covered || null,
      game ? await cordeeOfferte(game, spell, Number(draftRow.team_id)) : false,
    ),
    roster,
    contributions,
  };
}

/** Membres présents (non absents, non en retrait) des équipes d'un pot, exclus compris. */
async function presentsDuPot(game, draftRow, spell) {
  const teamIds = equipesDuPot(draftRow, spell);
  const out = [];
  for (const tid of teamIds) {
    out.push(...(await listPresentMembers({ queryAll }, game.id, tid, game.roundNumber)));
  }
  return out;
}

/**
 * « Tenir à deux » : seule une équipe du pot (la lanceuse, sa partenaire de pacte) le règle ou
 * le lance. Le prof peut toujours. Hors mode « Tenir », la portée du réglage classique décide.
 */
async function assertActeurDuPot(game, draftRow, spell, auth, actor) {
  if (!game?.tenir || isStaff(auth)) return;
  const teamOfActor = isTablette(auth)
    ? actor.teamId
    : await getPlayerTeamIdForGame(game.id, actor.playerId);
  if (teamOfActor == null || !equipesDuPot(draftRow, spell).includes(Number(teamOfActor))) {
    throw makeHttpError('CONTRIBUTION_AUTRE_EQUIPE', 403);
  }
}

/** Remplace les parts d'un pot par les parts suggérées (présents, hors « pas moi »). */
async function ecrirePartsSuggereesTx(tx, draftId, suggested, actorPlayerId = null) {
  await tx.execute('DELETE FROM gl_spell_cast_contributions WHERE draft_id = ?', [draftId]);
  for (const c of suggested) {
    if (!c.gems && !c.hearts) continue;
    await tx.execute(
      `INSERT INTO gl_spell_cast_contributions (draft_id, player_id, gems, hearts, updated_by_player_id, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [draftId, c.playerId, c.gems, c.hearts, actorPlayerId ?? c.playerId],
    );
  }
}

/**
 * Le serveur rejoue le pot (lot 2) : un pot repris d'un tour précédent repart de zéro (parts,
 * « pas moi »), et aucune part ne reste au nom d'un élève qui n'est plus dans le pot (absence
 * saisie entre-temps, retrait, « pas moi »). Sans effet quand tout est déjà en ordre.
 * @returns {Promise<boolean>} vrai si les parts ont été recalculées
 */
async function realignerPotSurLesPresents(game, draftRow, spell, required, actorPlayerId = null) {
  if (!game?.tenir || !spell?.tenirV2) return false;
  const autreTour =
    draftRow.cast_round_number != null &&
    Number(draftRow.cast_round_number) !== Number(game.roundNumber || 0);
  if (autreTour) draftRow.exclus_json = null;
  const presents = await presentsDuPot(game, draftRow, spell);
  const exclus = parseExclus(draftRow.exclus_json);
  const horsPot = (await loadContributions(draftRow.id)).some(
    (c) =>
      (c.gems > 0 || c.hearts > 0) &&
      (!presents.includes(Number(c.playerId)) || exclus.includes(Number(c.playerId))),
  );
  if (!autreTour && !horsPot) return false;
  const suggested = await buildSuggestedContributions(game, { draftRow, spell, required });
  await withTransaction(async (tx) => {
    const locked = await tx.queryOne(
      'SELECT status FROM gl_spell_cast_drafts WHERE id = ? LIMIT 1 FOR UPDATE',
      [draftRow.id],
    );
    if (String(locked?.status) !== 'collecting') throw makeHttpError('DRAFT_NOT_COLLECTING', 409);
    await tx.execute(
      'UPDATE gl_spell_cast_drafts SET exclus_json = ?, cast_round_number = ?, updated_at = NOW() WHERE id = ?',
      [draftRow.exclus_json, game.roundNumber || null, draftRow.id],
    );
    await ecrirePartsSuggereesTx(tx, draftRow.id, suggested, actorPlayerId);
  });
  draftRow.cast_round_number = game.roundNumber || null;
  return true;
}

const DRAFT_SELECT_COLS = `id, game_id, team_id, roster_scope, spell_code, status, approval_required,
            created_by_player_id,
            created_by_actor_type, created_by_actor_id,
            launched_by_player_id, launched_by_actor_type, launched_by_actor_id,
            created_at, updated_at, cast_at, submitted_at,
            decided_by_actor_type, decided_by_actor_id, decided_at,
            effect_applied_at, effect_applied_by_actor_type, effect_applied_by_actor_id,
            cast_round_number, effect_params_json, partner_team_id, player_id, ressource_choisie,
            exclus_json`;

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
  // Escalier du chapitre 1 (M8) : un sort d'une marche pas encore montée ne se prépare pas,
  // pour le prof comme pour l'équipe.
  if (game.tenir && !sortOuvert(game.resolved, spell.spellCode)) {
    throw makeHttpError('SPELL_ESCALIER', 409);
  }
  assertTenirSurfacePermission(game, spell, auth);

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
    // Sort à limite par élève : il engage UN élève — jamais depuis la tablette de l'équipe.
    if (limite?.portee === 'eleve' && isTablette(auth)) {
      throw makeHttpError('SPELL_COMPTE_ELEVE', 403);
    }
    if (limite?.portee === 'eleve') {
      // Seul le prof engage un autre élève que lui-même : un compte élève qui désigne un
      // camarade contournait sa propre limite et épuisait celle de l'autre (et, pour Héritage,
      // en faisait le légataire).
      const demande = Number(options.playerId) || null;
      if (!isStaff(auth) && demande && demande !== Number(actorPlayerId)) {
        throw makeHttpError('SPELL_COMPTE_ELEVE', 403);
      }
      scopePlayerId = (isStaff(auth) ? demande : null) || actorPlayerId || null;
      if (!scopePlayerId) throw makeHttpError('SPELL_LIMITE_ELEVE', 400);
    }
    await assertTenirWindowAndLimit(game, {
      spell,
      teamId: resolvedTeamId,
      partnerTeamId,
      playerId: scopePlayerId,
    });
  }
  const required = await requiredFor(game, spell, {
    teamId: Number(team.id),
    teamType: team.type,
    ressourceChoisie,
  });
  if (
    required.gems === 0 &&
    required.hearts === 0 &&
    !(await cordeeOfferte(game, spell, team.id))
  ) {
    throw makeHttpError('SPELL_ZERO_COST', 400);
  }
  // Restriction de peuple : refus immédiat quand le roster est celui d'une seule
  // équipe. En roster `game` (MJ), le contrôle se fait contributeur par contributeur —
  // toutes les équipes sont présentes, seules certaines peuvent alimenter le sort.
  if (!tenirV2 && rosterScope === 'team') assertTeamCasterKindAllowed(spell, team.type);

  const tablette = isTablette(auth);
  const playerTeamId = tablette
    ? actor.teamId
    : auth.userType === 'gl_player'
      ? await getPlayerTeamIdForGame(gameId, actorPlayerId)
      : null;
  if (auth.userType === 'gl_player' || tablette) {
    if (playerTeamId == null) throw makeHttpError('PLAYER_NOT_IN_GAME', 403);
    if (!Number.isFinite(Number(teamId)) || Number(teamId) <= 0) {
      throw makeHttpError('TEAM_NOT_FOUND', 404);
    }
  }
  // Une tablette d'équipe ne lance que pour SON équipe, quel que soit le réglage de portée.
  if (tablette && Number(resolvedTeamId) !== Number(playerTeamId)) {
    throw makeHttpError('TEAM_FORBIDDEN', 403);
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
  } else {
    if (effectParamsChanged(draft, options.effectParams)) {
      await execute(
        'UPDATE gl_spell_cast_drafts SET effect_params_json = ?, updated_at = NOW() WHERE id = ?',
        [JSON.stringify(options.effectParams), draft.id],
      );
      draft.effect_params_json = JSON.stringify(options.effectParams);
    }
    // Pot repris : ses parts suivent les présents d'aujourd'hui, pas ceux du jour où il est né.
    if (tenirV2) await realignerPotSurLesPresents(game, draft, spell, required, actorPlayerId);
  }

  const roster = await loadDraftRoster(gameId, draft, spell);
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
  const roster = await loadDraftRoster(gameId, draft, spell);
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
    const roster = await loadDraftRoster(gameId, draft, spell);
    out.push(await formatDraftPayload(draft, spell, roster, { game }));
  }
  return out;
}

async function updateDraftContributions({ gameId, draftId, contributions, auth, config }) {
  const actor = resolveActorContext(auth);
  const actorPlayerId = actor.playerId ?? Number(auth.userId);
  const draft = await queryOne(
    `SELECT id, game_id, team_id, roster_scope, spell_code, status, created_by_player_id,
            partner_team_id, ressource_choisie, exclus_json
       FROM gl_spell_cast_drafts
      WHERE id = ? AND game_id = ?
      LIMIT 1`,
    [draftId, gameId],
  );
  if (!draft) throw makeHttpError('DRAFT_NOT_FOUND', 404);
  if (String(draft.status) !== 'collecting') throw makeHttpError('DRAFT_NOT_COLLECTING', 409);
  // Lot 2 : sur la tablette de l'équipe, plus aucune saisie de part (« pas moi » suffit).
  if (isTablette(auth)) throw makeHttpError('CONTRIBUTION_TABLETTE', 403);

  const game = await loadGameContext(gameId);
  if (!game || game.status !== 'live') throw makeHttpError('GAME_NOT_LIVE', 409);
  assertTurnAllowsTeam(game, draft.team_id, config);
  // Lot 2 (« Tenir à deux ») : avec un compte élève, la saisie reste possible, mais seule
  // l'équipe lanceuse (ou sa partenaire de pacte) règle son pot.
  const spell = await loadSpellForChapter(draft.spell_code, game.chapterId);
  if (!spell) throw makeHttpError('SPELL_NOT_IN_CHAPTER', 400);
  // (une Cordée offerte a une partenaire, mais elle ne paie rien : elle ne règle pas ce pot)
  await assertActeurDuPot(game, draft, spell, auth, { playerId: actorPlayerId });
  // Seuls les présents versent : ni absent, ni élève en retrait, ni « pas moi ».
  const dansLePot =
    game.tenir && spell.tenirV2
      ? (await presentsDuPot(game, draft, spell)).filter(
          (id) => !parseExclus(draft.exclus_json).includes(id),
        )
      : null;

  const roster = await loadDraftRoster(gameId, draft, spell);
  const rosterById = new Map(roster.map((r) => [r.playerId, r]));
  const list = Array.isArray(contributions) ? contributions : [];
  const teamRow = roster.find((r) => Number(r.teamId) === Number(draft.team_id));
  const requiredForDraft = await requiredFor(game, spell, {
    teamId: Number(draft.team_id),
    teamType: teamRow?.teamType || null,
    ressourceChoisie: draft.ressource_choisie || null,
  });
  const pacte = game.tenir && spell.tenirV2 && String(spell.ressource) === 'pacte';

  const writes = [];
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
    if (dansLePot && (gems > 0 || hearts > 0) && !dansLePot.includes(playerId)) {
      throw makeHttpError('CONTRIBUTION_HORS_POT', 409);
    }
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
    writes.push([draftId, playerId, gems, hearts, actorPlayerId]);
  }

  // Écriture sous le verrou du brouillon, statut relu : sans cela, une saisie validée pendant
  // un lancement concurrent s'écrivait APRÈS le débit, sur un pot déjà `cast` — et le
  // remboursement (qui relit ces parts) rendait plus que ce qui avait été payé.
  if (writes.length) {
    await withTransaction(async (tx) => {
      const locked = await tx.queryOne(
        'SELECT status FROM gl_spell_cast_drafts WHERE id = ? LIMIT 1 FOR UPDATE',
        [draftId],
      );
      if (!locked || String(locked.status) !== 'collecting') {
        throw makeHttpError('DRAFT_NOT_COLLECTING', 409);
      }
      for (const params of writes) {
        await tx.execute(
          `INSERT INTO gl_spell_cast_contributions
            (draft_id, player_id, gems, hearts, updated_by_player_id, updated_at)
           VALUES (?, ?, ?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE
             gems = VALUES(gems),
             hearts = VALUES(hearts),
             updated_by_player_id = VALUES(updated_by_player_id),
             updated_at = NOW()`,
          params,
        );
      }
    });
  }

  return getDraftById(draftId, gameId);
}

/**
 * « Pas moi » (lot 2) : un membre présent se retire du pot, ou y revient (« remettre »). Le
 * partage se recalcule sur les présents non exclus — réserve d'abord, parts égales, reste au
 * plus riche, jamais au-delà d'un solde. Si le reste ne couvre plus le coût, le pot est
 * incomplet et le lancement sera refusé sans rien débiter.
 *
 * Qui peut : l'élève pour lui-même, la tablette de l'équipe « au nom de » (`playerId` déjà
 * vérifié présent par la route), le prof.
 * @throws 403 `EXCLUSION_FORBIDDEN`, 409 `EXCLUSION_ABSENT`, 409 `DRAFT_NOT_COLLECTING`
 */
async function setDraftExclusion({ gameId, draftId, playerId, exclu, auth }) {
  const actor = resolveActorContext(auth);
  const draft = await queryOne(
    `SELECT ${DRAFT_SELECT_COLS} FROM gl_spell_cast_drafts WHERE id = ? AND game_id = ? LIMIT 1`,
    [draftId, gameId],
  );
  if (!draft) throw makeHttpError('DRAFT_NOT_FOUND', 404);
  if (String(draft.status) !== 'collecting') throw makeHttpError('DRAFT_NOT_COLLECTING', 409);
  const game = await loadGameContext(gameId);
  if (!game || game.status !== 'live') throw makeHttpError('GAME_NOT_LIVE', 409);
  const target = Number(playerId);
  if (!Number.isInteger(target) || target <= 0) throw makeHttpError('PLAYER_NOT_ON_ROSTER', 400);
  if (!isStaff(auth)) {
    if (isTablette(auth)) {
      if (Number(actor.teamId) !== Number(draft.team_id)) {
        throw makeHttpError('EXCLUSION_FORBIDDEN', 403);
      }
    } else if (Number(actor.playerId) !== target) {
      throw makeHttpError('EXCLUSION_FORBIDDEN', 403);
    }
  }
  const spell = await loadSpellForChapter(draft.spell_code, game.chapterId);
  if (!spell) throw makeHttpError('SPELL_NOT_IN_CHAPTER', 400);
  const presents = await presentsDuPot(game, draft, spell);
  if (!presents.includes(target)) throw makeHttpError('EXCLUSION_ABSENT', 409);
  const exclus = new Set(parseExclus(draft.exclus_json));
  if (exclu) exclus.add(target);
  else exclus.delete(target);
  draft.exclus_json = JSON.stringify([...exclus].sort((a, b) => a - b));
  const roster = await loadDraftRoster(gameId, draft, spell);
  const teamRow = roster.find((r) => Number(r.teamId) === Number(draft.team_id));
  const required = await requiredFor(game, spell, {
    teamId: Number(draft.team_id),
    teamType: teamRow?.teamType || null,
    ressourceChoisie: draft.ressource_choisie || null,
  });
  const suggested = await buildSuggestedContributions(game, { draftRow: draft, spell, required });
  await withTransaction(async (tx) => {
    const locked = await tx.queryOne(
      'SELECT status FROM gl_spell_cast_drafts WHERE id = ? LIMIT 1 FOR UPDATE',
      [draftId],
    );
    if (String(locked?.status) !== 'collecting') throw makeHttpError('DRAFT_NOT_COLLECTING', 409);
    await tx.execute(
      'UPDATE gl_spell_cast_drafts SET exclus_json = ?, updated_at = NOW() WHERE id = ?',
      [draft.exclus_json, draftId],
    );
    await ecrirePartsSuggereesTx(tx, draftId, suggested, actor.playerId);
  });
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
/**
 * Cordée offerte (lot 2) : au passage en `souffle`, avant l'avance du voile — si l'une des deux
 * équipes encordées n'a pas jeté, la cordée ne s'est pas faite : remboursement intégral de la
 * lanceuse, plus de protection contre le voile, évènement `spell_rembourse`. Au Seuil
 * (`depuis: true`), les cordées du tour en cours et celles prévues pour un tour à venir (effet au
 * prochain tour, ensemble unifié M6) sont rendues de la même façon.
 * @returns {Promise<Array>} évènements à émettre
 */
async function rembourserCordeesIncompletesTx(tx, { gameId, roundNumber, depuis = false }) {
  if (!(Number(roundNumber) > 0)) return [];
  // Verrou de TOUTES les équipes, par id croissant, AVANT les lignes de cordée.
  // `appliquerJetTx` verrouille d'abord l'équipe qui jette, puis la cordée : le même ordre
  // évite l'interblocage. La lecture est verrouillée parce que `changerPhaseTx` a déjà ouvert
  // son instantané (REPEATABLE READ, première lecture = la partie) avant d'arriver ici, souvent
  // après `confirmerArriveesTx`. Un SELECT simple renverrait cet instantané et ignorerait un
  // jet commité entre-temps : la cordée serait rendue alors que les deux équipes ont déjà
  // avancé du meilleur des deux jets, et la lanceuse récupérerait son coût.
  const lockedTeams = await tx.queryAll(
    `SELECT id, name, last_dice_round_number FROM gl_teams
      WHERE game_id = ? ORDER BY id ASC FOR UPDATE`,
    [gameId],
  );
  const jetById = new Map(lockedTeams.map((t) => [Number(t.id), t]));
  const cordees = await tx.queryAll(
    `SELECT id, round_number, team_id, source_team_id, payload_json FROM gl_game_tenir_effets
      WHERE game_id = ? AND round_number ${depuis ? '>=' : '='} ? AND kind = 'cordee'
      ORDER BY id ASC FOR UPDATE`,
    [gameId, roundNumber],
  );
  const { insertGameEvent } = require('./glGameEvents');
  const events = [];
  for (const row of cordees) {
    const teamIds = [Number(row.team_id), Number(row.source_team_id)].filter((n) => n > 0);
    const jets = teamIds.map((id) => jetById.get(id)).filter(Boolean);
    // Une cordée prévue pour un tour à venir (ensemble unifié : effet au prochain tour) n'est
    // jamais « faite » à la clôture : elle est rendue.
    const tourCordee = Number(row.round_number ?? roundNumber);
    const toutesOntJete =
      tourCordee <= Number(roundNumber) &&
      jets.length === teamIds.length &&
      jets.every((t) => Number(t.last_dice_round_number) >= tourCordee);
    if (toutesOntJete) continue;
    // La protection contre le voile tombe avec la cordée (`lib/glVoile.js › hasCordee`).
    await tx.execute("UPDATE gl_game_tenir_effets SET kind = 'cordee_rendue' WHERE id = ?", [
      row.id,
    ]);
    const draftId = Number(parseJsonSafe(row.payload_json)?.draftId) || null;
    if (!draftId) continue;
    let rendu;
    try {
      rendu = await rembourserCastTx(tx, { gameId, draftId });
    } catch (err) {
      // Déjà rendu (refus du prof, double passage) : rien de plus à faire.
      if (err?.message === 'DRAFT_NOT_CAST' || err?.message === 'DRAFT_NOT_FOUND') continue;
      throw err;
    }
    const spellRow = await tx.queryOne('SELECT nom FROM gl_spells WHERE spell_code = ? LIMIT 1', [
      rendu.spellCode,
    ]);
    events.push(
      await insertGameEvent(tx, {
        gameId,
        teamId: rendu.teamId,
        actorType: 'system',
        eventType: 'spell_rembourse',
        payload: {
          draftId,
          spellCode: rendu.spellCode,
          spellName: spellRow?.nom ? String(spellRow.nom) : null,
          motif: 'cordee',
          partnerTeamId: Number(row.source_team_id) || null,
          roundNumber: Number(roundNumber),
        },
      }),
    );
  }
  return events;
}

async function finalizeCastTx(
  tx,
  { gameId, draftId, draft, spell, contributions, roster, actor, game = null, coverage = null },
) {
  const activeContribs = contributions.filter((c) => c.gems > 0 || c.hearts > 0);
  const rosterById = new Map(roster.map((r) => [r.playerId, r]));
  const results = [];
  const reserveParts = [];

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
  // Les parts ont été lues hors verrou par l'appelant : une saisie ou un « pas moi » arrivé
  // entre-temps ferait débiter autre chose que ce que la table garde (et le remboursement relit
  // la table). Sous le verrou du brouillon, elles doivent être identiques ; sinon refus propre,
  // rien n'est débité, le pot se relit et se relance.
  const lockedContribs = (
    await tx.queryAll(
      `SELECT player_id, gems, hearts FROM gl_spell_cast_contributions
        WHERE draft_id = ? AND (gems > 0 OR hearts > 0) ORDER BY player_id ASC`,
      [draftId],
    )
  ).map((r) => `${Number(r.player_id)}:${Number(r.gems) || 0}:${Number(r.hearts) || 0}`);
  const expectedContribs = [...activeContribs]
    .sort((a, b) => a.playerId - b.playerId)
    .map((c) => `${c.playerId}:${c.gems}:${c.hearts}`);
  if (lockedContribs.join('|') !== expectedContribs.join('|')) {
    throw makeHttpError('DRAFT_CHANGED', 409);
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

  // E4 : la réserve de la caravane paie en premier (une réserve consommée entre-temps par un
  // autre lancement rend le pot insuffisant : refus, rien n'est débité).
  for (const part of coverage?.parTeam || []) {
    const taken = await debitReserveTx(tx, {
      gameId,
      teamId: part.teamId,
      dh: part.hearts,
      dg: part.gems,
      cause: 'reserve_sortie',
    });
    if (!taken || -taken.dhApplied !== part.hearts || -taken.dgApplied !== part.gems) {
      throw makeHttpError('INSUFFICIENT_BALANCE', 409);
    }
    reserveParts.push({ teamId: part.teamId, hearts: part.hearts, gems: part.gems });
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
    // E4 : part payée par la réserve de la caravane (par équipe).
    reserve: reserveParts,
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
  // Garde-fou § 1.6 (banc du 8 novembre 2026) : en partie « tenir », les contributions, les
  // noms des lanceurs et les soldes après débit sont privés — une autre équipe (et la
  // projection) ne voit que le sort, l'équipe, le coût et la part de la réserve ; le prof
  // relit la version complète (`redactGameEventsForViewer`).
  if (game?.tenir) {
    eventPayload.private = true;
    eventPayload.publicKeys = [
      'spellCode',
      'spellName',
      'spellEmoji',
      'teamId',
      'rosterScope',
      'spellEffectShort',
      'draftId',
      'cost',
      'reserve',
    ];
  }

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

/**
 * Rembourse un sort lancé (« Tenir à deux », lot 2) : chaque contribution retourne à sa bourse
 * et la part de la réserve retourne à la réserve (grand livre, cause `sort_rembourse`). Le
 * brouillon passe `rembourse` : il ne compte plus dans les limites (`assertLimite` ne lit que
 * `cast`). Une seule fonction pour le refus du prof et la Cordée sans objet.
 *
 * À appeler dans la transaction de l'appelant ; l'évènement de journal (`spell_refuse`,
 * `spell_rembourse`) est écrit par lui.
 *
 * @returns {Promise<{ draftId: number, teamId: number, spellCode: string,
 *   contributions: Array<{ playerId, gems, hearts }>, reserve: Array<{ teamId, gems, hearts }> }>}
 * @throws 404 `DRAFT_NOT_FOUND`, 409 `DRAFT_NOT_CAST` (pas lancé, ou déjà remboursé)
 */
async function rembourserCastTx(tx, { gameId, draftId, sauterSiResolu = false }) {
  const draft = await tx.queryOne(
    `SELECT id, game_id, team_id, spell_code, status, effect_applied_at FROM gl_spell_cast_drafts
      WHERE id = ? AND game_id = ? LIMIT 1 FOR UPDATE`,
    [draftId, gameId],
  );
  if (!draft) throw makeHttpError('DRAFT_NOT_FOUND', 404);
  // Retraits en masse (clôture du tour, sorts sans objet) : leur liste vient d'une lecture
  // non verrouillée. Sous verrou, un sort dont l'effet vient d'être appliqué par le prof, ou
  // qui vient d'être refusé / remboursé, est laissé tel quel au lieu d'être rendu (l'équipe
  // aurait gardé l'effet ET ses ressources) ou de faire échouer tout le changement de phase.
  if (sauterSiResolu && (String(draft.status) !== 'cast' || draft.effect_applied_at)) return null;
  if (String(draft.status) !== 'cast') throw makeHttpError('DRAFT_NOT_CAST', 409);
  const contributions = (
    await tx.queryAll(
      `SELECT c.player_id, c.gems, c.hearts, tm.team_id
         FROM gl_spell_cast_contributions c
         LEFT JOIN gl_team_members tm ON tm.player_id = c.player_id AND tm.game_id = ?
        WHERE c.draft_id = ? AND (c.gems > 0 OR c.hearts > 0)
        ORDER BY c.player_id ASC`,
      [gameId, draftId],
    )
  ).map((c) => ({
    playerId: Number(c.player_id),
    gems: Number(c.gems) || 0,
    hearts: Number(c.hearts) || 0,
    teamId: c.team_id != null ? Number(c.team_id) : Number(draft.team_id),
  }));
  // Part payée par la réserve : portée par l'évènement `spell_cast` du lancement.
  const cast = await tx.queryOne(
    `SELECT payload_json FROM gl_game_events
      WHERE game_id = ? AND event_type = 'spell_cast'
        AND JSON_EXTRACT(payload_json, '$.draftId') = ?
      ORDER BY id DESC LIMIT 1`,
    [gameId, Number(draftId)],
  );
  const reserve = (parseJsonSafe(cast?.payload_json)?.reserve || [])
    .map((r) => ({
      teamId: Number(r.teamId),
      gems: Number(r.gems) || 0,
      hearts: Number(r.hearts) || 0,
    }))
    .filter((r) => r.teamId > 0 && (r.gems > 0 || r.hearts > 0));

  for (const c of contributions) {
    // Une bourse remplie entre-temps : le surplus du remboursement va à la réserve de
    // l'équipe (rien ne se perd, invariant `LIVRE_TOTAL`).
    await applyPlayerVitalityDelta(tx, {
      playerId: c.playerId,
      healthDelta: c.hearts,
      powerDelta: c.gems,
      cause: 'sort_rembourse',
      gameId,
      reserveTeamId: c.teamId,
    });
  }
  for (const r of reserve) {
    await creditReserveTx(tx, {
      gameId,
      teamId: r.teamId,
      dh: r.hearts,
      dg: r.gems,
      cause: 'reserve_entree',
    });
  }
  const updated = await tx.execute(
    `UPDATE gl_spell_cast_drafts SET status = 'rembourse', updated_at = NOW()
      WHERE id = ? AND status = 'cast'`,
    [draftId],
  );
  if (!updated.affectedRows) throw makeHttpError('DRAFT_NOT_CAST', 409);
  return {
    draftId: Number(draftId),
    teamId: Number(draft.team_id),
    spellCode: String(draft.spell_code),
    contributions: contributions.map(({ playerId, gems, hearts }) => ({ playerId, gems, hearts })),
    reserve,
  };
}

/**
 * Lot 2 (second défaut relevé par le banc) : un sort en file qui visait une page pâlie
 * (« Nommer ») n'a plus d'objet quand cette page est réparée entre-temps. Sa ligne se retire
 * seule de la file du prof et le sort est rendu à l'équipe (remboursement exact) — personne
 * n'attend un geste devenu impossible, personne ne paie pour rien.
 * @returns {Promise<Array>} évènements `spell_rembourse` à émettre
 */
async function retirerSortsSansObjetTx(tx, { gameId, zoneKey, saufDraftId = null }) {
  if (!zoneKey) return [];
  let rows = [];
  try {
    rows = await tx.queryAll(
      `SELECT d.id, d.team_id, d.spell_code, s.nom
         FROM gl_spell_cast_drafts d
         LEFT JOIN gl_spells s ON s.spell_code = d.spell_code
        WHERE d.game_id = ? AND d.status = 'cast' AND d.effect_applied_at IS NULL
          AND JSON_UNQUOTE(JSON_EXTRACT(COALESCE(d.effect_params_json, '{}'), '$.zoneKey')) = ?
        ORDER BY d.id ASC`,
      [gameId, String(zoneKey)],
    );
  } catch (err) {
    if (err?.errno === 1146 || err?.code === 'ER_NO_SUCH_TABLE') return [];
    throw err;
  }
  const { insertGameEvent } = require('./glGameEvents');
  const { resoudreDemandeTx } = require('./glDemandes');
  const events = [];
  for (const row of rows) {
    if (saufDraftId != null && Number(row.id) === Number(saufDraftId)) continue;
    const rendu = await rembourserCastTx(tx, {
      gameId,
      draftId: Number(row.id),
      sauterSiResolu: true,
    });
    if (!rendu) continue;
    await resoudreDemandeTx(tx, {
      gameId,
      kind: 'nommer',
      refId: Number(row.id),
      statut: 'annulee',
    });
    events.push(
      await insertGameEvent(tx, {
        gameId,
        teamId: Number(row.team_id),
        actorType: 'system',
        eventType: 'spell_rembourse',
        payload: {
          draftId: Number(row.id),
          spellCode: String(row.spell_code),
          spellName: row.nom ? String(row.nom) : null,
          motif: 'page_reparee',
          zoneKey: String(zoneKey),
        },
      }),
    );
  }
  return events;
}

/**
 * Lot 2 — « Refuser et rembourser » : le prof refuse un sort lancé dont l'effet n'est pas encore
 * appliqué (sort en file : Question, Pause, Nommer…). Remboursement exact (contributions et
 * réserve), statut `rembourse` (il ne compte plus dans la limite : relançable), évènement
 * `spell_refuse` avec le mot du prof, visible de l'équipe.
 * @throws 404 `DRAFT_NOT_FOUND`, 409 `DRAFT_NOT_CAST`, 409 `EFFECT_ALREADY_APPLIED`
 */
async function refuserCast({ gameId, draftId, auth, mot = null }) {
  const actor = resolveActorContext(auth);
  const { insertGameEvent } = require('./glGameEvents');
  const { resoudreDemandeTx } = require('./glDemandes');
  const texte = String(mot || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  let event = null;
  let rendu = null;
  await withTransaction(async (tx) => {
    const draft = await tx.queryOne(
      `SELECT d.id, d.team_id, d.spell_code, d.status, d.effect_applied_at, s.nom
         FROM gl_spell_cast_drafts d
         LEFT JOIN gl_spells s ON s.spell_code = d.spell_code
        WHERE d.id = ? AND d.game_id = ? LIMIT 1 FOR UPDATE`,
      [draftId, gameId],
    );
    if (!draft) throw makeHttpError('DRAFT_NOT_FOUND', 404);
    if (String(draft.status) !== 'cast') throw makeHttpError('DRAFT_NOT_CAST', 409);
    if (draft.effect_applied_at) throw makeHttpError('EFFECT_ALREADY_APPLIED', 409);
    rendu = await rembourserCastTx(tx, { gameId, draftId });
    for (const kind of ['sort_a_appliquer', 'nommer']) {
      await resoudreDemandeTx(tx, { gameId, kind, refId: Number(draftId), statut: 'annulee' });
    }
    event = await insertGameEvent(tx, {
      gameId,
      teamId: Number(draft.team_id),
      actorType: actor.actorType,
      actorId: actor.actorId,
      eventType: 'spell_refuse',
      payload: {
        draftId: Number(draftId),
        spellCode: String(draft.spell_code),
        spellName: draft.nom ? String(draft.nom) : null,
        ...(texte ? { mot: texte } : {}),
      },
    });
  });
  return { draftId: Number(draftId), teamId: rendu.teamId, spellCode: rendu.spellCode, event };
}

/** Fenêtres d'un sort qui n'a de sens que pendant le tour (les autres attendent l'activité). */
const FENETRES_DU_TOUR = Object.freeze(['jeu', 'jeu_avant_fouille', 'avant_jet', 'apres_jet']);

/**
 * Garde-fou 11 (lot 2) : aucun sort du prof ne reste en attente sans sortie. Un sort lancé dont
 * l'effet n'a pas été appliqué est rendu à son équipe (remboursement exact, évènement
 * `spell_rembourse`, ligne de la file fermée) :
 * - à la **clôture du tour** pour un sort du tour (`fenetres: FENETRES_DU_TOUR`, ex. Nommer) ;
 * - à l'ouverture du tour suivant et au Seuil pour tous les autres (un sort d'activité —
 *   Question, Pause, Musique… — s'applique après le tour, pendant l'activité de classe).
 * @param {object} p
 * @param {string[]|null} [p.fenetres] ne rendre que les sorts de ces fenêtres (défaut : tous)
 * @returns {Promise<Array>} évènements à émettre
 */
async function rendreSortsEnAttenteTx(tx, { gameId, motif, fenetres = null }) {
  const filtre = Array.isArray(fenetres) && fenetres.length ? fenetres.map(String) : null;
  const rows = await tx.queryAll(
    `SELECT d.id, d.team_id, d.spell_code, s.nom
       FROM gl_spell_cast_drafts d
       INNER JOIN gl_spells s ON s.spell_code = d.spell_code AND s.tenir_v2 = 1
      WHERE d.game_id = ? AND d.status = 'cast' AND d.effect_applied_at IS NULL
        ${filtre ? `AND s.fenetre IN (${filtre.map(() => '?').join(', ')})` : ''}
      ORDER BY d.id ASC`,
    filtre ? [gameId, ...filtre] : [gameId],
  );
  const { insertGameEvent } = require('./glGameEvents');
  const demandes = require('./glDemandes');
  const events = [];
  for (const row of rows) {
    const rendu = await rembourserCastTx(tx, {
      gameId,
      draftId: Number(row.id),
      sauterSiResolu: true,
    });
    if (!rendu) continue;
    for (const kind of ['sort_a_appliquer', 'nommer']) {
      await demandes.resoudreDemandeTx(tx, {
        gameId,
        kind,
        refId: Number(row.id),
        statut: 'annulee',
      });
    }
    events.push(
      await insertGameEvent(tx, {
        gameId,
        teamId: Number(row.team_id),
        actorType: 'system',
        eventType: 'spell_rembourse',
        payload: {
          draftId: Number(row.id),
          spellCode: String(row.spell_code),
          spellName: row.nom ? String(row.nom) : null,
          motif: String(motif || 'seance_suivante'),
        },
      }),
    );
  }
  return events;
}

/**
 * Lot 2 — sorts d'une équipe rangés par moment du tour (`src/shared/glSortMomentsCore.js`).
 * Chaque sort ouvert au chapitre et compatible avec le peuple de l'équipe reste visible : hors
 * fenêtre (ou limite atteinte, ou réservé au prof sur cette surface), il est servi `ouvert:
 * false` avec le message à afficher. Mêmes contrôles qu'au lancement — la vérité est ici.
 * @returns {Promise<{ teamId: number, moments: Array }>}
 */
async function buildSortsParMoment({ gameId, teamId }) {
  const { rangerSortsParMoment } = require('./shared/glSortMomentsCore');
  const { loadSpellsForChapterIds } = require('./glChapterSpells');
  const game = await loadGameContext(gameId);
  if (!game?.tenir) return { teamId: Number(teamId), moments: [] };
  const team = await queryOne(
    'SELECT id, type FROM gl_teams WHERE id = ? AND game_id = ? LIMIT 1',
    [teamId, gameId],
  );
  if (!team) throw makeHttpError('TEAM_NOT_FOUND', 404);
  const peupleEquipe = resourceOfPeople(team.type) === 'power' ? 'unicorn' : 'gnome';
  const catalogue =
    (await loadSpellsForChapterIds({ queryAll }, [game.chapterId])).get(Number(game.chapterId)) ||
    [];
  const round = game.roundNumber
    ? await require('./glTour').loadRoundView({ queryAll, queryOne }, game.id, game.roundNumber)
    : null;
  const eleve = { userType: 'gl_player', permissions: [] };
  // M6 : l'écran ne montre que ce qui est payable — bourses des membres et réserve de l'équipe.
  const bourses = await queryOne(
    `SELECT COALESCE(SUM(p.health_points), 0) AS h, COALESCE(SUM(p.power_points), 0) AS g
       FROM gl_team_members tm INNER JOIN gl_players p ON p.id = tm.player_id
      WHERE tm.game_id = ? AND tm.team_id = ?`,
    [gameId, teamId],
  );
  let reserve = { health: 0, power: 0 };
  try {
    const r = await require('./glBourses').loadReserve({ queryOne }, gameId, Number(teamId));
    if (r) reserve = { health: Number(r.health) || 0, power: Number(r.power) || 0 };
  } catch (_) {
    reserve = { health: 0, power: 0 };
  }
  const dispo = {
    hearts: (Number(bourses?.h) || 0) + reserve.health,
    gems: (Number(bourses?.g) || 0) + reserve.power,
  };
  const sorts = [];
  for (const c of catalogue) {
    if (!c.tenir_v2 || c.statut !== 'officiel') continue;
    const peuple = String(c.peuple || 'any');
    if (peuple === 'classe') continue;
    if ((peuple === 'gnome' || peuple === 'unicorn') && peuple !== peupleEquipe) continue;
    // Escalier du chapitre 1 (M8) : un sort pas encore ouvert n'est pas montré (jamais grisé).
    if (!sortOuvert(game.resolved, c.spell_code)) continue;
    const spell = {
      spellCode: c.spell_code,
      tenirV2: true,
      fenetre: c.fenetre,
      limiteJson: c.limite ? JSON.stringify(c.limite) : null,
    };
    let ouvert = true;
    let message = null;
    try {
      assertTenirSurfacePermission(game, spell, eleve);
      await assertTenirWindowAndLimit(game, { spell, teamId: Number(teamId), round });
    } catch (err) {
      // Limite par élève : elle se joue au lancement, avec l'élève qui lance.
      if (err?.code !== 'SPELL_LIMITE_ELEVE') {
        ouvert = false;
        const connu = resolveSpellCastError(err);
        message = connu?.error || err?.message || fenetreMessage(c.fenetre);
      }
    }
    const full = {
      ...spell,
      cout: c.cout,
      ressource: c.ressource,
    };
    const offerte = await cordeeOfferte(game, full, Number(teamId));
    const besoin = offerte
      ? { gems: 0, hearts: 0 }
      : String(c.ressource) === 'choix'
        ? null
        : resolveRequired(full, { teamType: team.type });
    const cout = Math.max(0, Number(c.cout) || 0);
    const payable = besoin
      ? dispo.gems >= besoin.gems && dispo.hearts >= besoin.hearts
      : dispo.gems >= cout || dispo.hearts >= cout;
    if (!ouvert || !payable) continue;
    sorts.push({
      code: c.spell_code,
      nom: c.nom,
      emoji: c.emoji,
      cout: offerte ? 0 : c.cout,
      ressource: c.ressource,
      fenetre: c.fenetre,
      execution: c.execution,
      effetCourt: c.effet_court || null,
      ouvert,
      payable,
      offerte,
      message,
    });
  }
  return { teamId: Number(teamId), moments: rangerSortsParMoment(sorts) };
}

async function launchDraft({ gameId, draftId, auth, config }) {
  const actor = resolveActorContext(auth);
  const draft = await queryOne(
    `SELECT id, game_id, team_id, roster_scope, spell_code, status, cast_round_number,
            effect_params_json, partner_team_id, player_id, ressource_choisie, exclus_json
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
  const launchRoster = await loadDraftRoster(gameId, draft, spell);
  const teamRow = launchRoster.find((r) => Number(r.teamId) === Number(draft.team_id));
  const required = await requiredFor(game, spell, {
    teamId: Number(draft.team_id),
    teamType: teamRow?.teamType || null,
    ressourceChoisie: draft.ressource_choisie || null,
  });
  const tenirV2 = game.tenir && spell.tenirV2;
  // Seule une équipe du pot le lance : l'identifiant d'un pot circule dans la salle.
  await assertActeurDuPot(game, draft, spell, auth, actor);
  if (tenirV2) {
    // Aucune part ne part au nom d'un absent : le pot est rejoué sur les présents.
    await realignerPotSurLesPresents(game, draft, spell, required, actor.playerId);
    // La surface a pu changer depuis le brouillon (« Tout au tableau ») : permission rejouée.
    assertTenirSurfacePermission(game, spell, auth);
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
  const coverage = await reserveCoverage(game, { draftRow: draft, spell, required });
  if (
    !isDraftReady(
      totals,
      required,
      coverage.covered,
      await cordeeOfferte(game, spell, Number(draft.team_id)),
    )
  ) {
    throw makeHttpError('DRAFT_NOT_READY', 409);
  }
  const activeContribs = contributions.filter((c) => c.gems > 0 || c.hearts > 0);
  if (!(tenirV2 && coverage.parTeam.length)) assertCastScope(spell, activeContribs);

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
        coverage,
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
  const roster = await loadDraftRoster(gameId, draft, spell);

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
  spell.required = await requiredFor(game, spell, {
    teamId: Number(draft.team_id),
    teamType: acceptTeamRow?.teamType || null,
    ressourceChoisie: draft.ressource_choisie || null,
  });
  const contributions = await loadContributions(draftId);
  const totals = sumContributions(contributions);
  const acceptCoverage = await reserveCoverage(game, {
    draftRow: draft,
    spell,
    required: spell.required,
  });
  if (
    !isDraftReady(
      totals,
      spell.required,
      acceptCoverage.covered,
      await cordeeOfferte(game, spell, Number(draft.team_id)),
    )
  ) {
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
        coverage: acceptCoverage,
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
    const roster = await loadDraftRoster(gameId, draft, spell);
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
      // `withTransaction` rejoue la fermeture sur interblocage : les évènements d'une tentative
      // annulée ne doivent pas être émis.
      extraEvents.length = 0;
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
      for (const kind of ['sort_a_appliquer', 'nommer']) {
        await require('./glDemandes').resoudreDemandeTx(tx, {
          gameId,
          kind,
          refId: Number(draftId),
        });
      }
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
        // Un autre Nommer visait la même page : sa ligne se retire, le sort est rendu.
        extraEvents.push(
          ...(await retirerSortsSansObjetTx(tx, {
            gameId,
            zoneKey: nommer.zoneKey,
            saufDraftId: draftId,
          })),
        );
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
    `SELECT id, game_id, team_id, status, created_by_player_id, created_by_actor_id
       FROM gl_spell_cast_drafts
      WHERE id = ? AND game_id = ?
      LIMIT 1`,
    [draftId, gameId],
  );
  if (!draft) throw makeHttpError('DRAFT_NOT_FOUND', 404);
  if (String(draft.status) !== 'collecting') throw makeHttpError('DRAFT_NOT_COLLECTING', 409);

  const canCancel =
    isStaff(auth) ||
    // La tablette de l'équipe ferme un pot de SON équipe, qui qu'ait ouvert ce pot.
    (isTablette(auth) && Number(actor.teamId) === Number(draft.team_id)) ||
    (actor.playerId != null && Number(draft.created_by_player_id) === Number(actor.playerId)) ||
    String(draft.created_by_actor_id) === actor.actorId;
  if (!canCancel) throw makeHttpError('CANCEL_FORBIDDEN', 403);

  // Garde atomique : un lancement concurrent a pu passer le pot en `cast` depuis la lecture
  // ci-dessus. Sans la condition de statut, l'annulation écrasait un sort déjà payé : plus de
  // remboursement possible (`DRAFT_NOT_CAST`), ligne de file sans sortie, limite non comptée.
  const cancelled = await execute(
    `UPDATE gl_spell_cast_drafts SET status = 'cancelled', updated_at = NOW()
      WHERE id = ? AND status = 'collecting'`,
    [draftId],
  );
  if (!cancelled.affectedRows) throw makeHttpError('DRAFT_NOT_COLLECTING', 409);
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
  setDraftExclusion,
  isTablette,
  launchDraft,
  rembourserCastTx,
  retirerSortsSansObjetTx,
  rembourserCordeesIncompletesTx,
  refuserCast,
  rendreSortsEnAttenteTx,
  FENETRES_DU_TOUR,
  buildSortsParMoment,
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
