'use strict';

/**
 * Réglages du domaine « application » (`app_settings`).
 *
 * Application : textes de la coquille (chargement, serveur indisponible, pied de page), temps
 * réel et filet REST, maintenance, exploitation à distance.
 *
 * Déclarations au format du noyau commun `lib/shared/settingsRegistryCore.js` (+ `scope` :
 * public / teacher / admin), agrégées par `lib/settings/domains.js` dans le registre unique
 * `SETTINGS_REGISTRY` de `lib/settings.js`. Recopiées telles quelles depuis ce registre
 * (piste B, étape B6) : mêmes clés, mêmes défauts, mêmes bornes.
 */

const APP_SETTINGS = {
  'content.app.loader': {
    scope: 'public',
    type: 'string',
    maxLength: 90,
    default: 'Chargement de la forêt…',
  },
  'content.app.server_down_notice': {
    scope: 'public',
    type: 'string',
    maxLength: 180,
    default: 'Serveur indisponible. Nouvel essai automatique toutes les 2 minutes.',
  },
  'content.app.retry_now': {
    scope: 'public',
    type: 'string',
    maxLength: 50,
    default: 'Réessayer maintenant',
  },
  'content.app.footer_version_prefix': {
    scope: 'public',
    type: 'string',
    maxLength: 20,
    default: 'Version',
  },
  /** Coupe-circuit : si false, plus d’émissions Socket.IO `*:changed` (filet REST seul). */
  'runtime.realtime_signals_enabled': { scope: 'public', type: 'boolean', default: true },
  /** Plancher client du filet REST quand le canal live est actif (ms). */
  'runtime.rest_poll_floor_ms': {
    scope: 'public',
    type: 'number',
    min: 60000,
    max: 300000,
    default: 90000,
  },
  /** Plancher client du filet REST onglet arrière-plan (ms). */
  'runtime.rest_poll_background_floor_ms': {
    scope: 'public',
    type: 'number',
    min: 90000,
    max: 600000,
    default: 120000,
  },
  /** Si false : le client ignore sync-state et refetch tout (debug). */
  'runtime.sync_state_enabled': { scope: 'public', type: 'boolean', default: true },
  /** Coalescence des emits `presence:update` vers le staff (ms, 0 = immédiat). */
  'runtime.socket_presence_emit_coalesce_ms': {
    scope: 'public',
    type: 'number',
    min: 0,
    max: 5000,
    default: 500,
  },
  'system.maintenance_mode': { scope: 'teacher', type: 'boolean', default: false },
  'system.maintenance_message': { scope: 'teacher', type: 'string', maxLength: 240, default: '' },
  'ops.allow_remote_restart': { scope: 'admin', type: 'boolean', default: true },
  // Marque de passage de l'alignement unique décrit dans `lib/visitMascotBuiltinSeed.js` :
  // les mascottes livrées dont le fichier d'animation n'existe pas sont retirées de la visite,
  // **une seule fois**. Sans cette marque, l'alignement se rejouerait à chaque démarrage et
  // reprendrait la main sur un administrateur qui aurait délibérément republié l'une d'elles.
  'ops.visit_mascot_unrenderable_aligned_at': {
    scope: 'admin',
    type: 'string',
    maxLength: 40,
    default: '',
    /** Marque one-shot seed — jamais listée dans la grille admin. */
    adminHidden: true,
  },
  'ops.allow_remote_logs': { scope: 'admin', type: 'boolean', default: true },
};

module.exports = { APP_SETTINGS };
