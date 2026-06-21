'use strict';

function trimStr(value) {
  if (value == null) return '';
  return String(value).trim();
}

function parseNumberish(value) {
  const s = trimStr(value).replace(',', '.');
  if (!s) return NaN;
  return Number(s);
}

/**
 * Parse un texte de plage pH (ex. « 6,0-7,5 », « 6.5 »).
 * @returns {{ min: number, max: number } | null}
 */
function parsePhRangeText(text) {
  const s = trimStr(text);
  if (!s) return null;

  const range = s.match(/^(-?\d+(?:[.,]\d+)?)\s*[-/–]\s*(-?\d+(?:[.,]\d+)?)$/);
  if (range) {
    const a = parseNumberish(range[1]);
    const b = parseNumberish(range[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return { min: Math.min(a, b), max: Math.max(a, b) };
  }

  const single = parseNumberish(s);
  if (Number.isFinite(single)) return { min: single, max: single };
  return null;
}

/**
 * Parse un texte de plage de température °C (ex. « 15-25 », « 20 »).
 * @returns {{ min: number, max: number } | null}
 */
function parseTempRangeText(text) {
  const s = trimStr(text);
  if (!s) return null;

  const range = s.match(/^(-?\d+(?:[.,]\d+)?)\s*[-/–]\s*(-?\d+(?:[.,]\d+)?)\s*(?:°?\s*c)?$/i);
  if (range) {
    const a = parseNumberish(range[1]);
    const b = parseNumberish(range[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return { min: Math.min(a, b), max: Math.max(a, b) };
  }

  const singleMatch = s.match(/^(-?\d+(?:[.,]\d+)?)\s*(?:°?\s*c)?$/i);
  if (singleMatch) {
    const single = parseNumberish(singleMatch[1]);
    if (Number.isFinite(single)) return { min: single, max: single };
  }
  return null;
}

function resolvePlantTaxonomy(row) {
  const source = row && typeof row === 'object' ? row : {};
  return {
    kingdom: trimStr(source.taxon_kingdom) || null,
    group: trimStr(source.taxon_group) || null,
    family: trimStr(source.taxon_family) || null,
    genus: trimStr(source.taxon_genus) || null,
    scientificName: trimStr(source.scientific_name) || null,
    gbifKey: source.gbif_key != null && source.gbif_key !== '' ? Number(source.gbif_key) : null,
  };
}

function resolvePlantPhRange(row) {
  const source = row && typeof row === 'object' ? row : {};
  const colMin = source.ph_min != null && source.ph_min !== '' ? Number(source.ph_min) : NaN;
  const colMax = source.ph_max != null && source.ph_max !== '' ? Number(source.ph_max) : NaN;
  if (Number.isFinite(colMin) && Number.isFinite(colMax)) {
    return { min: Math.min(colMin, colMax), max: Math.max(colMin, colMax), source: 'columns' };
  }
  return null;
}

function resolvePlantTempRange(row) {
  const source = row && typeof row === 'object' ? row : {};
  const colMin =
    source.temp_min_c != null && source.temp_min_c !== '' ? Number(source.temp_min_c) : NaN;
  const colMax =
    source.temp_max_c != null && source.temp_max_c !== '' ? Number(source.temp_max_c) : NaN;
  if (Number.isFinite(colMin) && Number.isFinite(colMax)) {
    return { min: Math.min(colMin, colMax), max: Math.max(colMin, colMax), source: 'columns' };
  }
  return null;
}

function enrichPlantRow(row) {
  if (!row || typeof row !== 'object') return row;
  return {
    ...row,
    taxonomy: resolvePlantTaxonomy(row),
    phRange: resolvePlantPhRange(row),
    tempRange: resolvePlantTempRange(row),
  };
}

module.exports = {
  parsePhRangeText,
  parseTempRangeText,
  resolvePlantTaxonomy,
  resolvePlantPhRange,
  resolvePlantTempRange,
  enrichPlantRow,
};
