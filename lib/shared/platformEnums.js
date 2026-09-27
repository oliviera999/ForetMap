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

module.exports = {
  SETTING_SCOPE_ENUM,
};
