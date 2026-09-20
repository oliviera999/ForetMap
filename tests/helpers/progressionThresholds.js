'use strict';

/**
 * Seuils de progression n3beur : remise à l'état de référence entre fichiers de test.
 *
 * Les rôles vivent dans la base **partagée** par toute la suite, et certains fichiers
 * déplacent volontairement `min_done_tasks` pour tester un cas limite (`tests/api.test.js`
 * met par exemple `eleve_avance` à 0). Comme chaque fichier est un processus distinct
 * exécuté séquentiellement sur la même base, ces seuils fuient vers les fichiers suivants :
 * tout test qui attend « un nouveau membre de groupe n3beur démarre en novice » devient alors
 * dépendant de l'ordre d'exécution.
 *
 * À appeler dans le `before` d'un fichier qui raisonne sur les paliers, et dans le `after` d'un
 * fichier qui les déplace.
 */

const { execute } = require('../../database');
const { setSetting } = require('../../lib/settings');

/** Seuils du seed (`SYSTEM_ROLES` dans lib/rbac.js). */
const DEFAULT_PROGRESSION_THRESHOLDS = [
  ['eleve_novice', 0],
  ['eleve_avance', 5],
  ['eleve_chevronne', 10],
];

/**
 * Restaure les seuils par défaut et, par défaut, réactive le réglage de progression.
 * @param {{ settings?: boolean }} [options]
 */
async function restoreDefaultProgressionThresholds(options = {}) {
  const { settings = true } = options;
  for (const [slug, min] of DEFAULT_PROGRESSION_THRESHOLDS) {
    await execute('UPDATE roles SET min_done_tasks = ? WHERE slug = ?', [min, slug]);
  }
  if (settings) {
    await setSetting('rbac.progression_by_validated_tasks', true, {});
  }
}

module.exports = {
  DEFAULT_PROGRESSION_THRESHOLDS,
  restoreDefaultProgressionThresholds,
};
