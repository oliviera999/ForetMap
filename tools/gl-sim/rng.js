'use strict';

/**
 * Aléa reproductible du banc (élèves virtuels, dés physiques, stratégies de fouille). Réutilise
 * mulberry32 de `lib/glRandom.js` ; une graine par exécution, dérivée de `--seed` et du rang.
 */

const { mulberry32 } = require('../../lib/glRandom');

/** Hachage FNV-1a d'une chaîne → entier 32 bits (graine dérivée, ex. `seed:scenario:run`). */
function hashSeed(...parts) {
  let h = 2166136261;
  for (const ch of parts.join(':')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h >>> 0;
}

function creerRng(seed) {
  const next = mulberry32(Number(seed) >>> 0);
  let spare = null;
  const rng = {
    seed: Number(seed) >>> 0,
    /** Flottant dans [0, 1). */
    next,
    /** Entier dans [min, max] inclus. */
    int(min, max) {
      const lo = Math.ceil(Number(min));
      const hi = Math.floor(Number(max));
      if (!(hi >= lo)) throw new RangeError(`int : intervalle vide [${lo}, ${hi}]`);
      return lo + Math.floor(next() * (hi - lo + 1));
    },
    /** Vrai avec probabilité `p`. */
    chance(p) {
      return next() < Number(p);
    },
    /** Un élément de `list` (ou `null`). */
    pick(list) {
      const arr = Array.isArray(list) ? list : [];
      if (!arr.length) return null;
      return arr[Math.floor(next() * arr.length)];
    },
    /** Copie mélangée (Fisher-Yates). */
    shuffle(list) {
      const out = Array.isArray(list) ? [...list] : [];
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    /** Loi normale (Box-Muller) de moyenne `mu` et d'écart-type `sigma`. */
    normal(mu = 0, sigma = 1) {
      if (spare != null) {
        const v = spare;
        spare = null;
        return mu + sigma * v;
      }
      let u = 0;
      let v = 0;
      while (u === 0) u = next();
      while (v === 0) v = next();
      const r = Math.sqrt(-2 * Math.log(u));
      const theta = 2 * Math.PI * v;
      spare = r * Math.sin(theta);
      return mu + sigma * r * Math.cos(theta);
    },
    /** Normale bornée dans [lo, hi]. */
    normalBornee(mu, sigma, lo, hi) {
      return Math.min(hi, Math.max(lo, rng.normal(mu, sigma)));
    },
    /** Uniforme dans [lo, hi). */
    uniform(lo, hi) {
      return lo + (hi - lo) * next();
    },
    /** Faces de `n` dés à six faces (dés « physiques » des élèves virtuels). */
    des(n = 2) {
      return Array.from({ length: n }, () => rng.int(1, 6));
    },
  };
  return rng;
}

module.exports = { hashSeed, creerRng };
