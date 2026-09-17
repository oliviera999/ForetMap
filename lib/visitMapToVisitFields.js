'use strict';

/**
 * Liste blanche carte → visite : seuls ces champs sont reportés.
 * `restricted_note` ne peut jamais atterrir dans subtitle / short_description /
 * details_* / body_json (pas de SELECT * ni de spread d'entité source).
 */

const { normalizeMarkerEmoji } = require('./markerEmoji');
const {
  serializeRoleSlugList,
  parseRoleSlugList,
  serializeGroupIdList,
  parseGroupIdList,
} = require('./locationAudience');

function textOrEmpty(value) {
  if (value == null) return '';
  return String(value);
}

/** Normalise une valeur audience SQL (TEXT JSON) pour INSERT/UPDATE visite. */
function audienceSqlValue(value) {
  if (value == null || value === '') return null;
  const list = parseRoleSlugList(value);
  return serializeRoleSlugList(list) || null;
}

/** Même normalisation pour les listes de groupes (migration 262). */
function audienceGroupsSqlValue(value) {
  if (value == null || value === '') return null;
  const list = parseGroupIdList(value);
  return list.length ? serializeGroupIdList(list) : null;
}

function restrictedNoteSqlValue(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

/**
 * Champs reportés depuis une zone carte vers visit_zones (liste blanche).
 * @param {object} zone ligne `zones` (id, map_id, name, points, description, audience…)
 * @returns {object} champs visit_zones autorisés (sans éditorial details/body)
 */
function mapZoneToVisitWhitelistFields(zone) {
  const points =
    zone.points != null
      ? typeof zone.points === 'string'
        ? zone.points
        : JSON.stringify(zone.points)
      : '[]';
  return {
    id: zone.id,
    map_id: zone.map_id,
    name: String(zone.name || '').trim() || zone.id,
    points,
    short_description: textOrEmpty(zone.description).trim(),
    visible_role_slugs: audienceSqlValue(zone.visible_role_slugs),
    visible_group_ids: audienceGroupsSqlValue(zone.visible_group_ids),
    restricted_note: restrictedNoteSqlValue(zone.restricted_note),
    restricted_note_role_slugs: audienceSqlValue(zone.restricted_note_role_slugs),
    restricted_note_group_ids: audienceGroupsSqlValue(zone.restricted_note_group_ids),
  };
}

/**
 * Champs reportés depuis un repère carte vers visit_markers (liste blanche).
 * @param {object} marker ligne `map_markers`
 */
function mapMarkerToVisitWhitelistFields(marker) {
  return {
    id: marker.id,
    map_id: marker.map_id,
    x_pct: Number(marker.x_pct),
    y_pct: Number(marker.y_pct),
    label: String(marker.label || '').trim() || marker.id,
    emoji: normalizeMarkerEmoji(marker.emoji, { allowEmpty: true, fallback: '' }),
    short_description: textOrEmpty(marker.note).trim(),
    visible_role_slugs: audienceSqlValue(marker.visible_role_slugs),
    visible_group_ids: audienceGroupsSqlValue(marker.visible_group_ids),
    restricted_note: restrictedNoteSqlValue(marker.restricted_note),
    restricted_note_role_slugs: audienceSqlValue(marker.restricted_note_role_slugs),
    restricted_note_group_ids: audienceGroupsSqlValue(marker.restricted_note_group_ids),
  };
}

/**
 * Vérifie qu'aucune valeur publique visit ne contient le texte de restricted_note
 * (garde de non-régression pour les tests / audits).
 */
function publicVisitFieldsLeakRestrictedNote(visitRow, restrictedNote) {
  const secret = String(restrictedNote || '').trim();
  if (!secret) return false;
  const publicFields = [
    visitRow.subtitle,
    visitRow.short_description,
    visitRow.details_title,
    visitRow.details_text,
    visitRow.body_json,
    visitRow.name,
    visitRow.label,
  ];
  return publicFields.some((v) => v != null && String(v).includes(secret));
}

module.exports = {
  mapZoneToVisitWhitelistFields,
  mapMarkerToVisitWhitelistFields,
  audienceSqlValue,
  audienceGroupsSqlValue,
  restrictedNoteSqlValue,
  publicVisitFieldsLeakRestrictedNote,
};
