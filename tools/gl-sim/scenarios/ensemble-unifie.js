'use strict';

/**
 * Scénario `ensemble-unifie` (PR 1a de l'ensemble unifié, § 6.12 du prompt
 * `docs/GL_ENSEMBLE_UNIFIE_PROMPT.md`) : classe moyenne et classe en difficulté, plateaux 1 à 4,
 * graine fixée. Les mesures `ensembleUnifie` de chaque chapitre (`tools/gl-sim/mesures.js`) se
 * lisent sur les règles en vigueur ; rejouer le même scénario, à graine égale, sur le code
 * d'avant donne la colonne « avant ». Le banc mesure : il ne règle rien.
 */

const { scenario } = require('./base');

module.exports = Object.freeze({
  ...scenario({
    id: 'ensemble-unifie',
    description:
      'Ensemble unifié (PR 1a) : classe moyenne / en difficulté × plateaux 1-4, mesures du § 6.12.',
  }),
  compose: true,
  sousScenarios: [
    { id: 'moyenne', classe: 'moyenne', effectif: 20, surface: 'hybride' },
    { id: 'difficulte', classe: 'difficulte', effectif: 20, surface: 'hybride' },
  ],
  plateaux: [1, 2, 3, 4],
});
