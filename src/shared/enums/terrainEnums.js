/**
 * Référentiel des valeurs énumérées — domaine **terrain** (lieux, catégories, parcours,
 * surfaces d'affichage). Voir `enumCore.js`.
 *
 * `SURFACE_ENUM` décrit des colonnes `SET` : MySQL encode un `SET` par position de bit,
 * toute surface nouvelle s'ajoute donc **en fin de liste** (voir `lib/locationSurfaces.js`).
 *
 * Miroir CJS : `lib/shared/terrainEnums.js` (généré, ne pas éditer).
 */

import { defineEnum } from './enumCore.js';

/** Type de lieu : zone dessinée ou repère ponctuel. */
export const LOCATION_KIND_ENUM = defineEnum('LOCATION_KIND_ENUM', {
  values: ['zone', 'marker'],
  labels: { zone: 'Zone', marker: 'Repère' },
  columns: [
    'location_links.location_kind',
    'location_notes.location_kind',
    'map_route_steps.target_type',
  ],
});

/** Lieux auxquels une catégorie s'applique. */
export const CATEGORY_APPLIES_TO_ENUM = defineEnum('CATEGORY_APPLIES_TO_ENUM', {
  values: ['zone', 'marker', 'both'],
  labels: { zone: 'Zones seules', marker: 'Repères seuls', both: 'Zones et repères' },
  columns: ['location_categories.applies_to'],
});

/**
 * Surfaces d'affichage d'un lieu (SET) : carte de travail, Visite, plan public, plan des
 * personnels, plan e-nov (migration 313).
 */
export const SURFACE_ENUM = defineEnum('SURFACE_ENUM', {
  values: ['map', 'visit', 'plan', 'staff', 'enov'],
  labels: {
    map: 'Carte',
    visit: 'Visite',
    plan: 'Plan public',
    staff: 'Plan personnels',
    enov: 'Plan e-nov',
  },
  columns: [
    'location_categories.surfaces',
    'map_markers.hidden_surfaces',
    'map_routes.surfaces',
    'zones.hidden_surfaces',
  ],
});

/** Statut d'une observation d'espèce signalée par un élève (migration 307). */
export const SPECIES_OBSERVATION_STATUS_ENUM = defineEnum('SPECIES_OBSERVATION_STATUS_ENUM', {
  values: ['soumise', 'validee', 'refusee'],
  labels: {
    soumise: 'En attente de validation',
    validee: 'Validée',
    refusee: 'Non retenue',
  },
  columns: ['species_observations.status'],
});
