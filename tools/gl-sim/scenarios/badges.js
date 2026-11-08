'use strict';

/**
 * Scénario `badges` : un chapitre 1 de référence, puis lecture des badges de chaque élève par
 * `GET /api/gl/rewards/me` (route livrée par une autre étape : `{ rewards: [{ key, family,
 * tier }], progress, catalogue, families, tiers }`). Mesures : part d'élèves avec au moins un
 * palier Fil, répartition par famille, Spearman(justesse ↔ nombre de paliers). Si la route
 * répond 404, le rapport dit « badges non disponibles » et le reste du banc est testé.
 */

const { scenario } = require('./base');

module.exports = Object.freeze({
  ...scenario({
    id: 'badges',
    description:
      'Paliers Fil après un chapitre 1 (GET /api/gl/rewards/me) ; « non disponibles » si la route manque.',
  }),
  badges: true,
});
