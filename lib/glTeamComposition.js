'use strict';

/**
 * Orchestration de la composition automatique des équipes GL
 * (docs/GL_EQUIPES_AUTO_CONCEPTION.md) : lit la partie et la classe, prépare les entrées du
 * moteur pur (`lib/gl/teamComposition.js`), nomme / colore / mascotte les équipes
 * (`lib/gl/teamNaming.js`), puis applique la proposition dans une transaction.
 *
 * Deux temps, comme le veut le parcours MJ (§ 10) : `buildCompositionProposal` ne fait AUCUNE
 * écriture ; `applyComposition` revalide tout avant d'écrire. La proposition ne contient jamais
 * de score individuel (§ 11).
 */

const database = require('../database');
const { getGlMascotCatalog } = require('./glMascotCatalog');
const { assignPlayerToTeamTx, computeBalancedAssignments } = require('./glRoster');
const { insertGameEvent } = require('./glGameEvents');
const { emitGlGameEvent } = require('./realtime');
const {
  PROFILE_RECIPES,
  TEAM_POLICIES,
  DEFAULT_TEAM_POLICY,
  resolveWeights,
  createSeededRng,
  seedFromLabel,
  generateSeedLabel,
  computeComposition,
  scoreComposition,
  summarizePairs,
  summarizeRoles,
  buildPeopleStreaks,
  choosePeopleStart,
} = require('./gl/teamComposition');
const { loadPlayerProfiles } = require('./gl/teamProfileAxes');
const { getGameplaySettings } = require('./glSettings');
const {
  MASCOT_POOL_TOO_SMALL,
  buildTeamVocabulary,
  pickTeamNames,
  pickTeamColors,
  pickMascots,
  alternateTeamTypes,
} = require('./gl/teamNaming');
const {
  loadClassTeamHistory,
  buildPairHistory,
  computeMixingRate,
  DEFAULT_MAX_GAMES,
} = require('./glTeamCompositionHistory');
const { loadLocksForEngine } = require('./glClassPairingLocks');

const RECIPES = Object.freeze([
  'random',
  'random_memory',
  'carry_over',
  'mixed',
  'roles',
  'homogeneous',
]);
const DEFAULT_TEAM_SIZE = 4;
const MIN_TEAM_COUNT = 2;
const MAX_TEAM_COUNT = 13;
const TEAM_TYPES = Object.freeze(['gnome', 'unicorn']);
/** Plancher de vitalité par équipe (cœurs + gemmes), actif seulement si la vitalité est activée. */
const DEFAULT_VITALITY_FLOOR = 1;
const DEFAULT_VITALITY_WEIGHT = 1;

class GlTeamCompositionError extends Error {
  constructor(code, status, message) {
    super(message || code);
    this.name = 'GlTeamCompositionError';
    this.code = code;
    this.status = status;
  }
}

const MESSAGES = Object.freeze({
  GAME_NOT_FOUND: 'Partie introuvable',
  GAME_NOT_DRAFT: 'La composition automatique n’est possible que sur une partie en préparation',
  NOT_ENOUGH_PLAYERS: 'Au moins deux joueurs actifs sont nécessaires pour composer des équipes',
  INVALID_RECIPE: 'Recette de composition inconnue',
  INVALID_TEAM_COUNT: 'Nombre d’équipes invalide',
  INVALID_TEAM_SIZE: 'Taille d’équipe invalide',
  INVALID_MEMBER: 'Un joueur de la proposition n’appartient plus à la classe ou est en double',
  INVALID_TEAM: 'Équipe de la proposition invalide (nom, peuple ou membres)',
  TEAMS_NOT_EMPTY:
    'Des équipes avec des joueurs existent déjà : cocher « remplacer les équipes existantes »',
  TEAMS_EXIST: 'Des équipes existent déjà : cocher « remplacer les équipes existantes »',
  NO_PREVIOUS_GAME: 'Aucune partie précédente avec équipes : tirage aléatoire utilisé',
  MASCOT_POOL_TOO_SMALL:
    'Pas assez de mascottes typées disponibles : le nombre d’équipes a été réduit',
  INACTIVE_EXCLUDED: 'Joueurs inactifs laissés de côté',
  HOMOGENEOUS_WITH_SCORING:
    'La recette « groupes de besoin » est refusée quand le score par équipe est activé',
  PROFILE_RECIPES_DISABLED:
    'Les recettes fondées sur le profil des joueurs sont désactivées par l’administrateur',
  PROFILE_DATA_SPARSE:
    'Peu de données de jeu pour cette classe : les profils sont proches de la moyenne, le résultat reste largement aléatoire',
  INVALID_PINS: 'Épingles invalides (joueur hors du groupe ou équipe inexistante)',
  LOCKS_IGNORED: 'Des verrous de la classe concernent des joueurs absents du groupe : ignorés',
  LOCKS_UNSATISFIED:
    'Certains verrous de la classe n’ont pas pu être respectés (contraintes incompatibles)',
  POLICY_DEFAULT_RECIPE: 'Recette choisie d’après la politique d’équipes de la classe',
  PEOPLE_ROTATION:
    'Peuple de départ choisi pour limiter les troisièmes tours consécutifs dans le même peuple',
  VITALITY_FLOOR: 'Équipes sans aucun cœur ni gemme : le plancher de vitalité n’a pas pu être tenu',
});

function fail(code, status) {
  return new GlTeamCompositionError(code, status, MESSAGES[code] || code);
}

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function warning(code, extra = {}) {
  return { code, message: MESSAGES[code] || code, ...extra };
}

async function loadGame(queryOne, gameId) {
  const game = await queryOne(
    `SELECT g.id, g.class_id, g.status, g.chapter_id, g.name,
            c.title AS chapter_title, c.plateau_number,
            k.team_policy, k.team_size_default
       FROM gl_games g
       LEFT JOIN gl_chapters c ON c.id = g.chapter_id
       LEFT JOIN gl_classes k ON k.id = g.class_id
      WHERE g.id = ? LIMIT 1`,
    [gameId],
  );
  if (!game) throw fail('GAME_NOT_FOUND', 404);
  return game;
}

/**
 * Recette par défaut d'après la politique de la classe (§ 6). Pure.
 *  - carry_over            ⇒ reprise des équipes (repli aléatoire géré plus loin)
 *  - reshuffle_each        ⇒ aléatoire à mémoire (aléatoire simple sans historique)
 *  - reshuffle_per_plateau ⇒ reprise si la partie précédente était sur le même plateau, sinon
 *                            aléatoire à mémoire
 */
function resolveDefaultRecipe({ policy, history, plateauNumber }) {
  const p = TEAM_POLICIES.includes(String(policy || '')) ? String(policy) : DEFAULT_TEAM_POLICY;
  const games = Array.isArray(history) ? history : [];
  const previous = games.find((g) => g.teams.some((t) => t.memberIds.length > 0)) || null;
  if (p === 'carry_over') return previous ? 'carry_over' : 'random';
  if (p === 'reshuffle_per_plateau') {
    const plateau = plateauNumber != null ? Number(plateauNumber) : null;
    if (previous && plateau != null && previous.plateauNumber === plateau) return 'carry_over';
  }
  return previous ? 'random_memory' : 'random';
}

/** Épingles « ce joueur reste dans l'équipe N » venues de l'aperçu (jamais persistées). */
function normalizePins(rawPins, poolIds) {
  if (rawPins == null) return [];
  if (!Array.isArray(rawPins)) throw fail('INVALID_PINS', 400);
  const seen = new Set();
  const out = [];
  for (const raw of rawPins) {
    const playerId = toInt(raw?.playerId);
    const slot = toInt(raw?.slot ?? raw?.teamIndex);
    if (!playerId || slot == null || slot < 0 || !poolIds.has(playerId)) {
      throw fail('INVALID_PINS', 400);
    }
    if (seen.has(playerId)) continue;
    seen.add(playerId);
    out.push({ playerId, slot });
  }
  return out;
}

/** Vitalité par joueur (cœurs + gemmes) fusionnée aux profils éventuels, pour le plancher. */
function mergeVitalityProfiles(pool, profiles) {
  const out = new Map(profiles || []);
  for (const p of pool) {
    const existing = out.get(p.playerId) || {};
    out.set(p.playerId, { ...existing, hearts: p.hearts ?? 0, gems: p.gems ?? 0 });
  }
  return out;
}

async function loadClassPlayers(queryAll, classId) {
  const rows = await queryAll(
    `SELECT id, pseudo, first_name, last_name, is_active, health_points, power_points
       FROM gl_players
      WHERE class_id = ?
      ORDER BY last_name ASC, first_name ASC, id ASC`,
    [classId],
  );
  return rows.map((r) => ({
    playerId: Number(r.id),
    pseudo: r.pseudo || null,
    firstName: r.first_name || '',
    lastName: r.last_name || '',
    isActive: !!Number(r.is_active),
    hearts: r.health_points != null ? Number(r.health_points) : null,
    gems: r.power_points != null ? Number(r.power_points) : null,
  }));
}

async function loadExistingTeams(queryAll, gameId) {
  return queryAll(
    `SELECT t.id, t.name, t.type, t.color, t.mascot_id,
            (SELECT COUNT(*) FROM gl_team_members tm WHERE tm.team_id = t.id) AS member_count
       FROM gl_teams t
      WHERE t.game_id = ?
      ORDER BY t.id ASC`,
    [gameId],
  );
}

async function loadBiomeNames(queryAll, chapterId) {
  if (!chapterId) return [];
  const rows = await queryAll(
    `SELECT b.nom
       FROM gl_chapter_biomes cb
       INNER JOIN gl_biomes b ON b.slug = cb.biome_slug
      WHERE cb.chapter_id = ?
      ORDER BY cb.order_index ASC`,
    [chapterId],
  );
  return rows.map((r) => r.nom).filter(Boolean);
}

async function loadTypedMascotCatalog() {
  const catalog = await getGlMascotCatalog();
  return catalog
    .filter((m) => TEAM_TYPES.includes(String(m?.type || '').toLowerCase()))
    .map((m) => ({ id: String(m.id), type: String(m.type).toLowerCase(), label: m.label || m.id }));
}

/** Nombre d'équipes : explicite, sinon déduit de la taille visée ; borné. */
function resolveTeamCount({ teamCount, teamSize, playerCount }) {
  const explicit = toInt(teamCount);
  if (explicit != null) {
    if (explicit < 1) throw fail('INVALID_TEAM_COUNT', 400);
    return Math.min(explicit, playerCount, MAX_TEAM_COUNT);
  }
  const size = toInt(teamSize) ?? DEFAULT_TEAM_SIZE;
  if (size < 1) throw fail('INVALID_TEAM_SIZE', 400);
  const k = Math.round(playerCount / size);
  return Math.max(MIN_TEAM_COUNT, Math.min(Math.max(1, k), playerCount, MAX_TEAM_COUNT));
}

function normalizeRecipe(recipe) {
  const r = String(recipe || 'random').toLowerCase();
  if (!RECIPES.includes(r)) throw fail('INVALID_RECIPE', 400);
  return r;
}

/**
 * Construit une proposition (aucune écriture).
 *
 * @param {object} params
 * @param {number} params.gameId
 * @param {string} [params.recipe]  `random` | `random_memory` | `carry_over`
 * @param {number} [params.teamCount]
 * @param {number} [params.teamSize]  défaut 4 (ignoré si `teamCount`)
 * @param {string} [params.seed]  graine lisible ; générée sinon
 * @param {boolean} [params.includeInactive]
 * @param {{ queryOne?: Function, queryAll?: Function }} [deps]
 */
async function buildCompositionProposal(params, deps = {}) {
  const queryOne = deps.queryOne || database.queryOne;
  const queryAll = deps.queryAll || database.queryAll;
  const gameId = toInt(params.gameId);
  if (!gameId || gameId <= 0) throw fail('GAME_NOT_FOUND', 404);

  const game = await loadGame(queryOne, gameId);
  if (String(game.status) !== 'draft') throw fail('GAME_NOT_DRAFT', 409);

  const explicitRecipe =
    params.recipe != null && String(params.recipe).trim() !== ''
      ? normalizeRecipe(params.recipe)
      : null;
  const gameplay = await (deps.getGameplaySettings || getGameplaySettings)();
  const includeInactive = !!params.includeInactive;
  const allPlayers = await loadClassPlayers(queryAll, Number(game.class_id));
  const excluded = includeInactive ? [] : allPlayers.filter((p) => !p.isActive);
  const pool = includeInactive ? allPlayers : allPlayers.filter((p) => p.isActive);
  if (pool.length < MIN_TEAM_COUNT) throw fail('NOT_ENOUGH_PLAYERS', 409);

  const seedLabel = String(params.seed || '').trim() || generateSeedLabel();
  const rng = createSeededRng(seedFromLabel(seedLabel));
  const warnings = [];
  if (excluded.length) {
    warnings.push(warning('INACTIVE_EXCLUDED', { playerIds: excluded.map((p) => p.playerId) }));
  }

  const existingTeams = await loadExistingTeams(queryAll, gameId);
  const existingWithMembers = existingTeams.filter((t) => Number(t.member_count) > 0);
  if (existingTeams.length) {
    warnings.push(
      warning(existingWithMembers.length ? 'TEAMS_NOT_EMPTY' : 'TEAMS_EXIST', {
        teamCount: existingTeams.length,
        memberCount: existingTeams.reduce((acc, t) => acc + Number(t.member_count || 0), 0),
      }),
    );
  }

  const [catalog, biomeNames, history] = await Promise.all([
    loadTypedMascotCatalog(),
    loadBiomeNames(queryAll, game.chapter_id ? Number(game.chapter_id) : null),
    loadClassTeamHistory({
      classId: Number(game.class_id),
      excludeGameId: gameId,
      maxGames: DEFAULT_MAX_GAMES,
      queryAll,
    }),
  ]);
  const pairHistory = buildPairHistory(history);
  const poolIds = new Set(pool.map((p) => p.playerId));
  const byId = new Map(pool.map((p) => [p.playerId, p]));

  // Recette : explicite, sinon déduite de la politique d'équipes de la classe (lot v3).
  const classPolicy = TEAM_POLICIES.includes(String(game.team_policy || ''))
    ? String(game.team_policy)
    : DEFAULT_TEAM_POLICY;
  const requestedRecipe =
    explicitRecipe ||
    resolveDefaultRecipe({
      policy: classPolicy,
      history,
      plateauNumber: game.plateau_number,
    });
  if (!explicitRecipe) {
    warnings.push(
      warning('POLICY_DEFAULT_RECIPE', { policy: classPolicy, recipe: requestedRecipe }),
    );
  }
  const usesProfiles = PROFILE_RECIPES.includes(requestedRecipe);
  if (usesProfiles) {
    if (gameplay?.teamCompositionProfileRecipesEnabled === false) {
      throw fail('PROFILE_RECIPES_DISABLED', 409);
    }
    // Un « groupe de besoin » scoré deviendrait un classement des élèves (§ 11) : refus net.
    if (requestedRecipe === 'homogeneous' && gameplay?.scoringEnabled === true) {
      throw fail('HOMOGENEOUS_WITH_SCORING', 409);
    }
  }

  // Contraintes de classe : verrous persistés (MJ) et épingles de l'aperçu (volatiles).
  const locksLoaded = await loadLocksForEngine(
    { classId: Number(game.class_id), poolIds: [...poolIds] },
    { queryAll },
  );
  const locks =
    locksLoaded.together.length || locksLoaded.apart.length
      ? { together: locksLoaded.together, apart: locksLoaded.apart }
      : null;
  if (locksLoaded.ignored > 0) {
    warnings.push(
      warning('LOCKS_IGNORED', { ignored: locksLoaded.ignored, total: locksLoaded.total }),
    );
  }
  const pins = normalizePins(params.pins, poolIds);
  const vitalityEnabled = gameplay?.vitalityEnabled === true;
  const vitalityFloor = vitalityEnabled ? DEFAULT_VITALITY_FLOOR : 0;

  let recipe = requestedRecipe;
  let teamsDraft; // [{ name, type, color, mascotId, memberIds }]
  let engineStats = { iterations: 0, improved: 0 };
  let profiles = null;
  let profileVolume = 0;
  let rotation = null;
  if (usesProfiles) {
    const loaded = await loadPlayerProfiles(
      { classId: Number(game.class_id), playerIds: pool.map((p) => p.playerId) },
      { queryAll },
    );
    profiles = loaded.profiles;
    for (const p of profiles.values()) profileVolume += p.volume;
    // Shrinkage k = 10 par axe : sous ~k observations par joueur, tout le monde est à la moyenne.
    if (profileVolume < pool.length * 10) warnings.push(warning('PROFILE_DATA_SPARSE'));
  }

  if (recipe === 'carry_over') {
    const previous = history.find((g) => g.teams.some((t) => t.memberIds.length > 0)) || null;
    if (!previous) {
      warnings.push(warning('NO_PREVIOUS_GAME', { fallbackRecipe: 'random' }));
      recipe = 'random';
    } else {
      teamsDraft = previous.teams.map((t) => ({
        name: t.name || null,
        type: TEAM_TYPES.includes(String(t.type)) ? String(t.type) : 'gnome',
        color: t.color || null,
        mascotId: t.mascotId || null,
        memberIds: t.memberIds.filter((id) => poolIds.has(Number(id))).map(Number),
      }));
      // Nouveaux joueurs (arrivés depuis) : vers les équipes les moins fournies.
      const placed = new Set(teamsDraft.flatMap((t) => t.memberIds));
      const newcomers = pool.map((p) => p.playerId).filter((id) => !placed.has(id));
      const counts = new Map(teamsDraft.map((t, idx) => [idx, t.memberIds.length]));
      for (const { playerId, teamId } of computeBalancedAssignments({
        pool: newcomers,
        teamIds: teamsDraft.map((_, idx) => idx),
        currentCounts: counts,
        rng,
      })) {
        teamsDraft[teamId].memberIds.push(playerId);
      }
      teamsDraft = teamsDraft.filter((t) => t.memberIds.length > 0);
      warnings.push({
        code: 'CARRY_OVER_SOURCE',
        message: `Équipes reprises de la partie précédente (#${previous.gameId})`,
        gameId: previous.gameId,
        newcomers: newcomers.length,
      });
    }
  }

  let rolesSummary = null;
  if (!teamsDraft) {
    const weights = resolveWeights(recipe, params.weightsOverride);
    if (vitalityFloor > 0 && !(weights.vitality > 0)) weights.vitality = DEFAULT_VITALITY_WEIGHT;
    const engineProfiles = vitalityFloor > 0 ? mergeVitalityProfiles(pool, profiles) : profiles;
    let teamCount = resolveTeamCount({
      teamCount: params.teamCount,
      teamSize: params.teamSize ?? game.team_size_default ?? undefined,
      playerCount: pool.length,
    });
    if (pins.some((p) => p.slot >= teamCount)) throw fail('INVALID_PINS', 400);
    const streaks = buildPeopleStreaks(history);

    // Composition d'abord (les peuples n'influent pas sur les membres), puis peuple de départ
    // par rotation et mascottes ; si le vivier typé manque, on réduit le nombre d'équipes et on
    // recompose (au plus une fois : le catalogue GL borne à 13 équipes).
    let composition;
    let types;
    let mascots;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      composition = computeComposition({
        players: pool,
        teamCount,
        pairHistory: weights.repeat > 0 ? pairHistory : null,
        weights,
        rng,
        profiles: engineProfiles,
        locks,
        pins,
        vitalityFloor,
      });
      const explicitStart = TEAM_TYPES.includes(String(params.startWith || '').toLowerCase())
        ? String(params.startWith).toLowerCase()
        : null;
      rotation = explicitStart
        ? { startWith: explicitStart, thirdStreaks: null, alternative: null, forced: true }
        : { ...choosePeopleStart({ slots: composition.slots, streaks }), forced: false };
      types = alternateTeamTypes(teamCount, rotation.startWith);
      mascots = pickMascots({ types, catalog, rng });
      if (!mascots.warnings.includes(MASCOT_POOL_TOO_SMALL)) break;
      // L'autre parité peut suffire (7 gnomes / 6 licornes au catalogue).
      const otherStart = rotation.startWith === 'gnome' ? 'unicorn' : 'gnome';
      const otherTypes = alternateTeamTypes(teamCount, otherStart);
      const otherMascots = pickMascots({ types: otherTypes, catalog, rng });
      if (!otherMascots.warnings.includes(MASCOT_POOL_TOO_SMALL)) {
        rotation = { ...rotation, startWith: otherStart, forced: false };
        types = otherTypes;
        mascots = otherMascots;
        break;
      }
      const kept = Math.max(mascots.usableTypes.length, otherMascots.usableTypes.length);
      if (attempt === 0) {
        warnings.push(warning('MASCOT_POOL_TOO_SMALL', { requested: teamCount, kept }));
        if (kept < 1) throw fail('MASCOT_POOL_TOO_SMALL', 409);
        if (pins.some((p) => p.slot >= kept)) throw fail('INVALID_PINS', 400);
        teamCount = kept;
      }
    }
    if (
      !rotation.forced &&
      rotation.thirdStreaks != null &&
      rotation.alternative > rotation.thirdStreaks
    ) {
      warnings.push(
        warning('PEOPLE_ROTATION', {
          startWith: rotation.startWith,
          thirdStreaks: rotation.thirdStreaks,
          alternative: rotation.alternative,
        }),
      );
    }
    engineStats = { iterations: composition.iterations, improved: composition.improved };
    if (composition.raw?.lockViolations > 0) {
      warnings.push(warning('LOCKS_UNSATISFIED', { violations: composition.raw.lockViolations }));
    }
    if (vitalityFloor > 0 && composition.raw?.vitality > 0) {
      warnings.push(warning('VITALITY_FLOOR', { shortfall: composition.raw.vitality }));
    }
    rolesSummary = summarizeRoles(composition.slots, profiles);
    teamsDraft = composition.slots.map((memberIds, idx) => ({
      name: null,
      type: types[idx],
      color: null,
      mascotId: mascots.mascotIds[idx] || null,
      memberIds: memberIds.map(Number),
    }));
  } else if (locks) {
    // Reprise : les verrous ne réorganisent pas les équipes, mais on signale les incompatibilités.
    const check = scoreComposition({ slots: teamsDraft.map((t) => t.memberIds), locks });
    if (check.raw.lockViolations > 0) {
      warnings.push(warning('LOCKS_UNSATISFIED', { violations: check.raw.lockViolations }));
    }
  }

  // Noms / couleurs manquants (recette moteur, ou reprise incomplète).
  const vocabulary = buildTeamVocabulary({
    chapterTitle: game.chapter_title,
    plateauNumber: game.plateau_number,
    biomeNames,
  });
  const missingNames = teamsDraft.filter((t) => !t.name).length;
  const names = pickTeamNames({
    count: missingNames,
    vocabulary,
    rng,
    exclude: teamsDraft.map((t) => t.name).filter(Boolean),
  });
  const missingColors = teamsDraft.filter((t) => !t.color).length;
  const colors = pickTeamColors({
    count: missingColors,
    rng,
    exclude: teamsDraft.map((t) => t.color).filter(Boolean),
  });
  const missingMascotTypes = teamsDraft.filter((t) => !t.mascotId).map((t) => t.type);
  const extraMascots = pickMascots({
    types: missingMascotTypes,
    catalog,
    rng,
    exclude: teamsDraft.map((t) => t.mascotId).filter(Boolean),
  });
  let ni = 0;
  let ci = 0;
  let mi = 0;
  for (const team of teamsDraft) {
    if (!team.name) team.name = names[ni++];
    if (!team.color) team.color = colors[ci++];
    if (!team.mascotId) team.mascotId = extraMascots.mascotIds[mi++] || null;
  }

  const catalogById = new Map(catalog.map((m) => [m.id, m]));
  const pairs = summarizePairs(
    teamsDraft.map((t) => t.memberIds),
    pairHistory,
  );
  const pinnedIds = new Set(pins.map((p) => p.playerId));
  // Indicateur de brassage : cumulé sur l'historique, et projeté si cette proposition est appliquée.
  const activeIds = pool.map((p) => p.playerId);
  const mixingBefore = computeMixingRate(history, activeIds);
  const mixingAfter = computeMixingRate(
    [{ rank: -1, teams: teamsDraft.map((t) => ({ memberIds: t.memberIds })) }, ...history],
    activeIds,
  );
  const teams = teamsDraft.map((t, idx) => ({
    index: idx,
    name: t.name,
    type: t.type,
    color: t.color,
    mascotId: t.mascotId,
    mascotLabel: t.mascotId ? catalogById.get(t.mascotId)?.label || null : null,
    members: t.memberIds.map((id) => {
      const p = byId.get(id) || {};
      return {
        playerId: id,
        pseudo: p.pseudo || null,
        firstName: p.firstName || '',
        lastName: p.lastName || '',
        isActive: p.isActive !== false,
        pinned: pinnedIds.has(id),
      };
    }),
    newPairs: pairs.perTeam[idx]?.newPairs ?? 0,
    repeatedPairs: pairs.perTeam[idx]?.repeatedPairs ?? 0,
  }));

  const explain = buildExplain({
    recipe,
    teams,
    pairs,
    history,
    pool,
    rolesSummary,
    sparse: usesProfiles && profileVolume < pool.length * 10,
    locks: locksLoaded,
    pinsCount: pins.length,
    mixingBefore,
    mixingAfter,
  });

  return {
    gameId,
    classId: Number(game.class_id),
    recipe,
    requestedRecipe,
    recipeSource: explicitRecipe ? 'explicit' : 'policy',
    classPolicy,
    classTeamSizeDefault:
      game.team_size_default != null ? Number(game.team_size_default) : DEFAULT_TEAM_SIZE,
    seed: seedLabel,
    teamCount: teams.length,
    includeInactive,
    startWith: teams[0]?.type || null,
    pins,
    locks: {
      together: locksLoaded.together,
      apart: locksLoaded.apart,
      ignored: locksLoaded.ignored,
      total: locksLoaded.total,
    },
    mixing: {
      before: mixingBefore,
      after: mixingAfter,
    },
    teams,
    excluded: excluded.map((p) => ({
      playerId: p.playerId,
      pseudo: p.pseudo,
      firstName: p.firstName,
      lastName: p.lastName,
    })),
    stats: {
      players: pool.length,
      newPairs: pairs.newPairs,
      repeatedPairs: pairs.repeatedPairs,
      historyGames: history.length,
      ...engineStats,
    },
    warnings,
    explain,
    // Écho de l'état existant : le client sait s'il doit demander le remplacement.
    existingTeams: existingTeams.map((t) => ({
      teamId: Number(t.id),
      name: t.name,
      memberCount: Number(t.member_count || 0),
    })),
  };
}

/** Phrases factuelles, sans score ni jugement (§ 11). */
function buildExplain({
  recipe,
  teams,
  pairs,
  history,
  pool,
  rolesSummary = null,
  sparse = false,
  locks = null,
  pinsCount = 0,
  mixingBefore = null,
  mixingAfter = null,
}) {
  const lines = [];
  const sizes = teams.map((t) => t.members.length);
  lines.push(
    `${teams.length} équipe${teams.length > 1 ? 's' : ''} pour ${pool.length} joueur${pool.length > 1 ? 's' : ''} (effectifs ${Math.min(...sizes)}–${Math.max(...sizes)}).`,
  );
  if (recipe === 'carry_over') {
    lines.push('Équipes reprises de la partie précédente, nouveaux joueurs répartis.');
  } else if (recipe === 'random_memory' && history.length) {
    lines.push(
      `${pairs.newPairs} binôme${pairs.newPairs > 1 ? 's' : ''} inédit${pairs.newPairs > 1 ? 's' : ''}, ${pairs.repeatedPairs} déjà réuni${pairs.repeatedPairs > 1 ? 's' : ''} sur les ${history.length} dernière${history.length > 1 ? 's' : ''} partie${history.length > 1 ? 's' : ''}.`,
    );
  } else if (recipe === 'random') {
    lines.push('Tirage aléatoire équilibré, sans mémoire des parties précédentes.');
  } else if (recipe === 'mixed') {
    lines.push(
      'Profils variés dans chaque équipe ; écart moyen faible entre les équipes (savoir, exploration, échange, générosité, initiative, assiduité).',
    );
  } else if (recipe === 'roles') {
    const full = rolesSummary?.fullTeams ?? 0;
    lines.push(
      full === teams.length
        ? 'Chaque équipe réunit les quatre rôles (savant, éclaireur, négociant, gardien).'
        : `${full} équipe${full > 1 ? 's' : ''} sur ${teams.length} réuni${full > 1 ? 'ssent' : 't'} les quatre rôles ; les autres en couvrent au moins ${Math.min(...(rolesSummary?.perTeam || [0]))}.`,
    );
  } else if (recipe === 'homogeneous') {
    lines.push(
      'Équipes aux profils proches, pour différencier l’accompagnement — séance sans score.',
    );
  }
  if (sparse) {
    lines.push(
      'Peu de données de jeu pour cette classe : les profils restent proches de la moyenne, le tirage garde une large part de hasard.',
    );
  }
  const gnomes = teams.filter((t) => t.type === 'gnome').length;
  const unicorns = teams.length - gnomes;
  lines.push(
    `${gnomes} équipe${gnomes > 1 ? 's' : ''} gnome, ${unicorns} licorne${unicorns > 1 ? 's' : ''}.`,
  );
  const applied = (locks?.together?.length || 0) + (locks?.apart?.length || 0);
  if (applied > 0 || pinsCount > 0) {
    const parts = [];
    if (locks?.together?.length) parts.push(`${locks.together.length} « ensemble »`);
    if (locks?.apart?.length) parts.push(`${locks.apart.length} « séparés »`);
    if (pinsCount > 0) parts.push(`${pinsCount} épingle${pinsCount > 1 ? 's' : ''}`);
    lines.push(`Contraintes prises en compte : ${parts.join(', ')}.`);
  }
  if (mixingBefore && mixingBefore.rate != null && mixingAfter && mixingAfter.rate != null) {
    lines.push(
      `Brassage de la classe : ${Math.round(mixingBefore.rate * 100)} % des binômes possibles déjà réunis, ${Math.round(mixingAfter.rate * 100)} % après cette partie.`,
    );
  }
  return lines;
}

/**
 * Indicateur de brassage cumulé d'une classe, vu depuis une partie (onglet Équipes du MJ).
 * Aucune écriture. Les joueurs comptés sont les actifs de la classe.
 */
async function getClassMixingRate({ gameId }, deps = {}) {
  const queryOne = deps.queryOne || database.queryOne;
  const queryAll = deps.queryAll || database.queryAll;
  const id = toInt(gameId);
  if (!id || id <= 0) throw fail('GAME_NOT_FOUND', 404);
  const game = await loadGame(queryOne, id);
  const classId = Number(game.class_id);
  const [players, history] = await Promise.all([
    loadClassPlayers(queryAll, classId),
    loadClassTeamHistory({ classId, excludeGameId: null, maxGames: 0, queryAll }),
  ]);
  const activeIds = players.filter((p) => p.isActive).map((p) => p.playerId);
  const includesCurrent = history.some((g) => g.gameId === id);
  return {
    gameId: id,
    classId,
    includesCurrentGame: includesCurrent,
    activePlayers: activeIds.length,
    ...computeMixingRate(history, activeIds),
  };
}

/**
 * Valide et normalise les équipes envoyées à l'application (le MJ a pu les retoucher).
 * @returns {Array<{ name, type, color, mascotId, memberIds: number[] }>}
 */
function normalizeTeamsInput(rawTeams) {
  if (!Array.isArray(rawTeams) || rawTeams.length === 0) throw fail('INVALID_TEAM', 400);
  const out = [];
  for (const raw of rawTeams) {
    const name = String(raw?.name || '').trim();
    const type = String(raw?.type || '').toLowerCase();
    if (!name || name.length > 120 || !TEAM_TYPES.includes(type)) throw fail('INVALID_TEAM', 400);
    const color = String(raw?.color || '').trim();
    if (color && !/^#[0-9a-f]{6}$/i.test(color)) throw fail('INVALID_TEAM', 400);
    const mascotId = raw?.mascotId == null ? null : String(raw.mascotId).trim() || null;
    const source = Array.isArray(raw?.memberIds)
      ? raw.memberIds
      : Array.isArray(raw?.members)
        ? raw.members.map((m) => m?.playerId ?? m)
        : null;
    if (!source) throw fail('INVALID_TEAM', 400);
    const memberIds = source.map(toInt);
    if (memberIds.some((id) => id == null || id <= 0)) throw fail('INVALID_MEMBER', 400);
    out.push({ name, type, color: color || '#22c55e', mascotId, memberIds });
  }
  return out;
}

/**
 * Applique une proposition : crée les équipes, affecte les joueurs, journalise UN événement
 * `teams_composed`. Transactionnel ; verrouille `gl_games` (`SELECT … FOR UPDATE`) puis
 * revalide partie, joueurs et état des équipes.
 *
 * @param {object} params
 * @param {number} params.gameId
 * @param {Array} params.teams  équipes (cf. normalizeTeamsInput)
 * @param {boolean} [params.replaceExisting]
 * @param {string} [params.recipe]  pour le journal
 * @param {string} [params.seed]  pour le journal
 * @param {{ userId: string|number }} params.actor  MJ (req.glAuth)
 */
async function applyComposition(params, deps = {}) {
  const withTransaction = deps.withTransaction || database.withTransaction;
  const gameId = toInt(params.gameId);
  if (!gameId || gameId <= 0) throw fail('GAME_NOT_FOUND', 404);
  const teamsInput = normalizeTeamsInput(params.teams);
  const replaceExisting = !!params.replaceExisting;
  const recipe = params.recipe ? String(params.recipe) : null;
  const seed = params.seed ? String(params.seed) : null;
  const actorId = params.actor?.userId != null ? String(params.actor.userId) : null;

  const result = await withTransaction(async (tx) => {
    // Verrou de ligne sur la partie : sans `FOR UPDATE`, un POST /start concurrent
    // (ou un second apply) peut passer la partie en `live` / réécrire les équipes
    // entre cette lecture et le DELETE des membres. Même schéma que
    // `claimAssignmentSeat` / `routes/gl/games/actions.js`.
    const locked = await tx.queryOne(
      'SELECT id, status FROM gl_games WHERE id = ? LIMIT 1 FOR UPDATE',
      [gameId],
    );
    if (!locked) throw fail('GAME_NOT_FOUND', 404);
    if (String(locked.status) !== 'draft') throw fail('GAME_NOT_DRAFT', 409);

    const game = await loadGame(tx.queryOne, gameId);

    const classPlayers = await tx.queryAll('SELECT id FROM gl_players WHERE class_id = ?', [
      Number(game.class_id),
    ]);
    const allowed = new Set(classPlayers.map((r) => Number(r.id)));
    const seen = new Set();
    for (const team of teamsInput) {
      for (const id of team.memberIds) {
        if (!allowed.has(id) || seen.has(id)) throw fail('INVALID_MEMBER', 400);
        seen.add(id);
      }
    }

    const existing = await loadExistingTeams(tx.queryAll, gameId);
    if (existing.length) {
      const withMembers = existing.some((t) => Number(t.member_count) > 0);
      if (!replaceExisting) throw fail(withMembers ? 'TEAMS_NOT_EMPTY' : 'TEAMS_EXIST', 409);
      await tx.execute('DELETE FROM gl_team_members WHERE game_id = ?', [gameId]);
      await tx.execute('DELETE FROM gl_teams WHERE game_id = ?', [gameId]);
    }

    const created = [];
    for (const team of teamsInput) {
      const insert = await tx.execute(
        `INSERT INTO gl_teams (game_id, name, type, mascot_id, position_marker_id, color, created_at, updated_at)
         VALUES (?, ?, ?, ?, NULL, ?, NOW(), NOW())`,
        [gameId, team.name, team.type, team.mascotId, team.color],
      );
      const teamId = Number(insert.insertId);
      for (const playerId of team.memberIds) {
        await assignPlayerToTeamTx(tx, { gameId, teamId, playerId });
      }
      created.push({
        teamId,
        name: team.name,
        type: team.type,
        color: team.color,
        mascotId: team.mascotId,
        memberIds: team.memberIds,
      });
    }

    const event = await insertGameEvent(tx, {
      gameId,
      teamId: null,
      actorType: 'mj',
      actorId,
      eventType: 'teams_composed',
      payload: {
        recipe,
        seed,
        replaced: existing.length > 0,
        teamCount: created.length,
        playerCount: seen.size,
        teams: created.map((t) => ({
          teamId: t.teamId,
          name: t.name,
          type: t.type,
          memberCount: t.memberIds.length,
        })),
      },
    });
    await tx.execute('UPDATE gl_games SET updated_at = NOW() WHERE id = ?', [gameId]);
    return { teams: created, event, replaced: existing.length > 0 };
  });

  emitGlGameEvent(gameId, result.event);
  return result;
}

module.exports = {
  RECIPES,
  PROFILE_RECIPES,
  TEAM_POLICIES,
  DEFAULT_TEAM_POLICY,
  DEFAULT_TEAM_SIZE,
  DEFAULT_VITALITY_FLOOR,
  MIN_TEAM_COUNT,
  MAX_TEAM_COUNT,
  MESSAGES,
  GlTeamCompositionError,
  resolveTeamCount,
  resolveDefaultRecipe,
  normalizeTeamsInput,
  buildCompositionProposal,
  applyComposition,
  getClassMixingRate,
};
