'use strict';

/**
 * Audience par rôles d'un lieu de visite (zone ou repère) à l'écriture — partagé par
 * `routes/visit/zones.js` et `routes/visit/markers.js`, qui portaient chacun la même copie
 * (audit du 13/09/2026, §4.4).
 */
const { readAudienceWriteFields, serializeRoleSlugList } = require('./locationAudience');

/** Création : champs d'audience sérialisés pour l'INSERT, ou `{ ok: false, error }`. */
function resolveAudienceForInsert(body) {
  const audienceInput = readAudienceWriteFields(body);
  if (!audienceInput.ok) return audienceInput;
  return {
    ok: true,
    visible_role_slugs: serializeRoleSlugList(audienceInput.visible_role_slugs || []) || null,
    restricted_note: audienceInput.restricted_note || null,
    restricted_note_role_slugs:
      serializeRoleSlugList(audienceInput.restricted_note_role_slugs || []) || null,
  };
}

/** Mise à jour : un champ absent du corps (`null`) conserve la valeur existante. */
function resolveAudienceForUpdate(body, exists) {
  const audienceInput = readAudienceWriteFields(body);
  if (!audienceInput.ok) return audienceInput;
  return {
    ok: true,
    visible_role_slugs:
      audienceInput.visible_role_slugs === null
        ? (exists.visible_role_slugs ?? null)
        : serializeRoleSlugList(audienceInput.visible_role_slugs) || null,
    restricted_note:
      audienceInput.restricted_note === null
        ? (exists.restricted_note ?? null)
        : audienceInput.restricted_note || null,
    restricted_note_role_slugs:
      audienceInput.restricted_note_role_slugs === null
        ? (exists.restricted_note_role_slugs ?? null)
        : serializeRoleSlugList(audienceInput.restricted_note_role_slugs) || null,
  };
}

module.exports = { resolveAudienceForInsert, resolveAudienceForUpdate };
