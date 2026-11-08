'use strict';

/**
 * Élèves virtuels du banc « Tenir à deux ».
 *
 * Persona = `{ justesse, assiduite, veillee, strategieFouille, penchants: { marche, sorts,
 * dons } }` :
 * - `justesse` : probabilité de bonne réponse (case, chasse, lecture) ;
 * - `assiduite` : probabilité de présence à une séance ;
 * - `veillee` : probabilité d'une action de veillée par semaine (lecture / tenue, étude d'une
 *   espèce ou d'un biome, Marché) ;
 * - `strategieFouille` : `aveugle` | `futee` | `mixte` ;
 * - `penchants` : propensions 0-1 à proposer un sort, à aller au Marché, à donner.
 *
 * Profils de classe : `moyenne` (justesse ~ N(0,65 ; 0,12)), `difficulte` (N(0,45 ; 0,12)),
 * `experte` (N(0,8 ; 0,1)) ; tout est borné. La graine rend la classe reproductible.
 * Aucun nom : les pseudos sont `sim-<scenario>-<n>`.
 */

const { creerRng, hashSeed } = require('./rng');

const PROFILS = Object.freeze({
  moyenne: Object.freeze({ justesse: [0.65, 0.12] }),
  difficulte: Object.freeze({ justesse: [0.45, 0.12] }),
  experte: Object.freeze({ justesse: [0.8, 0.1] }),
});

const STRATEGIES = Object.freeze(['aveugle', 'futee', 'mixte']);

function borne(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * @param {object} opts
 * @param {'moyenne'|'difficulte'|'experte'} [opts.profil]
 * @param {number} opts.effectif
 * @param {number|object} opts.seed graine (entier) ou rng déjà construit
 * @param {string} [opts.strategieFouille] force une stratégie pour toute la classe
 * @param {object} [opts.penchants] surcharges `{ marche, sorts, dons }` (valeur fixe 0-1)
 * @param {object} [opts.assiduite] `{ mu, sigma }` (défaut 0,92 ; 0,06)
 * @param {object} [opts.veillee] `{ mu, sigma }` (défaut 0,35 ; 0,2)
 * @returns {Array<object>} personas (index 0-based, pseudo posé par le banc)
 */
function genererPersonas({
  profil = 'moyenne',
  effectif = 20,
  seed = 1,
  strategieFouille = null,
  penchants = null,
  assiduite = { mu: 0.92, sigma: 0.06 },
  veillee = { mu: 0.35, sigma: 0.2 },
} = {}) {
  const def = PROFILS[profil];
  if (!def) throw new Error(`Profil de classe inconnu : ${profil}`);
  const rng = typeof seed === 'object' && seed ? seed : creerRng(hashSeed('personas', seed));
  const n = Math.max(1, Number(effectif) || 20);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const [mu, sigma] = def.justesse;
    const strat = STRATEGIES.includes(strategieFouille)
      ? strategieFouille
      : rng.pick(['aveugle', 'futee', 'futee', 'mixte']);
    out.push({
      index: i,
      justesse: Number(rng.normalBornee(mu, sigma, 0.05, 0.98).toFixed(3)),
      assiduite: Number(rng.normalBornee(assiduite.mu, assiduite.sigma, 0.5, 1).toFixed(3)),
      veillee: Number(rng.normalBornee(veillee.mu, veillee.sigma, 0, 0.9).toFixed(3)),
      strategieFouille: strat,
      penchants: {
        marche: borne(Number(penchants?.marche ?? rng.uniform(0.1, 0.6)), 0, 1),
        sorts: borne(Number(penchants?.sorts ?? rng.uniform(0.2, 0.7)), 0, 1),
        dons: borne(Number(penchants?.dons ?? rng.uniform(0.1, 0.5)), 0, 1),
      },
    });
  }
  return out;
}

/** Résumé anonyme d'une classe (moyennes), pour le rapport. */
function resumerPersonas(personas) {
  const list = Array.isArray(personas) ? personas : [];
  const moy = (f) => (list.length ? list.reduce((a, p) => a + f(p), 0) / list.length : null);
  return {
    effectif: list.length,
    justesseMoyenne: moy((p) => p.justesse),
    assiduiteMoyenne: moy((p) => p.assiduite),
    veilleeMoyenne: moy((p) => p.veillee),
    strategies: Object.fromEntries(
      STRATEGIES.map((s) => [s, list.filter((p) => p.strategieFouille === s).length]),
    ),
    penchants: {
      marche: moy((p) => p.penchants.marche),
      sorts: moy((p) => p.penchants.sorts),
      dons: moy((p) => p.penchants.dons),
    },
  };
}

module.exports = { PROFILS, STRATEGIES, genererPersonas, resumerPersonas };
