'use strict';

/**
 * Moteur PUR de composition d'équipes Gnomes & Licornes (aucun accès base, aucun
 * `Math.random`). Spécification : docs/GL_EQUIPES_AUTO_CONCEPTION.md § 4.
 *
 * Les recettes ne sont pas des algorithmes distincts : ce sont des jeux de poids sur une même
 * fonction de coût, minimisée par recherche locale (échanges de deux joueurs, première
 * amélioration, borne dure d'itérations). À graine donnée, le résultat est déterministe.
 *
 * Termes de coût :
 *   size      Σ écart d'effectif à la cible (toujours actif : un échange ne doit jamais le dégrader)
 *   repeat    Σ poids_historique(paire) pour chaque paire réunie (« aléatoire à mémoire »)
 *   inter     variance inter-équipes du score composite (recette « mixte », lot v2)
 *   intra     Σ variance intra-équipe du score composite (recette « groupes de besoin », lot v2)
 *   roles     Σ rôles dominants manquants par équipe (recette « complémentarité », lot v2)
 *   vitality  Σ max(0, plancher − (cœurs + gemmes) de l'équipe) (lot v3)
 *   locks     violations de verrous MJ « ensemble » / « séparés » — pénalité quasi infinie (lot v3)
 *
 * Le départ est le tirage équilibré existant (`computeBalancedAssignments`, lib/glRoster.js).
 */

const { computeBalancedAssignments } = require('../glRoster');

/** Rôles dominants (lot v2) — quatre axes « jouables » du profil, cf. conception § 3 / § 4. */
const TEAM_ROLES = Object.freeze(['savant', 'eclaireur', 'negociant', 'gardien']);

/** Pénalité par violation de verrou : domine tout autre terme sans casser les comparaisons. */
const LOCK_VIOLATION_PENALTY = 1e6;

/** Borne dure de la recherche locale. */
const DEFAULT_MAX_ITERATIONS = 2000;

/**
 * Poids par recette. `null` = la recette ne passe pas par le moteur (`carry_over` recopie).
 * Les clés absentes valent 0.
 */
const RECIPE_WEIGHTS = Object.freeze({
  random: Object.freeze({ size: 1 }),
  random_memory: Object.freeze({ size: 1, repeat: 0.6 }),
  carry_over: null,
  // Lot v2 — le composite est dans [0, 1] : une variance de moyennes vaut ~1e-3, d'où des
  // poids élevés pour que ces termes pèsent face à `repeat` (paires ≈ 0.8^rang).
  mixed: Object.freeze({ size: 1, repeat: 0.2, inter: 60 }),
  roles: Object.freeze({ size: 1, repeat: 0.2, roles: 1, inter: 10 }),
  homogeneous: Object.freeze({ size: 1, intra: 60 }),
});

/** Recettes qui exigent les six axes de profil (§ 3) — chargés seulement pour elles. */
const PROFILE_RECIPES = Object.freeze(['mixed', 'roles', 'homogeneous']);

const ENGINE_RECIPES = Object.freeze(
  Object.keys(RECIPE_WEIGHTS).filter((k) => RECIPE_WEIGHTS[k] != null),
);

/** Termes ajustables par le MJ (« Poids avancés ») et borne haute commune. */
const OVERRIDABLE_WEIGHTS = Object.freeze(['repeat', 'inter', 'intra', 'roles', 'vitality']);
const MAX_WEIGHT = 100;

/**
 * Poids effectifs : preset de la recette, puis surcharges bornées [0, MAX_WEIGHT] sur les seuls
 * termes ajustables (`size` reste toujours actif : un échange ne doit jamais dégrader l'effectif).
 */
function resolveWeights(recipe, override = null) {
  const base = RECIPE_WEIGHTS[recipe] || RECIPE_WEIGHTS.random;
  const out = { ...base, size: base.size || 1 };
  if (override && typeof override === 'object') {
    for (const key of OVERRIDABLE_WEIGHTS) {
      if (override[key] === undefined || override[key] === null) continue;
      const v = Number(override[key]);
      if (!Number.isFinite(v)) continue;
      out[key] = Math.max(0, Math.min(MAX_WEIGHT, v));
    }
  }
  return out;
}

/** Générateur congruentiel seedé (même implémentation que tests/gl-roster-balance.test.js). */
function createSeededRng(seed) {
  let state = Number(seed) >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** Graine lisible (« brume-4172 ») ⇒ entier 32 bits (FNV-1a). */
function seedFromLabel(label) {
  const text = String(label ?? '');
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

const SEED_WORDS = Object.freeze([
  'brume',
  'mousse',
  'sente',
  'source',
  'lande',
  'givre',
  'aube',
  'racine',
  'ecume',
  'seuil',
  'lueur',
  'ronce',
]);

/** Graine lisible et reproductible, tirée avec `rng` (défaut : horloge, hors moteur). */
function generateSeedLabel(rng = null) {
  const draw =
    typeof rng === 'function' ? rng : createSeededRng(Date.now() ^ (Math.random() * 1e9));
  const word = SEED_WORDS[Math.floor(draw() * SEED_WORDS.length)];
  const number = 1000 + Math.floor(draw() * 9000);
  return `${word}-${number}`;
}

/** Clé normalisée d'une paire de joueurs. */
function pairKey(a, b) {
  const x = Number(a);
  const y = Number(b);
  return x < y ? `${x}-${y}` : `${y}-${x}`;
}

function normalizeWeights(weights) {
  const w = weights && typeof weights === 'object' ? weights : {};
  const pick = (k) => {
    const v = Number(w[k]);
    return Number.isFinite(v) && v > 0 ? v : 0;
  };
  return {
    size: pick('size'),
    repeat: pick('repeat'),
    inter: pick('inter'),
    intra: pick('intra'),
    roles: pick('roles'),
    vitality: pick('vitality'),
  };
}

function mean(values) {
  if (!values.length) return 0;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

function variance(values) {
  if (values.length < 2) return 0;
  const m = mean(values);
  let s = 0;
  for (const v of values) s += (v - m) * (v - m);
  return s / values.length;
}

/**
 * Effectifs cibles : `n` joueurs sur `k` équipes ⇒ chaque équipe a ⌊n/k⌋ ou ⌈n/k⌉ membres.
 */
function targetSizeBounds(playerCount, teamCount) {
  if (teamCount <= 0) return { low: 0, high: 0 };
  const low = Math.floor(playerCount / teamCount);
  const high = Math.ceil(playerCount / teamCount);
  return { low, high };
}

/**
 * Coût d'une composition, terme par terme.
 *
 * @param {object} params
 * @param {number[][]} params.slots  équipes (listes d'identifiants joueurs)
 * @param {Map<string, number>} [params.pairHistory]  clé `min-max` → poids ≥ 0
 * @param {object} [params.weights]
 * @param {Map<number, {composite?: number, role?: string, hearts?: number, gems?: number}>} [params.profiles]
 * @param {{ together?: Array<[number, number]>, apart?: Array<[number, number]> }} [params.locks]
 * @param {number} [params.vitalityFloor]  plancher cœurs+gemmes par équipe (0 = inactif)
 * @returns {{ total: number, terms: object }}
 */
function scoreComposition({
  slots,
  pairHistory = null,
  weights = null,
  profiles = null,
  locks = null,
  vitalityFloor = 0,
}) {
  const w = normalizeWeights(weights);
  const teams = Array.isArray(slots) ? slots : [];
  const playerCount = teams.reduce((acc, t) => acc + t.length, 0);
  const { low, high } = targetSizeBounds(playerCount, teams.length);

  let size = 0;
  let repeat = 0;
  let intra = 0;
  let roles = 0;
  let vitality = 0;
  const teamMeans = [];

  for (const team of teams) {
    if (team.length > high) size += team.length - high;
    else if (team.length < low) size += low - team.length;

    if (pairHistory && pairHistory.size > 0 && w.repeat > 0) {
      for (let i = 0; i < team.length; i += 1) {
        for (let j = i + 1; j < team.length; j += 1) {
          repeat += Number(pairHistory.get(pairKey(team[i], team[j])) || 0);
        }
      }
    }

    if (profiles && (w.inter > 0 || w.intra > 0 || w.roles > 0 || w.vitality > 0)) {
      const composites = [];
      const rolesPresent = new Set();
      let teamVitality = 0;
      for (const playerId of team) {
        const p = profiles.get(Number(playerId)) || {};
        if (Number.isFinite(Number(p.composite))) composites.push(Number(p.composite));
        if (p.role) rolesPresent.add(String(p.role));
        teamVitality += (Number(p.hearts) || 0) + (Number(p.gems) || 0);
      }
      teamMeans.push(mean(composites));
      intra += variance(composites);
      const missing = TEAM_ROLES.filter((r) => !rolesPresent.has(r)).length;
      // Une équipe plus petite que le nombre de rôles ne peut pas tous les couvrir :
      // on ne compte que ce qui était atteignable.
      roles += Math.max(0, missing - Math.max(0, TEAM_ROLES.length - team.length));
      if (vitalityFloor > 0) vitality += Math.max(0, vitalityFloor - teamVitality);
    }
  }

  const inter = teamMeans.length > 1 ? variance(teamMeans) : 0;

  let lockViolations = 0;
  if (locks) {
    const slotOf = new Map();
    teams.forEach((team, idx) => team.forEach((pid) => slotOf.set(Number(pid), idx)));
    for (const [a, b] of Array.isArray(locks.together) ? locks.together : []) {
      const sa = slotOf.get(Number(a));
      const sb = slotOf.get(Number(b));
      if (sa != null && sb != null && sa !== sb) lockViolations += 1;
    }
    for (const [a, b] of Array.isArray(locks.apart) ? locks.apart : []) {
      const sa = slotOf.get(Number(a));
      const sb = slotOf.get(Number(b));
      if (sa != null && sb != null && sa === sb) lockViolations += 1;
    }
  }

  const terms = {
    size: w.size * size,
    repeat: w.repeat * repeat,
    inter: w.inter * inter,
    intra: w.intra * intra,
    roles: w.roles * roles,
    vitality: w.vitality * vitality,
    locks: lockViolations * LOCK_VIOLATION_PENALTY,
  };
  const total = Object.values(terms).reduce((acc, v) => acc + v, 0);
  return { total, terms, raw: { size, repeat, inter, intra, roles, vitality, lockViolations } };
}

/** Place les joueurs épinglés dans leur équipe (échange avec un membre non épinglé). */
function applyPins(slots, pins, pinnedSet) {
  if (!Array.isArray(pins) || pins.length === 0) return;
  const locate = (pid) => {
    for (let s = 0; s < slots.length; s += 1) {
      const i = slots[s].indexOf(pid);
      if (i >= 0) return { s, i };
    }
    return null;
  };
  for (const pin of pins) {
    const pid = Number(pin.playerId);
    const target = Number(pin.slot);
    if (!Number.isInteger(target) || target < 0 || target >= slots.length) continue;
    const pos = locate(pid);
    if (!pos || pos.s === target) continue;
    // Cherche dans l'équipe cible un membre non épinglé à échanger ; sinon déplacement simple.
    const swapIdx = slots[target].findIndex((other) => !pinnedSet.has(Number(other)));
    if (swapIdx >= 0) {
      const other = slots[target][swapIdx];
      slots[target][swapIdx] = pid;
      slots[pos.s][pos.i] = other;
    } else {
      slots[pos.s].splice(pos.i, 1);
      slots[target].push(pid);
    }
  }
}

/**
 * Compose les équipes : départ équilibré, épingles, puis recherche locale par échange.
 *
 * @param {object} params
 * @param {Array<{playerId: number}>} params.players  pool déjà filtré (actifs)
 * @param {number} params.teamCount  nombre d'équipes à remplir
 * @param {Map<string, number>} [params.pairHistory]
 * @param {object} [params.weights]  cf. RECIPE_WEIGHTS
 * @param {Function} params.rng  générateur seedé
 * @param {Map<number, object>} [params.profiles]  lot v2
 * @param {{ together?: Array<[number, number]>, apart?: Array<[number, number]> }} [params.locks]  lot v3
 * @param {Array<{playerId: number, slot: number}>} [params.pins]  lot v3 (jamais échangés)
 * @param {number} [params.vitalityFloor]  lot v3
 * @param {number} [params.maxIterations]
 * @returns {{ slots: number[][], cost: number, breakdown: object, iterations: number, improved: number }}
 */
function computeComposition({
  players,
  teamCount,
  pairHistory = null,
  weights = null,
  rng,
  profiles = null,
  locks = null,
  pins = null,
  vitalityFloor = 0,
  maxIterations = DEFAULT_MAX_ITERATIONS,
}) {
  if (typeof rng !== 'function') throw new Error('computeComposition: rng requis');
  const k = Math.max(0, Math.trunc(Number(teamCount) || 0));
  const pool = (Array.isArray(players) ? players : [])
    .map((p) => Number(p?.playerId ?? p))
    .filter((id) => Number.isFinite(id));
  if (k === 0 || pool.length === 0) {
    return {
      slots: Array.from({ length: k }, () => []),
      cost: 0,
      breakdown: scoreComposition({ slots: [] }).terms,
      iterations: 0,
      improved: 0,
    };
  }

  const slotIndices = Array.from({ length: k }, (_, i) => i);
  const slots = slotIndices.map(() => []);
  for (const { playerId, teamId } of computeBalancedAssignments({
    pool,
    teamIds: slotIndices,
    rng,
  })) {
    slots[teamId].push(playerId);
  }

  const pinnedSet = new Set(
    (Array.isArray(pins) ? pins : []).map((p) => Number(p.playerId)).filter(Number.isFinite),
  );
  applyPins(slots, pins, pinnedSet);

  const scoreArgs = { pairHistory, weights, profiles, locks, vitalityFloor };
  let current = scoreComposition({ slots, ...scoreArgs });

  // Rien à optimiser : seul le terme d'effectif est actif et il est déjà satisfait.
  const w = normalizeWeights(weights);
  const hasObjective =
    w.repeat > 0 || w.inter > 0 || w.intra > 0 || w.roles > 0 || w.vitality > 0 || !!locks;
  if (!hasObjective || k < 2) {
    return { slots, cost: current.total, breakdown: current.terms, iterations: 0, improved: 0 };
  }

  const positions = [];
  slots.forEach((team, s) => team.forEach((_, i) => positions.push([s, i])));
  const pairs = [];
  for (let a = 0; a < positions.length; a += 1) {
    for (let b = a + 1; b < positions.length; b += 1) {
      if (positions[a][0] !== positions[b][0]) pairs.push([positions[a], positions[b]]);
    }
  }

  let iterations = 0;
  let improved = 0;
  let progress = true;
  while (progress && iterations < maxIterations && current.total > 0) {
    progress = false;
    // Ordre des échanges tiré avec la même graine : déterministe, sans biais d'index.
    for (let i = pairs.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = pairs[i];
      pairs[i] = pairs[j];
      pairs[j] = tmp;
    }
    for (const [[sa, ia], [sb, ib]] of pairs) {
      if (iterations >= maxIterations) break;
      iterations += 1;
      const pa = slots[sa][ia];
      const pb = slots[sb][ib];
      if (pinnedSet.has(pa) || pinnedSet.has(pb)) continue;
      slots[sa][ia] = pb;
      slots[sb][ib] = pa;
      const candidate = scoreComposition({ slots, ...scoreArgs });
      if (candidate.total < current.total - 1e-12) {
        current = candidate;
        improved += 1;
        progress = true;
        break; // première amélioration : on repart sur un nouvel ordre
      }
      slots[sa][ia] = pa;
      slots[sb][ib] = pb;
    }
  }

  return { slots, cost: current.total, breakdown: current.terms, iterations, improved };
}

/** Paires réunies dans une composition, partagées entre « inédites » et « déjà vues ». */
function summarizePairs(slots, pairHistory) {
  let newPairs = 0;
  let repeatedPairs = 0;
  const perTeam = [];
  for (const team of Array.isArray(slots) ? slots : []) {
    let tNew = 0;
    let tRepeated = 0;
    for (let i = 0; i < team.length; i += 1) {
      for (let j = i + 1; j < team.length; j += 1) {
        const seen = pairHistory && Number(pairHistory.get(pairKey(team[i], team[j])) || 0) > 0;
        if (seen) tRepeated += 1;
        else tNew += 1;
      }
    }
    perTeam.push({ newPairs: tNew, repeatedPairs: tRepeated });
    newPairs += tNew;
    repeatedPairs += tRepeated;
  }
  return { newPairs, repeatedPairs, perTeam };
}

/** Rôles couverts par équipe (pour les explications factuelles, sans score). */
function summarizeRoles(slots, profiles) {
  if (!profiles) return null;
  const perTeam = (Array.isArray(slots) ? slots : []).map((team) => {
    const present = new Set();
    for (const pid of team) {
      const role = profiles.get(Number(pid))?.role;
      if (role) present.add(role);
    }
    return TEAM_ROLES.filter((r) => present.has(r)).length;
  });
  return {
    perTeam,
    fullTeams: perTeam.filter((n) => n === TEAM_ROLES.length).length,
  };
}

module.exports = {
  TEAM_ROLES,
  RECIPE_WEIGHTS,
  PROFILE_RECIPES,
  OVERRIDABLE_WEIGHTS,
  MAX_WEIGHT,
  resolveWeights,
  summarizeRoles,
  ENGINE_RECIPES,
  LOCK_VIOLATION_PENALTY,
  DEFAULT_MAX_ITERATIONS,
  createSeededRng,
  seedFromLabel,
  generateSeedLabel,
  pairKey,
  normalizeWeights,
  targetSizeBounds,
  scoreComposition,
  computeComposition,
  summarizePairs,
};
