'use strict';

/**
 * Suggestion de métier et de format d'une tâche (migration 329) — point d'entrée serveur.
 * Les règles vivent dans le noyau partagé `src/shared/taskCategoryGuessCore.js` (le
 * formulaire de tâche s'en sert aussi) ; miroir CJS `lib/shared/taskCategoryGuessCore.js`.
 */

module.exports = require('../shared/taskCategoryGuessCore');
