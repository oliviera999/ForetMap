'use strict';

/**
 * Audience (rôles + groupes) d'un lieu de visite à l'écriture — partagé par
 * `routes/visit/zones.js` et `routes/visit/markers.js`, qui portaient chacun la même copie
 * (audit du 13/09/2026, §4.4).
 */
const {
  readAudienceWriteFields,
  serializeGroupIdList,
  serializeRoleSlugList,
} = require('./locationAudience');

/** Création : champs d'audience sérialisés pour l'INSERT, ou `{ ok: false, error }`. */
function resolveAudienceForInsert(body) {
  const audienceInput = readAudienceWriteFields(body);
  if (!audienceInput.ok) return audienceInput;
  return {
    ok: true,
    visible_role_slugs: serializeRoleSlugList(audienceInput.visible_role_slugs || []) || null,
    visible_group_ids: serializeGroupIdList(audienceInput.visible_group_ids || []) || null,
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
    visible_group_ids:
      audienceInput.visible_group_ids === null
        ? (exists.visible_group_ids ?? null)
        : serializeGroupIdList(audienceInput.visible_group_ids) || null,
  };
}

module.exports = { resolveAudienceForInsert, resolveAudienceForUpdate };
