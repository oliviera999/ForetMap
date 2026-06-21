'use strict';

const { parsePhRangeText, parseTempRangeText } = require('./biodivReadModel');

function trimStr(value) {
  if (value == null) return '';
  return String(value).trim();
}

function optionalText(value) {
  const s = trimStr(value);
  return s.length > 0 ? s : null;
}

function optionalInt(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n) : null;
}

function optionalDecimal(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function optionalTinyIntBool(value) {
  if (value == null || value === '') return null;
  if (value === true || value === 1 || value === '1') return 1;
  if (value === false || value === 0 || value === '0') return 0;
  const s = trimStr(value).toLowerCase();
  if (['oui', 'yes', 'true', '1'].includes(s)) return 1;
  if (['non', 'no', 'false', '0'].includes(s)) return 0;
  return null;
}

function formatRangeText(min, max, unit = '') {
  if (min == null || max == null) return null;
  const a = Number(min);
  const b = Number(max);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (lo === hi) return unit ? `${lo}${unit}` : String(lo);
  return unit ? `${lo}-${hi}${unit}` : `${lo}-${hi}`;
}

/**
 * Dual-write expand (import) : legacy group_* / optimal_ph → taxon_* et plages numériques.
 * Après contract Lot 7, les champs legacy sont retirés du payload.
 */
const LEGACY_IMPORT_FIELDS = [
  'group_1',
  'group_2',
  'group_3',
  'group_4',
  'ideal_temperature_c',
  'optimal_ph',
  'agroecosystem_category',
  'longevity',
];

function stripLegacyPlantFields(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  for (const key of LEGACY_IMPORT_FIELDS) {
    delete payload[key];
  }
  return payload;
}

function syncNormalizedAndLegacyPlantFields(payload) {
  if (!payload || typeof payload !== 'object') return payload;

  if (!payload.taxon_kingdom && payload.group_1)
    payload.taxon_kingdom = optionalText(payload.group_1);
  if (!payload.taxon_group && payload.group_2) payload.taxon_group = optionalText(payload.group_2);
  if (!payload.taxon_family && payload.group_3)
    payload.taxon_family = optionalText(payload.group_3);
  if (!payload.taxon_genus && payload.group_4) payload.taxon_genus = optionalText(payload.group_4);

  if (payload.ph_min == null && payload.ph_max == null && payload.optimal_ph) {
    const parsed = parsePhRangeText(payload.optimal_ph);
    if (parsed) {
      payload.ph_min = parsed.min;
      payload.ph_max = parsed.max;
    }
  }
  if (payload.temp_min_c == null && payload.temp_max_c == null && payload.ideal_temperature_c) {
    const parsed = parseTempRangeText(payload.ideal_temperature_c);
    if (parsed) {
      payload.temp_min_c = Math.round(parsed.min);
      payload.temp_max_c = Math.round(parsed.max);
    }
  }

  if (payload.gbif_key != null && payload.gbif_key !== '') {
    const n = Number(payload.gbif_key);
    payload.gbif_key = Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
  }

  payload.taxon_kingdom = optionalText(payload.taxon_kingdom);
  payload.taxon_group = optionalText(payload.taxon_group);
  payload.taxon_family = optionalText(payload.taxon_family);
  payload.taxon_genus = optionalText(payload.taxon_genus);
  payload.ph_min = optionalDecimal(payload.ph_min);
  payload.ph_max = optionalDecimal(payload.ph_max);
  payload.temp_min_c = optionalInt(payload.temp_min_c);
  payload.temp_max_c = optionalInt(payload.temp_max_c);
  payload.is_edible = optionalTinyIntBool(payload.is_edible);
  payload.is_ornamental = optionalTinyIntBool(payload.is_ornamental) ?? 0;

  const habitatTypes = new Set(['terrestre', 'aquatique', 'les_deux']);
  const trophicRoles = new Set(['producteur', 'consommateur', 'decomposeur']);
  const lifeCycles = new Set(['annuelle', 'bisannuelle', 'vivace', 'variable']);
  if (payload.habitat_type && !habitatTypes.has(trimStr(payload.habitat_type).toLowerCase())) {
    payload.habitat_type = null;
  } else if (payload.habitat_type) {
    payload.habitat_type = trimStr(payload.habitat_type).toLowerCase();
  }
  if (payload.trophic_role && !trophicRoles.has(trimStr(payload.trophic_role).toLowerCase())) {
    payload.trophic_role = null;
  } else if (payload.trophic_role) {
    payload.trophic_role = trimStr(payload.trophic_role).toLowerCase();
  }
  if (payload.life_cycle && !lifeCycles.has(trimStr(payload.life_cycle).toLowerCase())) {
    payload.life_cycle = null;
  } else if (payload.life_cycle) {
    payload.life_cycle = trimStr(payload.life_cycle).toLowerCase();
  }

  return stripLegacyPlantFields(payload);
}

module.exports = {
  syncNormalizedAndLegacyPlantFields,
  stripLegacyPlantFields,
  optionalTinyIntBool,
  LEGACY_IMPORT_FIELDS,
};
