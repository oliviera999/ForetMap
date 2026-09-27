/**
 * Référentiel des valeurs énumérées — domaine **plateforme** (réglages). Voir `enumCore.js`.
 *
 * Miroir CJS : `lib/shared/platformEnums.js` (généré, ne pas éditer).
 */

import { defineEnum } from './enumCore.js';

/** Portée d'un réglage : qui peut le lire. */
export const SETTING_SCOPE_ENUM = defineEnum('SETTING_SCOPE_ENUM', {
  values: ['public', 'teacher', 'admin'],
  labels: { public: 'Public', teacher: 'Personnel', admin: 'Administration' },
  columns: ['app_settings.scope'],
});
