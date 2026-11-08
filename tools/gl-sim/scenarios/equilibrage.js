'use strict';

/**
 * Scénario `equilibrage` : rejoue `hybride-reference` (classe moyenne) et `classe-en-difficulte`
 * sur les quatre plateaux pour chaque variante de la grille (`data/gl/sim/grilles/grille-voile.json`
 * ou `--grille <fichier>`). Le rapport met les variantes côte à côte et compare les médianes de la
 * classe moyenne aux références du modèle rapide (`data/gl/sim/modele-rapide-reference.json`).
 */

const { scenario } = require('./base');

module.exports = Object.freeze({
  ...scenario({
    id: 'equilibrage',
    description:
      'Grille de variantes du voile (E1-E4) × classe moyenne / en difficulté × plateaux 1-4.',
  }),
  compose: true,
  grille: true,
  sousScenarios: [
    { id: 'moyenne', classe: 'moyenne', effectif: 20, surface: 'hybride' },
    { id: 'difficulte', classe: 'difficulte', effectif: 20, surface: 'hybride' },
  ],
  plateaux: [1, 2, 3, 4],
});
