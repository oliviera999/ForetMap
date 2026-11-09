'use strict';

/**
 * Aléa centralisé et rejouable du moteur Gnomes & Licornes (simulation du 7 novembre 2026).
 *
 * Tous les tirages du moteur (dés, péripéties, lignes et erreur d'Olu, questions de chasse,
 * chapardeur, composition des équipes, Loupe du voyageur…) passent par ce module :
 * - par défaut, `crypto.randomInt` (uniforme, non prédictible) ;
 * - si `GL_RANDOM_SEED` est posé **et** `NODE_ENV !== 'production'`, un générateur
 *   déterministe (mulberry32), avec **une graine par partie** (`seed ^ gameId`) pour que des
 *   parties simulées en parallèle restent reproductibles indépendamment les unes des autres.
 *
 * Le test `tests/gl-random.test.js` échoue si `crypto.randomInt` ou `Math.random` réapparaît
 * dans `lib/gl*` hors de ce fichier.
 */

const crypto = require('node:crypto');

/** mulberry32 : générateur 32 bits rapide et reproductible (domaine public). */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Graine entière depuis `GL_RANDOM_SEED` (entier, ou chaîne hachée) ; `null` si inactive. */
function parseSeed() {
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') return null;
  const raw = String(process.env.GL_RANDOM_SEED || '').trim();
  if (!raw) return null;
  if (/^-?\d+$/.test(raw)) return Number(raw) >>> 0;
  let h = 2166136261;
  for (const ch of raw) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h >>> 0;
}

function seededEnabled() {
  return parseSeed() != null;
}

/** Générateurs déterministes par partie (clé 0 = hors partie). */
const generators = new Map();

function rngFor(gameId) {
  const seed = parseSeed();
  if (seed == null) return null;
  const key = Number(gameId) || 0;
  if (!generators.has(key)) generators.set(key, mulberry32((seed ^ key) >>> 0));
  return generators.get(key);
}

/** Flottant dans [0, 1). */
function random({ gameId = null } = {}) {
  const rng = rngFor(gameId);
  if (rng) return rng();
  return crypto.randomInt(0, 0x100000000) / 0x100000000;
}

/**
 * Entier dans `[min, max)` — même contrat que `crypto.randomInt(min, max)` ; `randomInt(max)`
 * vaut `randomInt(0, max)`.
 */
function randomInt(min, max, opts = {}) {
  let lo = min;
  let hi = max;
  let options = opts;
  if (max == null || typeof max === 'object') {
    options = max && typeof max === 'object' ? max : opts;
    lo = 0;
    hi = min;
  }
  lo = Math.ceil(Number(lo));
  hi = Math.floor(Number(hi));
  if (!(hi > lo)) throw new RangeError(`randomInt : intervalle vide [${lo}, ${hi})`);
  const rng = rngFor(options?.gameId);
  if (rng) return lo + Math.floor(rng() * (hi - lo));
  return crypto.randomInt(lo, hi);
}

/** Un élément de `list` (ou `null` si vide). */
function pick(list, opts = {}) {
  const arr = Array.isArray(list) ? list : [];
  if (!arr.length) return null;
  if (arr.length === 1) return arr[0];
  return arr[randomInt(0, arr.length, opts)];
}

/** Copie mélangée (Fisher-Yates) de `list`. */
function shuffle(list, opts = {}) {
  const out = Array.isArray(list) ? [...list] : [];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i + 1, opts);
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/** Tirages liés à une partie (graine `seed ^ gameId` en mode déterministe). */
function forGame(gameId) {
  const opts = { gameId };
  return {
    gameId: Number(gameId) || 0,
    random: () => random(opts),
    randomInt: (min, max) => randomInt(min, max, opts),
    pick: (list) => pick(list, opts),
    shuffle: (list) => shuffle(list, opts),
  };
}

/** Oublie les générateurs déterministes (tests : rejouer une séquence depuis la graine). */
function resetForTests() {
  generators.clear();
}

module.exports = {
  mulberry32,
  parseSeed,
  seededEnabled,
  random,
  randomInt,
  pick,
  shuffle,
  forGame,
  resetForTests,
};
