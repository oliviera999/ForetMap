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

const { queryOne } = require('../database');
const { nowDbTimestamp } = require('./shared/isoTimestamp');
const {
  mapZoneToVisitWhitelistFields,
  mapMarkerToVisitWhitelistFields,
} = require('./visitMapToVisitFields');
const {
  EDIT_CONFLICT_CODE,
  EDIT_CONFLICT_MESSAGE,
  claimEditRevision,
  readExpectedRevision,
  releaseEditRevision,
} = require('./editRevision');

/** Table carte dont la révision protège l'identité recopiée depuis la visite. */
const IDENTITY_TABLE = Object.freeze({
  zone: 'zones',
  marker: 'map_markers',
});

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

/**
 * Autorise la recopie de l'identité (nom, forme, position, emoji) depuis l'éditeur de visite
 * vers la carte.
 *
 * Le formulaire renvoie toujours le nom — et l'emoji d'un repère — tel qu'il l'a ouvert.
 * Sans révision, recopier cette valeur annule un renommage ou un emoji enregistré entre-temps
 * sur la carte. L'identité n'est donc appliquée que si `expected_revision` correspond.
 * Une révision absente est refusée (409) : un client qui n'envoie pas la révision ne doit
 * plus pouvoir écraser. L'écrasement volontaire renvoie la `current_revision` du 409.
 * Si l'identité n'a pas changé, rien n'est réservé : un texte de visite s'enregistre sans
 * faire avancer la révision de la carte.
 *
 * @param {'zone'|'marker'} kind
 * @param {string} id
 * @param {object} body
 * @param {boolean} identityChanged
 * @returns {Promise<{ apply: boolean, claim: object|null, error?: { status: number, body: object }, missing?: boolean }>}
 */
async function claimVisitIdentityWrite(kind, id, body, identityChanged) {
  if (!identityChanged) return { apply: false, claim: null };
  const table = IDENTITY_TABLE[kind];
  if (!table) throw new TypeError(`Lieu de visite inconnu : ${kind}`);
  const expected = readExpectedRevision(body);
  if (expected === undefined) {
    return { error: { status: 400, body: { error: 'expected_revision invalide' } } };
  }
  if (expected === null) {
    const row = await queryOne(`SELECT edit_revision FROM ${table} WHERE id = ?`, [id]);
    return {
      error: {
        status: 409,
        body: {
          error: EDIT_CONFLICT_MESSAGE,
          code: EDIT_CONFLICT_CODE,
          current_revision: row ? Number(row.edit_revision) || 0 : 0,
        },
      },
    };
  }
  const claim = await claimEditRevision(table, id, body);
  if (claim.error) return { error: claim.error };
  if (claim.revision == null) return { apply: false, claim: null, missing: true };
  return { apply: true, claim };
}

/** Rend la révision réservée si l'écriture d'identité n'a pas abouti. */
async function releaseVisitIdentityWrite(kind, id, claim) {
  const table = IDENTITY_TABLE[kind];
  if (!table || !claim) return;
  await releaseEditRevision(table, id, claim);
}

module.exports = {
  mirrorLocationToVisit,
  claimVisitIdentityWrite,
  releaseVisitIdentityWrite,
  VISIT_MIRROR_TABLES: MIRROR,
};
