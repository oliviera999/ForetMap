/* Fichier généré par scripts/sync-shared-cores.js — ne pas éditer. */
/* Source : src/shared/enums/platformEnums.js — régénérer avec `npm run sync:shared-cores`. */
'use strict';

/**
 * Référentiel des valeurs énumérées — domaine **plateforme** (réglages). Voir `enumCore.js`.
 *
 * Miroir CJS : `lib/shared/platformEnums.js` (généré, ne pas éditer).
 */

const { defineEnum } = require('./enumCore');

/** Portée d'un réglage : qui peut le lire. */
const SETTING_SCOPE_ENUM = defineEnum('SETTING_SCOPE_ENUM', {
  values: ['public', 'teacher', 'admin'],
  labels: { public: 'Public', teacher: 'Personnel', admin: 'Administration' },
  columns: ['app_settings.scope'],
});

/** Mode d'une exécution de la purge planifiée (`retention_purge_runs`, migration 319). */
const RETENTION_PURGE_MODE_ENUM = defineEnum('RETENTION_PURGE_MODE_ENUM', {
  values: ['simulation', 'apply'],
  labels: { simulation: 'Simulation', apply: 'Exécution réelle' },
  columns: ['retention_purge_runs.mode'],
});

/** Issue d'une exécution de la purge planifiée. */
const RETENTION_PURGE_OUTCOME_ENUM = defineEnum('RETENTION_PURGE_OUTCOME_ENUM', {
  values: ['running', 'success', 'blocked', 'failure', 'interrupted'],
  labels: {
    running: 'En cours',
    success: 'Réussie',
    blocked: 'Bloquée par un seuil',
    failure: 'En échec',
    interrupted: 'Interrompue',
  },
  columns: ['retention_purge_runs.outcome'],
});

module.exports = {
  SETTING_SCOPE_ENUM,
  RETENTION_PURGE_MODE_ENUM,
  RETENTION_PURGE_OUTCOME_ENUM,
};
