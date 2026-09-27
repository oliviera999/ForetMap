/* Fichier généré par scripts/sync-shared-cores.js — ne pas éditer. */
/* Source : src/shared/enums/terrainEnums.js — régénérer avec `npm run sync:shared-cores`. */
'use strict';

/**
 * Référentiel des valeurs énumérées — domaine **terrain** (lieux, catégories, parcours,
 * surfaces d'affichage). Voir `enumCore.js`.
 *
 * `SURFACE_ENUM` décrit des colonnes `SET` : MySQL encode un `SET` par position de bit,
 * toute surface nouvelle s'ajoute donc **en fin de liste** (voir `lib/locationSurfaces.js`).
 *
 * Miroir CJS : `lib/shared/terrainEnums.js` (généré, ne pas éditer).
 */

const { defineEnum } = require('./enumCore');

/** Type de lieu : zone dessinée ou repère ponctuel. */
const LOCATION_KIND_ENUM = defineEnum('LOCATION_KIND_ENUM', {
  values: ['zone', 'marker'],
  labels: { zone: 'Zone', marker: 'Repère' },
  columns: [
    'location_links.location_kind',
    'location_notes.location_kind',
    'map_route_steps.target_type',
  ],
});

/** Lieux auxquels une catégorie s'applique. */
const CATEGORY_APPLIES_TO_ENUM = defineEnum('CATEGORY_APPLIES_TO_ENUM', {
  values: ['zone', 'marker', 'both'],
  labels: { zone: 'Zones seules', marker: 'Repères seuls', both: 'Zones et repères' },
  columns: ['location_categories.applies_to'],
});

/** Surfaces d'affichage d'un lieu (SET) : carte de travail, Visite, plan public, plan des personnels. */
const SURFACE_ENUM = defineEnum('SURFACE_ENUM', {
  values: ['map', 'visit', 'plan', 'staff'],
  labels: { map: 'Carte', visit: 'Visite', plan: 'Plan public', staff: 'Plan personnels' },
  columns: [
    'location_categories.surfaces',
    'map_markers.hidden_surfaces',
    'map_routes.surfaces',
    'zones.hidden_surfaces',
  ],
});

module.exports = {
  LOCATION_KIND_ENUM,
  CATEGORY_APPLIES_TO_ENUM,
  SURFACE_ENUM,
};
