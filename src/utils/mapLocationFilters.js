/**
 * Recherche et filtres des zones / repères sur la carte — logique pure.
 * Données déjà chargées côté client (pas d'appel API dédié).
 */

import { detectLeadingMarkerEmoji, stripLeadingMarkerEmoji } from '../constants/emojis.js';
import {
  isInfrastructureLocation,
  locationCategoriesSummary,
  locationCategoryLabels,
  locationHasAnyCategory,
} from './locationCategories.js';

/** État par défaut des filtres carte. */
export const MAP_LOCATION_FILTER_DEFAULTS = Object.freeze({
  text: '',
  kinds: 'both',
  categoryIds: [],
  speciesId: '',
  hasTasks: '',
  hasTutorials: '',
  infrastructureOnly: false,
});

/** Normalise une chaîne pour comparaison (minuscules, sans accents). */
export function normalizeMapSearchText(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/** Découpe la recherche en tokens (AND). */
export function mapSearchTokens(text) {
  const norm = normalizeMapSearchText(text);
  if (!norm) return [];
  return norm.split(/\s+/).filter(Boolean);
}

function appendParts(parts, value) {
  if (value == null || value === '') return;
  if (Array.isArray(value)) {
    for (const v of value) appendParts(parts, v);
    return;
  }
  parts.push(String(value));
}

function speciesNamesFromLocation(item) {
  const names = [];
  for (const s of item?.species || []) {
    appendParts(names, s?.name);
    appendParts(names, s?.common_name);
    appendParts(names, s?.scientific_name);
  }
  appendParts(names, item?.living_beings_list);
  return names;
}

function visitTextParts(item) {
  return [
    item?.visit_subtitle,
    item?.visit_short_description,
    item?.visit_details_title,
    item?.visit_details_text,
  ];
}

/**
 * Texte indexé pour la recherche libre (zone).
 * @param {object} zone
 * @param {string[]} [emojiParsingList]
 */
export function buildZoneSearchBlob(zone, emojiParsingList = []) {
  const parts = [];
  const name = zone?.name || '';
  appendParts(parts, name);
  appendParts(parts, stripLeadingMarkerEmoji(name, emojiParsingList));
  appendParts(parts, detectLeadingMarkerEmoji(name, emojiParsingList));
  appendParts(parts, zone?.description);
  appendParts(parts, speciesNamesFromLocation(zone));
  appendParts(parts, visitTextParts(zone));
  appendParts(parts, locationCategoryLabels(zone));
  return normalizeMapSearchText(parts.join(' '));
}

/** Texte indexé pour la recherche libre (repère). */
export function buildMarkerSearchBlob(marker) {
  const parts = [];
  appendParts(parts, marker?.label);
  appendParts(parts, marker?.emoji);
  appendParts(parts, marker?.note);
  appendParts(parts, speciesNamesFromLocation(marker));
  appendParts(parts, visitTextParts(marker));
  appendParts(parts, locationCategoryLabels(marker));
  return normalizeMapSearchText(parts.join(' '));
}

function textMatches(blob, tokens) {
  if (!tokens.length) return true;
  return tokens.every((t) => blob.includes(t));
}

function triStateMatches(value, expected) {
  if (!expected) return true;
  return expected === 'yes' ? Boolean(value) : !value;
}

function locationHasSpecies(item, speciesId) {
  if (!speciesId) return true;
  const sid = String(speciesId);
  const ids = item?.species_ids || [];
  if (ids.some((id) => String(id) === sid)) return true;
  return (item?.species || []).some((s) => String(s?.id) === sid);
}

/**
 * @param {object} zone
 * @param {typeof MAP_LOCATION_FILTER_DEFAULTS} filters
 * @param {object} context
 * @param {Map<string, *>} [context.zoneTaskVisualById]
 * @param {Map<string, number>} [context.zoneTutorialCountById]
 * @param {string[]} [context.emojiParsingList]
 */
export function zoneMatchesMapFilters(zone, filters, context = {}) {
  if (!zone) return false;
  const f = { ...MAP_LOCATION_FILTER_DEFAULTS, ...filters };
  if (f.kinds === 'markers') return false;
  if (f.infrastructureOnly && !isInfrastructureLocation(zone)) return false;
  if (!locationHasAnyCategory(zone, f.categoryIds)) return false;
  if (!locationHasSpecies(zone, f.speciesId)) return false;
  const hasTasks = context.zoneTaskVisualById?.has?.(String(zone.id));
  if (!triStateMatches(hasTasks, f.hasTasks)) return false;
  const tutCount = context.zoneTutorialCountById?.get?.(String(zone.id)) || 0;
  if (!triStateMatches(tutCount > 0, f.hasTutorials)) return false;
  const tokens = mapSearchTokens(f.text);
  if (tokens.length) {
    const blob = buildZoneSearchBlob(zone, context.emojiParsingList);
    if (!textMatches(blob, tokens)) return false;
  }
  return true;
}

export function markerMatchesMapFilters(marker, filters, context = {}) {
  if (!marker) return false;
  const f = { ...MAP_LOCATION_FILTER_DEFAULTS, ...filters };
  if (f.kinds === 'zones') return false;
  if (f.infrastructureOnly && !isInfrastructureLocation(marker)) return false;
  if (!locationHasAnyCategory(marker, f.categoryIds)) return false;
  if (!locationHasSpecies(marker, f.speciesId)) return false;
  const hasTasks = context.markerTaskVisualById?.has?.(String(marker.id));
  if (!triStateMatches(hasTasks, f.hasTasks)) return false;
  const tutCount = context.markerTutorialCountById?.get?.(String(marker.id)) || 0;
  if (!triStateMatches(tutCount > 0, f.hasTutorials)) return false;
  const tokens = mapSearchTokens(f.text);
  if (tokens.length) {
    const blob = buildMarkerSearchBlob(marker);
    if (!textMatches(blob, tokens)) return false;
  }
  return true;
}

/** Filtre actif (recherche ou critère structuré). */
export function isMapLocationFilterActive(filters) {
  const f = { ...MAP_LOCATION_FILTER_DEFAULTS, ...filters };
  if (normalizeMapSearchText(f.text)) return true;
  if (f.kinds !== 'both') return true;
  if (f.categoryIds?.length) return true;
  if (f.speciesId) return true;
  if (f.hasTasks) return true;
  if (f.hasTutorials) return true;
  if (f.infrastructureOnly) return true;
  return false;
}

/** Nombre de filtres structurés actifs (hors recherche texte). */
export function countActiveMapLocationFilters(filters) {
  const f = { ...MAP_LOCATION_FILTER_DEFAULTS, ...filters };
  let n = 0;
  if (f.kinds !== 'both') n += 1;
  if (f.categoryIds?.length) n += 1;
  if (f.speciesId) n += 1;
  if (f.hasTasks) n += 1;
  if (f.hasTutorials) n += 1;
  if (f.infrastructureOnly) n += 1;
  return n;
}

/** Espèces présentes sur la carte (pour le select). */
export function collectMapSpeciesOptions(zones = [], markers = []) {
  const byId = new Map();
  const ingest = (item) => {
    for (const s of item?.species || []) {
      const id = s?.id != null ? String(s.id) : '';
      if (!id || byId.has(id)) continue;
      const label = String(s.name || s.common_name || s.scientific_name || id).trim();
      byId.set(id, label || id);
    }
  };
  for (const z of zones) ingest(z);
  for (const m of markers) ingest(m);
  return [...byId.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
}

function zoneResultSubtitle(zone) {
  return locationCategoriesSummary(zone);
}

function markerResultSubtitle(marker) {
  const categories = locationCategoriesSummary(marker);
  if (categories) return categories;
  const note = String(marker?.note || '').trim();
  if (!note) return '';
  return note.length > 48 ? `${note.slice(0, 45)}…` : note;
}

/**
 * Applique les filtres et produit les ensembles de correspondance + liste triée.
 * @returns {{
 *   matchingZoneIds: Set<string>,
 *   matchingMarkerIds: Set<string>,
 *   resultItems: Array<{ kind: 'zone'|'marker', id: string, title: string, emoji: string, subtitle: string, item: object }>,
 *   filterActive: boolean,
 * }}
 */
export function applyMapLocationFilters({
  zones = [],
  markers = [],
  filters = MAP_LOCATION_FILTER_DEFAULTS,
  context = {},
} = {}) {
  const filterActive = isMapLocationFilterActive(filters);
  const matchingZoneIds = new Set();
  const matchingMarkerIds = new Set();
  const resultItems = [];

  for (const zone of zones) {
    if (!zoneMatchesMapFilters(zone, filters, context)) continue;
    const id = String(zone.id);
    matchingZoneIds.add(id);
    const emojiList = context.emojiParsingList || [];
    const emoji = detectLeadingMarkerEmoji(zone.name || '', emojiList) || '🌿';
    const title = stripLeadingMarkerEmoji(zone.name || '', emojiList) || zone.name || id;
    resultItems.push({
      kind: 'zone',
      id,
      title,
      emoji,
      subtitle: zoneResultSubtitle(zone),
      item: zone,
    });
  }

  for (const marker of markers) {
    if (!markerMatchesMapFilters(marker, filters, context)) continue;
    const id = String(marker.id);
    matchingMarkerIds.add(id);
    resultItems.push({
      kind: 'marker',
      id,
      title: marker.label || id,
      emoji: marker.emoji || '📍',
      subtitle: markerResultSubtitle(marker),
      item: marker,
    });
  }

  resultItems.sort((a, b) => {
    const ta = normalizeMapSearchText(a.title);
    const tb = normalizeMapSearchText(b.title);
    if (ta !== tb) return ta.localeCompare(tb, 'fr');
    if (a.kind !== b.kind) return a.kind === 'zone' ? -1 : 1;
    return a.id.localeCompare(b.id);
  });

  return { matchingZoneIds, matchingMarkerIds, resultItems, filterActive };
}
