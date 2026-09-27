'use strict';

/**
 * Réglages du domaine « aide » (`app_settings`).
 *
 * Aide : bulles et panneaux d'aide contextuelle, page « À propos ».
 *
 * Déclarations au format du noyau commun `lib/shared/settingsRegistryCore.js` (+ `scope` :
 * public / teacher / admin), agrégées par `lib/settings/domains.js` dans le registre unique
 * `SETTINGS_REGISTRY` de `lib/settings.js`. Recopiées telles quelles depuis ce registre
 * (piste B, étape B6) : mêmes clés, mêmes défauts, mêmes bornes.
 */

const { brandText } = require('../brand');

const HELP_SETTINGS = {
  'ui.help.show_context_hints': { scope: 'public', type: 'boolean', default: true },
  'ui.help.pulse_unseen_panels': { scope: 'public', type: 'boolean', default: true },
  'content.about.title': { scope: 'public', type: 'string', maxLength: 80, default: 'ℹ️ À propos' },
  'content.about.subtitle': {
    scope: 'public',
    type: 'string',
    maxLength: 120,
    default: 'Informations du projet ForetMap',
  },
  'content.about.purpose_title': {
    scope: 'public',
    type: 'string',
    maxLength: 80,
    default: "Objet de l'application",
  },
  'content.about.purpose_body': {
    scope: 'public',
    type: 'string',
    maxLength: 500,
    default: brandText(
      '{app} aide les n3beurs et les n3boss du {org} à organiser les activités de la forêt comestible: suivi des zones, de la biodiversité, des tâches et des observations.',
      '{app} aide à organiser les activités de la forêt comestible: suivi des zones, de la biodiversité, des tâches et des observations.',
    ),
  },
  'content.about.site_issues_title': {
    scope: 'public',
    type: 'string',
    maxLength: 120,
    default: 'Audit interne (réservé aux administrateurs)',
  },
  'content.about.docs_title': {
    scope: 'public',
    type: 'string',
    maxLength: 60,
    default: 'Documentation',
  },
  'content.about.help_title': {
    scope: 'public',
    type: 'string',
    maxLength: 60,
    default: 'Aide contextuelle',
  },
  'content.about.help_body': {
    scope: 'public',
    type: 'string',
    maxLength: 240,
    default: 'Si les bulles d aide ont ete masquées, tu peux les reactiver ici.',
  },
  'content.about.help_reenable_cta': {
    scope: 'public',
    type: 'string',
    maxLength: 70,
    default: 'Reactiver toutes les aides',
  },
  'content.about.help_reset_metrics_cta': {
    scope: 'public',
    type: 'string',
    maxLength: 90,
    default: 'Reinitialiser les compteurs d aide',
  },
  'content.help.hint_prefix': {
    scope: 'public',
    type: 'string',
    maxLength: 40,
    default: 'Astuce : ',
  },
  'content.help.panel_title_prefix': {
    scope: 'public',
    type: 'string',
    maxLength: 8,
    default: '💡',
  },
  'content.help.panel_close_cta': {
    scope: 'public',
    type: 'string',
    maxLength: 40,
    default: 'Fermer',
  },
  'content.help.panel_dismiss_cta': {
    scope: 'public',
    type: 'string',
    maxLength: 70,
    default: 'Ne plus afficher',
  },
  'content.help.map_quick_tip': {
    scope: 'public',
    type: 'string',
    maxLength: 180,
    default: 'Clique une zone ou un repère puis ouvre ? pour les actions guidées.',
  },
  'content.help.tasks_quick_tip': {
    scope: 'public',
    type: 'string',
    maxLength: 180,
    default: 'Filtre d abord par carte ou groupe, puis traite les retours en attente.',
  },
  // Vide par défaut : la visite n'affiche plus de mini-astuce au-dessus de la carte.
  // Le réglage reste éditable pour en réintroduire une ponctuellement.
  'content.help.visit_quick_tip': {
    scope: 'public',
    type: 'string',
    maxLength: 180,
    default: '',
  },
};

module.exports = { HELP_SETTINGS };
