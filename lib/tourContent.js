const { queryOne, execute } = require('../database');
const {
  MAX_ENTRIES,
  MAX_TEXT_LENGTH,
  OVERRIDE_KEY_RE,
  TOUR_EDITABLE_FIELDS,
  normalizeTourRegistry,
  resolveStoredTourRegistry,
  tourRegistrySchema,
} = require('./shared/tourOverridesCore');

/**
 * Surcharges éditoriales des visites guidées **ForetMap** (`DISCOVERY_TOURS`).
 *
 * Les règles — forme des clés, longueurs, « une chaîne vide est un retour au défaut » —
 * vivent dans le noyau partagé `lib/shared/tourOverridesCore.js`, que GL emploie sur sa
 * propre table. Ne restent ici que la clé de réglage et la persistance.
 *
 * Voir `docs/MASCOT_NARRATEUR_OLU.md` §7.1 et §11.4.
 */

const TOUR_REGISTRY_KEY = 'content.tour.registry';

/** Registre stocké, ou `{}` si aucune ligne n'existe ou si la valeur est illisible. */
async function getTourRegistryFromDb() {
  const row = await queryOne('SELECT value_json FROM app_settings WHERE `key` = ?', [
    TOUR_REGISTRY_KEY,
  ]);
  return resolveStoredTourRegistry(row?.value_json);
}

/** Écrit le registre normalisé. Un registre vide efface toute personnalisation. */
async function saveTourRegistryToDb(registry, actor = {}) {
  const normalized = normalizeTourRegistry(registry);
  await execute(
    `INSERT INTO app_settings
      (\`key\`, scope, value_json, updated_by_user_type, updated_by_user_id, updated_at)
     VALUES (?, 'public', ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
      value_json = VALUES(value_json),
      updated_by_user_type = VALUES(updated_by_user_type),
      updated_by_user_id = VALUES(updated_by_user_id),
      updated_at = NOW()`,
    [TOUR_REGISTRY_KEY, JSON.stringify(normalized), actor.userType || null, actor.userId || null],
  );
  return normalized;
}

module.exports = {
  TOUR_REGISTRY_KEY,
  TOUR_EDITABLE_FIELDS,
  MAX_TEXT_LENGTH,
  MAX_ENTRIES,
  OVERRIDE_KEY_RE,
  tourRegistrySchema,
  normalizeTourRegistry,
  getTourRegistryFromDb,
  saveTourRegistryToDb,
};
