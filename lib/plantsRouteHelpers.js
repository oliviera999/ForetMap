'use strict';

/**
 * Logique pure de `routes/plants.js` (O10) : constantes du catalogue biodiversité,
 * normalisations de chaînes, mapping des en-têtes d'import (CSV/XLSX/Google Sheet),
 * validation des liens photo HTTPS et des plages numériques, fusion des valeurs photo,
 * construction du payload plante et du rapport d'import, parsing des identifiants de
 * fiches. Aucune I/O réseau/fichier, aucun accès req/res/DB (le parsing tableur et la
 * dérivation group_4 sont des calculs en mémoire — leurs imports suivent).
 */

const { parseFirstSheetRows } = require('./spreadsheet');
const { applyDerivedGroup4IfEmpty } = require('./plantGroup4');

const PHOTO_FIELDS = [
  'photo',
  'photo_species',
  'photo_leaf',
  'photo_flower',
  'photo_fruit',
  'photo_harvest_part',
];
const PLANT_EXTRA_FIELDS = [
  'second_name',
  'scientific_name',
  'group_1',
  'group_2',
  'group_3',
  'group_4',
  'habitat',
  ...PHOTO_FIELDS,
  'nutrition',
  'agroecosystem_category',
  'longevity',
  'remark_1',
  'remark_2',
  'remark_3',
  'reproduction',
  'size',
  'sources',
  'ideal_temperature_c',
  'optimal_ph',
  'ecosystem_role',
  'geographic_origin',
  'human_utility',
  'harvest_part',
  'planting_recommendations',
  'preferred_nutrients',
];
const PLANT_COLUMNS = ['name', 'emoji', 'description', ...PLANT_EXTRA_FIELDS];
const MAX_PLANT_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_FILE_BYTES = 8 * 1024 * 1024;
const MAX_IMPORT_ROWS = 2000;
const IMPORT_STRATEGIES = new Set(['upsert_name', 'insert_only', 'replace_all']);

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function asTrimmedString(value) {
  if (value == null) return '';
  return String(value).trim();
}

function asOptionalText(value) {
  const s = asTrimmedString(value);
  return s.length > 0 ? s : null;
}

function parseLinkCandidates(value) {
  const raw = asTrimmedString(value);
  if (!raw) return [];
  return raw
    .split(/\n|,\s*/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeHeader(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const HEADER_ALIASES = new Map([
  ['nom', 'name'],
  ['nom_commun', 'name'],
  ['common_name', 'name'],
  ['description_courte', 'description'],
  ['nom_scientifique', 'scientific_name'],
  ['deuxieme_nom', 'second_name'],
  ['groupe_1', 'group_1'],
  ['groupe_2', 'group_2'],
  ['groupe_3', 'group_3'],
  ['groupe_4', 'group_4'],
  ['categorie_agrosysteme', 'agroecosystem_category'],
  ['temperature_ideale_c', 'ideal_temperature_c'],
  ['temperature_ideale', 'ideal_temperature_c'],
  ['ph_optimal', 'optimal_ph'],
  ['role_ecosysteme', 'ecosystem_role'],
  ['origine_geographique', 'geographic_origin'],
  ['utilite_humaine', 'human_utility'],
  ['partie_a_recolter', 'harvest_part'],
  ['recommandations_plantation', 'planting_recommendations'],
  ['nutriments_preferes', 'preferred_nutrients'],
  ['photo_espece', 'photo_species'],
  ['photo_feuille', 'photo_leaf'],
  ['photo_fleur', 'photo_flower'],
  ['photo_fruit', 'photo_fruit'],
  ['photo_partie_recoltee', 'photo_harvest_part'],
  ['sources_url', 'sources'],
]);

const NORMALIZED_CANONICAL_KEYS = new Map(PLANT_COLUMNS.map((k) => [normalizeHeader(k), k]));

function mapImportRowToPlantShape(input = {}) {
  const out = {};
  for (const [rawKey, rawValue] of Object.entries(input || {})) {
    const nk = normalizeHeader(rawKey);
    const canonical = HEADER_ALIASES.get(nk) || NORMALIZED_CANONICAL_KEYS.get(nk);
    if (!canonical) continue;
    out[canonical] = rawValue;
  }
  return out;
}

function parseNumberish(value) {
  const s = asTrimmedString(value).replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function validateRangeText(value, min, max) {
  const s = asTrimmedString(value);
  if (!s) return null;

  const range = s.match(/^(-?\d+(?:[.,]\d+)?)\s*[-/]\s*(-?\d+(?:[.,]\d+)?)$/);
  if (range) {
    const a = Number(range[1].replace(',', '.'));
    const b = Number(range[2].replace(',', '.'));
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 'valeur non numérique';
    if (a > b) return 'intervalle inversé';
    if (a < min || b > max) return `intervalle hors plage (${min}-${max})`;
    return null;
  }

  const n = parseNumberish(s);
  if (!Number.isFinite(n)) return 'valeur non numérique';
  if (n < min || n > max) return `valeur hors plage (${min}-${max})`;
  return null;
}

function detectImageExtensionFromDataUrl(dataUrl) {
  const m = /^data:image\/(png|jpe?g|webp|gif|bmp|avif);base64,/i.exec(dataUrl || '');
  if (!m) return null;
  const ext = String(m[1]).toLowerCase();
  return ext === 'jpeg' ? 'jpg' : ext;
}

function isLocalUploadsPath(value) {
  return /^\/uploads\/[^?#\s]+/i.test(asTrimmedString(value));
}

function isDirectImagePath(value) {
  const raw = asTrimmedString(value);
  return /\.(avif|bmp|gif|jpe?g|png|svg|webp)(?:$|\?)/i.test(raw);
}

function isDevLocalhostHttp(url) {
  if (!url || url.protocol !== 'http:') return false;
  return /^(localhost|127\.0\.0\.1)$/i.test(url.hostname);
}

function isDirectImageUrl(url) {
  const path = (url?.pathname || '').toLowerCase();
  if (/\.(avif|bmp|gif|jpe?g|png|svg|webp)$/.test(path)) return true;
  if (/\/wiki\/special:filepath\//.test(path)) return true;
  return false;
}

function mergePlantPhotoUploadValue(prevValue, newUrl, position = 'append') {
  const url = asTrimmedString(newUrl);
  if (!url) return asTrimmedString(prevValue) || null;
  const existing = parseLinkCandidates(prevValue);
  if (existing.includes(url)) return existing.join('\n') || null;
  if (existing.length === 0) return url;
  if (position === 'prepend') return [url, ...existing].join('\n');
  return [...existing, url].join('\n');
}

function extractUploadsRelativePath(value) {
  const raw = asTrimmedString(value);
  if (!raw) return null;
  if (raw.startsWith('/uploads/')) return raw.slice('/uploads/'.length);
  try {
    const u = new URL(raw);
    if (u.pathname.startsWith('/uploads/')) return u.pathname.slice('/uploads/'.length);
  } catch {
    return null;
  }
  return null;
}

function extractUploadsRelativePaths(value) {
  const links = parseLinkCandidates(value);
  const candidates = links.length > 0 ? links : [asTrimmedString(value)].filter(Boolean);
  const seen = new Set();
  const rels = [];
  for (const candidate of candidates) {
    const rel = extractUploadsRelativePath(candidate);
    if (rel && !seen.has(rel)) {
      seen.add(rel);
      rels.push(rel);
    }
  }
  return rels;
}

function mergePlantPhotoFieldValue(prevValue, newUrl, position = 'append') {
  const url = asTrimmedString(newUrl);
  if (!url) return asTrimmedString(prevValue);
  const existing = parseLinkCandidates(prevValue);
  if (existing.includes(url)) return existing.join('\n');
  if (existing.length === 0) return url;
  if (position === 'prepend') return [url, ...existing].join('\n');
  return [...existing, url].join('\n');
}

function validateHttpsPhotoLinks(body = {}) {
  for (const field of PHOTO_FIELDS) {
    if (!hasOwn(body, field)) continue;
    const raw = asTrimmedString(body[field]);
    if (!raw) continue;
    const links = parseLinkCandidates(raw);
    for (const link of links) {
      if (isLocalUploadsPath(link)) {
        if (!isDirectImagePath(link)) {
          return `${field}: chemin local invalide (extension image requise)`;
        }
        continue;
      }
      let url;
      try {
        url = new URL(link);
      } catch {
        return `${field}: URL invalide`;
      }
      if (url.protocol !== 'https:' && !isDevLocalhostHttp(url)) {
        return `${field}: seules les URLs HTTPS (ou localhost en dev) sont autorisées`;
      }
      if (!isDirectImageUrl(url)) {
        return `${field}: URL d'image directe requise (.jpg/.png/... ou /wiki/Special:FilePath/...)`;
      }
    }
  }
  return null;
}

async function parseWorkbookRowsFromBuffer(buffer) {
  return parseFirstSheetRows(buffer);
}

function toGoogleSheetCsvUrl(rawUrl) {
  const value = asTrimmedString(rawUrl);
  if (!value) return null;
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (!/^(?:docs\.)?google\.com$/i.test(url.hostname)) return null;
  const m = url.pathname.match(/^\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!m) return null;
  const sheetId = m[1];
  const gidFromQuery = asTrimmedString(url.searchParams.get('gid'));
  const gidFromHash = (url.hash.match(/gid=(\d+)/) || [])[1] || '';
  const gid = gidFromQuery || gidFromHash || '0';
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${encodeURIComponent(gid)}`;
}

function buildPlantPayload(body, fallback = {}) {
  const payload = {};
  const rawName = hasOwn(body, 'name') ? body.name : fallback.name;
  const rawEmoji = hasOwn(body, 'emoji') ? body.emoji : fallback.emoji;
  const rawDescription = hasOwn(body, 'description') ? body.description : fallback.description;
  payload.name = asTrimmedString(rawName);
  payload.emoji = asTrimmedString(rawEmoji) || '🌱';
  payload.description = asTrimmedString(rawDescription);
  for (const field of PLANT_EXTRA_FIELDS) {
    const sourceValue = hasOwn(body, field) ? body[field] : fallback[field];
    payload[field] = asOptionalText(sourceValue);
  }
  applyDerivedGroup4IfEmpty(payload);
  return payload;
}

function buildImportReportBase(strategy, dryRun, sourceType, rowsCount) {
  return {
    strategy,
    dryRun,
    sourceType,
    totals: {
      received: rowsCount,
      valid: 0,
      created: 0,
      updated: 0,
      skipped_existing: 0,
      skipped_invalid: 0,
    },
    preview: [],
    errors: [],
  };
}

function validateImportPayloadRow(row, rowNumber) {
  const mapped = mapImportRowToPlantShape(row);
  const payload = buildPlantPayload(mapped);
  if (!payload.name) {
    return {
      payload: null,
      errors: [{ row: rowNumber, field: 'name', error: 'Nom requis' }],
    };
  }

  const errors = [];
  const photoErr = validateHttpsPhotoLinks(payload);
  if (photoErr) {
    const [field, ...rest] = photoErr.split(':');
    errors.push({
      row: rowNumber,
      field: (field || 'photo').trim(),
      error: rest.join(':').trim() || photoErr,
    });
  }

  const tempErr = validateRangeText(payload.ideal_temperature_c, -20, 80);
  if (tempErr) errors.push({ row: rowNumber, field: 'ideal_temperature_c', error: tempErr });
  const phErr = validateRangeText(payload.optimal_ph, 0, 14);
  if (phErr) errors.push({ row: rowNumber, field: 'optimal_ph', error: phErr });

  return { payload, errors };
}

const MAX_PLANT_OBSERVATION_COUNT_IDS = 200;

/** Parse `plant_ids` query (comma-separated positive ints), dédupliqué, max MAX_PLANT_OBSERVATION_COUNT_IDS. */
function parsePlantIdsQueryParam(raw) {
  const s = asTrimmedString(raw);
  if (!s) return [];
  const seen = new Set();
  const out = [];
  for (const part of s.split(/[,;\s]+/)) {
    const n = Number(String(part).trim());
    if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
    if (out.length >= MAX_PLANT_OBSERVATION_COUNT_IDS) break;
  }
  return out;
}

module.exports = {
  PHOTO_FIELDS,
  PLANT_EXTRA_FIELDS,
  PLANT_COLUMNS,
  MAX_PLANT_PHOTO_BYTES,
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
  IMPORT_STRATEGIES,
  hasOwn,
  asTrimmedString,
  asOptionalText,
  parseLinkCandidates,
  normalizeHeader,
  HEADER_ALIASES,
  NORMALIZED_CANONICAL_KEYS,
  mapImportRowToPlantShape,
  parseNumberish,
  validateRangeText,
  detectImageExtensionFromDataUrl,
  isLocalUploadsPath,
  isDirectImagePath,
  isDevLocalhostHttp,
  isDirectImageUrl,
  mergePlantPhotoUploadValue,
  extractUploadsRelativePath,
  extractUploadsRelativePaths,
  mergePlantPhotoFieldValue,
  validateHttpsPhotoLinks,
  parseWorkbookRowsFromBuffer,
  toGoogleSheetCsvUrl,
  buildPlantPayload,
  buildImportReportBase,
  validateImportPayloadRow,
  MAX_PLANT_OBSERVATION_COUNT_IDS,
  parsePlantIdsQueryParam,
};
