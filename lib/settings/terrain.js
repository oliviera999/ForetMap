'use strict';

/**
 * Réglages du domaine « terrain » (`app_settings`).
 *
 * Terrain : cartes (carte par défaut, affichage des zones et repères, orientation), Visite
 * publique (cartes servies, textes, mascotte) et carnet d'observations.
 *
 * Déclarations au format du noyau commun `lib/shared/settingsRegistryCore.js` (+ `scope` :
 * public / teacher / admin), agrégées par `lib/settings/domains.js` dans le registre unique
 * `SETTINGS_REGISTRY` de `lib/settings.js`. Recopiées telles quelles depuis ce registre
 * (piste B, étape B6) : mêmes clés, mêmes défauts, mêmes bornes.
 */

const { CATEGORY_IDS_SETTING_MAX_LENGTH } = require('../categoryIdsSetting');

const TERRAIN_SETTINGS = {
  'ui.map.default_map_student': {
    scope: 'public',
    type: 'string',
    maxLength: 32,
    default: 'foret',
  },
  'ui.map.default_map_teacher': {
    scope: 'public',
    type: 'string',
    maxLength: 32,
    default: 'foret',
  },
  'ui.map.default_map_visit': { scope: 'public', type: 'string', maxLength: 32, default: 'foret' },
  'ui.map.location_emojis': { scope: 'public', type: 'string', default: '' },
  /**
   * Catégories cochées d'office à l'ouverture (lot 5 du plan de convergence) : un plan
   * lisible commence par montrer peu. Une liste d'identifiants séparés par `;` — vide = tout.
   * Un réglage **par surface** : la carte de travail, la Visite et le Plan n'ont ni le même
   * public ni la même densité (`ui.plan.default_category_ids`, `lib/settings/plan.js`).
   */
  'ui.map.default_category_ids': {
    scope: 'public',
    type: 'string',
    maxLength: CATEGORY_IDS_SETTING_MAX_LENGTH,
    default: '',
  },
  'ui.visit.default_category_ids': {
    scope: 'public',
    type: 'string',
    maxLength: CATEGORY_IDS_SETTING_MAX_LENGTH,
    default: '',
  },
  /**
   * Cartes servies sur la Visite publique (`;`-séparées). Vide = les cartes actives **moins**
   * celles déclarées pour les plans gardés (`ui.plan.map_id`, `ui.staff_plan.*`) — voir
   * `lib/surfaceAccess.js`, `allowedVisitMapIds`. Portée `admin` : la liste des cartes d'un
   * établissement n'a pas à figurer dans `/api/settings/public`
   * (`docs/AUDIT_SECURITE_2026-09-22.md` S10).
   */
  'ui.visit.selectable_map_ids': {
    scope: 'admin',
    type: 'string',
    maxLength: 512,
    default: '',
  },
  /** Distance entre centres emoji et libellé sur la carte (zones SVG et repères). */
  'ui.map.emoji_label_center_gap': {
    scope: 'public',
    type: 'number',
    min: 6,
    max: 32,
    default: 14,
  },
  /** Échelle des emojis zones/repères (%), 100 = ratio repère/plateau à hauteur de référence (~480 px). */
  'ui.map.overlay_emoji_size_percent': {
    scope: 'public',
    type: 'number',
    min: 50,
    max: 200,
    default: 100,
  },
  /** Échelle des libellés sous les repères (% du ratio repère/plateau). */
  'ui.map.overlay_label_size_percent': {
    scope: 'public',
    type: 'number',
    min: 50,
    max: 200,
    default: 100,
  },
  /** Grossissement des étiquettes au zoom (% : 0 = taille apparente constante, 100 = linéaire). */
  'ui.map.overlay_zoom_growth_percent': {
    scope: 'public',
    type: 'number',
    min: 0,
    max: 100,
    default: 35,
  },
  /** Seuil masquage adaptatif des noms de zone : côté minimal ≈ facteur × hauteur du libellé (px écran). */
  'ui.map.zone_label_min_side_factor': {
    scope: 'public',
    type: 'number',
    min: 1,
    max: 6,
    default: 2.5,
  },
  /** Ratio repères / plateau GL et cartes (% ; source unique ForetMap + GL). */
  'ui.map.plateau_marker_size_percent': {
    scope: 'public',
    type: 'number',
    min: 50,
    max: 200,
    default: 100,
  },
  /** 0 = illimité. Plafond de caractères d’un article du carnet (parité GL). */
  'observations.journal_max_chars': {
    scope: 'teacher',
    type: 'number',
    min: 0,
    max: 200000,
    default: 0,
  },
  /** 0 = illimité. Plafond d’illustrations par article du carnet. */
  'observations.journal_max_assets': {
    scope: 'teacher',
    type: 'number',
    min: 0,
    max: 200,
    default: 0,
  },
  'content.visit.title': {
    scope: 'public',
    type: 'string',
    maxLength: 80,
    default: '🧭 Visite de la carte',
  },
  'content.visit.subtitle': {
    scope: 'public',
    type: 'string',
    maxLength: 200,
    default: 'Explore les zones et repères, puis marque ce que tu as déjà vu.',
  },
  'content.visit.empty_selection': {
    scope: 'public',
    type: 'string',
    maxLength: 160,
    default: 'Sélectionne une zone ou un repère pour afficher les détails.',
  },
  'content.visit.tutorials_title': {
    scope: 'public',
    type: 'string',
    maxLength: 100,
    default: '📘 Tutoriels de la visite',
  },
  'content.visit.tutorials_empty': {
    scope: 'public',
    type: 'string',
    maxLength: 120,
    default: 'Aucun tutoriel sélectionné pour le moment.',
  },
  'content.visit.mascot_dialog.defaults': {
    scope: 'public',
    type: 'string',
    maxLength: 12000,
    default: '{}',
  },
  'content.visit.mascot_dialog.catalog_overrides': {
    scope: 'public',
    type: 'string',
    maxLength: 24000,
    default: '{}',
  },
  // `ui.visit.mascot.allowed_ids` **a été retiré** (étape 3 de la fusion catalogue / packs).
  // C'était une liste blanche d'identifiants : dès qu'un administrateur en décochait une, la
  // liste se figeait sur les mascottes existant ce jour-là, et toute mascotte ajoutée ensuite —
  // un pack importé — en était absente donc invisible, sans que rien ne le signale.
  //
  // « Proposée aux visiteurs » est désormais `is_published` sur la ligne de la mascotte. Retirer
  // la clé du registre est ce qui **ferme la classe de défaut** : sans clé, `setSetting` la
  // refuse, `loadFlatSettings` ignore une éventuelle ligne résiduelle, et la charge publique ne
  // la porte plus — côté client, `allowed_ids` retombe donc sur `[]`, c'est-à-dire « aucune
  // restriction », partout et par construction. La bascule des installations existantes est
  // faite au démarrage par `lib/visitMascotVisibility.js`.
  // Vide = mascotte par défaut livrée avec l'application (résolue par le catalogue front).
  'ui.visit.mascot.default_id': {
    scope: 'public',
    type: 'string',
    maxLength: 80,
    default: '',
  },
  /** Autorise le mode « Orienter » sur la carte de travail ForetMap. */
  'ui.map.heading_up_enabled': { scope: 'public', type: 'boolean', default: false },
  /**
   * Affiche les pastilles violettes sur la carte (zones et repères) pour signaler
   * l’association à un ou plusieurs tutoriels. Défaut false = pastilles invisibles.
   */
  'ui.map.show_tutorial_dots': { scope: 'public', type: 'boolean', default: false },
  /** Autorise le mode « Orienter » (et Me situer) sur la Visite. */
  'ui.visit.heading_up_enabled': { scope: 'public', type: 'boolean', default: false },
};

module.exports = { TERRAIN_SETTINGS };
