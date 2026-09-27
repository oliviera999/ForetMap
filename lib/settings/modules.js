'use strict';

/**
 * Réglages du domaine « modules » (`app_settings`).
 *
 * Interrupteurs de modules (`ui.modules.*`) : un par fonctionnalité activable site par site.
 *
 * Déclarations au format du noyau commun `lib/shared/settingsRegistryCore.js` (+ `scope` :
 * public / teacher / admin), agrégées par `lib/settings/domains.js` dans le registre unique
 * `SETTINGS_REGISTRY` de `lib/settings.js`. Recopiées telles quelles depuis ce registre
 * (piste B, étape B6) : mêmes clés, mêmes défauts, mêmes bornes.
 */

const MODULES_SETTINGS = {
  'ui.modules.tutorials_enabled': { scope: 'public', type: 'boolean', default: true },
  'ui.modules.visit_enabled': { scope: 'public', type: 'boolean', default: true },
  'ui.modules.stats_enabled': { scope: 'public', type: 'boolean', default: true },
  'ui.modules.observations_enabled': { scope: 'public', type: 'boolean', default: true },
  'ui.modules.help_enabled': { scope: 'public', type: 'boolean', default: true },
  'ui.modules.forum_enabled': { scope: 'public', type: 'boolean', default: true },
  'ui.modules.context_comments_enabled': { scope: 'public', type: 'boolean', default: true },
  /** Si false : pas de signalement sur forum ni commentaires contextuels (lecture/réactions inchangées). */
  'ui.modules.reports_enabled': { scope: 'public', type: 'boolean', default: true },
  /** Présence « en ligne » staff (pastilles stats) — cœur partagé `lib/shared/presenceCore.js`. */
  'ui.modules.presence_enabled': { scope: 'public', type: 'boolean', default: true },
  /*
   * Modules pédagogiques adoptés le 25/09/2026 : activables site par site, allumés par défaut
   * pour que rien ne change sur un site existant. Éteint → fermé aux élèves (onglet masqué,
   * routes en 503) mais ouvert au compte qui porte la permission de gestion du module, pour
   * préparer (`lib/pedagoModuleGate.js`).
   */
  /** Clés d'identification dichotomiques (`/api/id-keys`, onglet « Clés »). */
  'ui.modules.id_keys_enabled': { scope: 'public', type: 'boolean', default: true },
  /** Individus suivis et leurs mesures (`/api/individuals`, onglet « Individus »). */
  'ui.modules.individuals_enabled': { scope: 'public', type: 'boolean', default: true },
  /** Séances pédagogiques et leurs exécutions (`/api/pedago-sessions`, onglet « Séances »). */
  'ui.modules.pedago_sessions_enabled': { scope: 'public', type: 'boolean', default: true },
  /** Badges de fin de séance : éteint → rien d'affiché ni d'annoncé, `/api/rewards` en 503 ; les
   * badges mérités restent enregistrés et apparaissent au rallumage. */
  'ui.modules.rewards_enabled': { scope: 'public', type: 'boolean', default: true },
};

module.exports = { MODULES_SETTINGS };
