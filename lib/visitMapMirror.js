'use strict';

/**
 * Miroir carte → visite : la Visite reflète exactement les zones et repères des cartes.
 *
 * La carte est la seule source des lieux (identité : carte, nom, forme / position, emoji).
 * La ligne `visit_zones` / `visit_markers` qui partage l'`id` du lieu ne porte que ce qui est
 * propre à la visite : textes, blocs éditoriaux, ordre, activation — et une copie de
 * l'identité, tenue à jour ici à chaque écriture sur la carte.
 *
 * - Création sur la carte : la ligne visite est créée (accroche = description du lieu,
 *   visible, audience de la carte).
 * - Modification sur la carte : seule l'identité est recopiée ; les textes de visite, l'ordre,
 *   l'activation et l'audience propre à la visite ne bougent pas.
 * - Suppression sur la carte : `lib/visitTargetCleanup.js` retire la ligne visite.
 *
 * La migration `309_visit_mirror_map_locations.sql` réaligne les données existantes.
 */

const { nowDbTimestamp } = require('./shared/isoTimestamp');
const {
  mapZoneToVisitWhitelistFields,
  mapMarkerToVisitWhitelistFields,
} = require('./visitMapToVisitFields');

const MIRROR = Object.freeze({
  zone: Object.freeze({
    table: 'visit_zones',
    toFields: mapZoneToVisitWhitelistFields,
    identity: (w) => [
      ['name', w.name],
      ['points', w.points],
    ],
  }),
  marker: Object.freeze({
    table: 'visit_markers',
    toFields: mapMarkerToVisitWhitelistFields,
    identity: (w) => [
      ['x_pct', w.x_pct],
      ['y_pct', w.y_pct],
      ['label', w.label],
      ['emoji', w.emoji],
    ],
  }),
});

/**
 * Crée ou met à jour la ligne visite d'un lieu de carte.
 *
 * @param {{ execute: Function }} dbx helpers SQL (pool ou transaction)
 * @param {'zone'|'marker'} kind
 * @param {object} row ligne `zones` / `map_markers` à jour
 * @param {{ now?: string }} [options]
 * @returns {Promise<boolean>} `false` si `kind` inconnu ou ligne absente (no-op)
 */
async function mirrorLocationToVisit(dbx, kind, row, options = {}) {
  const config = MIRROR[kind];
  if (!config || !row || !row.id || !row.map_id) return false;
  const w = config.toFields(row);
  const now = options.now || nowDbTimestamp();
  const identity = [['map_id', w.map_id], ...config.identity(w)];
  const columns = [
    'id',
    ...identity.map(([c]) => c),
    'subtitle',
    'short_description',
    'details_title',
    'details_text',
    'body_json',
    'visible_role_slugs',
    'visible_group_ids',
    'is_active',
    'sort_order',
    'created_at',
    'updated_at',
  ];
  const values = [
    w.id,
    ...identity.map(([, v]) => v),
    '',
    w.short_description,
    'Détails',
    '',
    null,
    w.visible_role_slugs,
    w.visible_group_ids,
    1,
    0,
    now,
    now,
  ];
  const updates = [
    ...identity.map(([c]) => `${c} = VALUES(${c})`),
    'updated_at = VALUES(updated_at)',
  ];
  await dbx.execute(
    `INSERT INTO ${config.table} (${columns.join(', ')})
     VALUES (${columns.map(() => '?').join(', ')})
     ON DUPLICATE KEY UPDATE ${updates.join(', ')}`,
    values,
  );
  return true;
}

module.exports = { mirrorLocationToVisit, VISIT_MIRROR_TABLES: MIRROR };
