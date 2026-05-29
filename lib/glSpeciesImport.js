'use strict';

const XLSX = require('xlsx');

/**
 * Import catalogue espèces G&L (XLSX feuilles especes / biomes_stats).
 * Pattern aligné sur lib/glPlayersImport.js — module purement fonctionnel.
 */

const MAX_IMPORT_FILE_BYTES = 8 * 1024 * 1024;
const MAX_IMPORT_ROWS = 500;
const SPECIES_SHEET = 'especes';
const BIOMES_STATS_SHEET = 'biomes_stats';

const SPECIES_FIELD_KEYS = [
  'species_code',
  'biome_slug',
  'type',
  'nom_commun',
  'nom_scientifique',
  'groupe',
  'famille',
  'statut_iucn',
  'endemique',
  'role_ecologique',
  'adaptations_cles',
  'taille_adulte',
  'poids_adulte',
  'regime_alimentaire',
  'longevite',
  'reproduction',
  'observation_terrain',
  'description_courte',
  'anecdote',
  'present_dans_qcm',
  'mots_cles',
  'wikipedia_title',
  'wikipedia_url',
  'photo_url',
  'photo_credit',
  'photo_licence',
  'photo_licence_url',
  'statut',
];

const HEADER_ALIASES = new Map([
  ['id', 'species_code'],
  ['species_code', 'species_code'],
  ['biome_slug', 'biome_slug'],
  ['biome_nom', 'biome_nom'],
  ['type', 'type'],
  ['nom_commun', 'nom_commun'],
  ['nom_scientifique', 'nom_scientifique'],
  ['groupe', 'groupe'],
  ['famille', 'famille'],
  ['statut_iucn', 'statut_iucn'],
  ['endemique', 'endemique'],
  ['role_ecologique', 'role_ecologique'],
  ['adaptations_cles', 'adaptations_cles'],
  ['taille_adulte', 'taille_adulte'],
  ['poids_adulte', 'poids_adulte'],
  ['regime_alimentaire', 'regime_alimentaire'],
  ['longevite', 'longevite'],
  ['reproduction', 'reproduction'],
  ['observation_terrain', 'observation_terrain'],
  ['description_courte', 'description_courte'],
  ['anecdote', 'anecdote'],
  ['present_dans_qcm', 'present_dans_qcm'],
  ['mots_cles', 'mots_cles'],
  ['wikipedia_title', 'wikipedia_title'],
  ['wikipedia_url', 'wikipedia_url'],
  ['photo_url', 'photo_url'],
  ['photo_credit', 'photo_credit'],
  ['photo_licence', 'photo_licence'],
  ['photo_licence_url', 'photo_licence_url'],
  ['statut', 'statut'],
]);

function asTrimmedString(value) {
  if (value == null) return '';
  return String(value).trim();
}

function normalizeOptionalString(value) {
  const s = asTrimmedString(value);
  return s.length > 0 ? s : null;
}

function normalizeImportHeader(value) {
  return asTrimmedString(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeSpeciesType(value) {
  const s = asTrimmedString(value).toLowerCase();
  if (s === 'faune' || s === 'flore') return s;
  return null;
}

function isHttpsUrl(value) {
  const s = asTrimmedString(value);
  if (!s) return true;
  try {
    const url = new URL(s);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeHttpsUrl(value) {
  const s = asTrimmedString(value);
  if (!s) return null;
  if (/^http:\/\//i.test(s)) {
    return s.replace(/^http:\/\//i, 'https://');
  }
  return s;
}

function readSheetRows(wb, sheetName) {
  if (!wb.SheetNames.includes(sheetName)) return [];
  const ws = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(ws, { defval: '', raw: false, blankrows: false });
}

function mapRowToSpeciesShape(row = {}) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    const canonical = HEADER_ALIASES.get(normalizeImportHeader(key));
    if (!canonical) continue;
    out[canonical] = value;
  }
  return out;
}

function buildSpeciesPayload(row = {}) {
  const mapped = mapRowToSpeciesShape(row);
  return {
    species_code: asTrimmedString(mapped.species_code),
    biome_slug: asTrimmedString(mapped.biome_slug),
    biome_nom: normalizeOptionalString(mapped.biome_nom),
    type: normalizeSpeciesType(mapped.type),
    nom_commun: asTrimmedString(mapped.nom_commun),
    nom_scientifique: normalizeOptionalString(mapped.nom_scientifique),
    groupe: normalizeOptionalString(mapped.groupe),
    famille: normalizeOptionalString(mapped.famille),
    statut_iucn: normalizeOptionalString(mapped.statut_iucn),
    endemique: normalizeOptionalString(mapped.endemique),
    role_ecologique: normalizeOptionalString(mapped.role_ecologique),
    adaptations_cles: normalizeOptionalString(mapped.adaptations_cles),
    taille_adulte: normalizeOptionalString(mapped.taille_adulte),
    poids_adulte: normalizeOptionalString(mapped.poids_adulte),
    regime_alimentaire: normalizeOptionalString(mapped.regime_alimentaire),
    longevite: normalizeOptionalString(mapped.longevite),
    reproduction: normalizeOptionalString(mapped.reproduction),
    observation_terrain: normalizeOptionalString(mapped.observation_terrain),
    description_courte: normalizeOptionalString(mapped.description_courte),
    anecdote: normalizeOptionalString(mapped.anecdote),
    present_dans_qcm: normalizeOptionalString(mapped.present_dans_qcm),
    mots_cles: normalizeOptionalString(mapped.mots_cles),
    wikipedia_title: normalizeOptionalString(mapped.wikipedia_title),
    wikipedia_url: normalizeOptionalString(normalizeHttpsUrl(mapped.wikipedia_url)),
    photo_url: normalizeOptionalString(normalizeHttpsUrl(mapped.photo_url)),
    photo_credit: normalizeOptionalString(mapped.photo_credit),
    photo_licence: normalizeOptionalString(mapped.photo_licence),
    photo_licence_url: normalizeOptionalString(normalizeHttpsUrl(mapped.photo_licence_url)),
    statut: normalizeOptionalString(mapped.statut) || 'actif',
  };
}

function validateSpeciesPayload(payload, rowNumber) {
  const errors = [];
  if (!payload.species_code) {
    errors.push({ row: rowNumber, field: 'species_code', error: 'Code espèce requis (id)' });
  }
  if (!payload.biome_slug) {
    errors.push({ row: rowNumber, field: 'biome_slug', error: 'biome_slug requis' });
  }
  if (!payload.type) {
    errors.push({ row: rowNumber, field: 'type', error: 'type requis (faune ou flore)' });
  }
  if (!payload.nom_commun) {
    errors.push({ row: rowNumber, field: 'nom_commun', error: 'nom_commun requis' });
  }
  if (payload.wikipedia_url && !isHttpsUrl(payload.wikipedia_url)) {
    errors.push({ row: rowNumber, field: 'wikipedia_url', error: 'URL Wikipedia HTTPS requise' });
  }
  if (payload.photo_url && !isHttpsUrl(payload.photo_url)) {
    errors.push({ row: rowNumber, field: 'photo_url', error: 'URL photo HTTPS requise' });
  }
  if (payload.photo_licence_url && !isHttpsUrl(payload.photo_licence_url)) {
    errors.push({ row: rowNumber, field: 'photo_licence_url', error: 'URL licence HTTPS requise' });
  }
  return errors;
}

function parseBiomeStatsRows(rows = []) {
  const biomes = [];
  let orderIndex = 0;
  for (const row of rows) {
    const slug = asTrimmedString(row.biome_slug);
    const nom = asTrimmedString(row.biome_nom);
    if (!slug || !nom || slug.toUpperCase() === 'TOTAL' || nom.toUpperCase() === 'TOTAL') continue;
    orderIndex += 10;
    biomes.push({ slug, nom, order_index: orderIndex });
  }
  return biomes;
}

/**
 * @param {Buffer} buffer
 * @returns {{ speciesRows: object[], biomeRows: object[] }}
 */
function parseSpeciesWorkbook(buffer) {
  if (!buffer || buffer.length === 0) throw new Error('Fichier import vide');
  if (buffer.length > MAX_IMPORT_FILE_BYTES) throw new Error('Fichier import trop volumineux (max 8 Mo)');
  const wb = XLSX.read(buffer, { type: 'buffer', raw: false, cellDates: false });
  const speciesRows = readSheetRows(wb, SPECIES_SHEET);
  const biomeRows = parseBiomeStatsRows(readSheetRows(wb, BIOMES_STATS_SHEET));
  return { speciesRows, biomeRows };
}

function buildImportReportBase(dryRun, sourceType, rowsCount) {
  return {
    dryRun,
    sourceType,
    totals: {
      received: rowsCount,
      valid: 0,
      created: 0,
      updated: 0,
      skipped_invalid: 0,
      biomes_synced: 0,
    },
    preview: [],
    errors: [],
  };
}

function speciesPayloadToDbRow(payload) {
  const row = {};
  for (const key of SPECIES_FIELD_KEYS) {
    row[key] = payload[key] ?? null;
  }
  return row;
}

const SPECIES_UPSERT_SQL = `
  INSERT INTO gl_species (
    species_code, biome_slug, type, nom_commun, nom_scientifique, groupe, famille,
    statut_iucn, endemique, role_ecologique, adaptations_cles, taille_adulte, poids_adulte,
    regime_alimentaire, longevite, reproduction, observation_terrain, description_courte,
    anecdote, present_dans_qcm, mots_cles, wikipedia_title, wikipedia_url, photo_url, photo_credit,
    photo_licence, photo_licence_url, statut, created_at, updated_at
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, NOW(), NOW()
  )
  ON DUPLICATE KEY UPDATE
    biome_slug = VALUES(biome_slug),
    type = VALUES(type),
    nom_commun = VALUES(nom_commun),
    nom_scientifique = VALUES(nom_scientifique),
    groupe = VALUES(groupe),
    famille = VALUES(famille),
    statut_iucn = VALUES(statut_iucn),
    endemique = VALUES(endemique),
    role_ecologique = VALUES(role_ecologique),
    adaptations_cles = VALUES(adaptations_cles),
    taille_adulte = VALUES(taille_adulte),
    poids_adulte = VALUES(poids_adulte),
    regime_alimentaire = VALUES(regime_alimentaire),
    longevite = VALUES(longevite),
    reproduction = VALUES(reproduction),
    observation_terrain = VALUES(observation_terrain),
    description_courte = VALUES(description_courte),
    anecdote = VALUES(anecdote),
    present_dans_qcm = VALUES(present_dans_qcm),
    mots_cles = VALUES(mots_cles),
    wikipedia_title = VALUES(wikipedia_title),
    wikipedia_url = VALUES(wikipedia_url),
    photo_url = VALUES(photo_url),
    photo_credit = VALUES(photo_credit),
    photo_licence = VALUES(photo_licence),
    photo_licence_url = VALUES(photo_licence_url),
    statut = VALUES(statut),
    updated_at = NOW()
`;

function buildSpeciesUpsertParams(payload) {
  const row = speciesPayloadToDbRow(payload);
  return SPECIES_FIELD_KEYS.map((key) => row[key]);
}

function resolveImportRows(body = {}) {
  const fileDataBase64 = asTrimmedString(body.fileDataBase64);
  if (!fileDataBase64) throw new Error('Fichier requis');
  const raw = fileDataBase64.includes(',') ? fileDataBase64.split(',')[1] : fileDataBase64;
  const buffer = Buffer.from(raw, 'base64');
  return parseSpeciesWorkbook(buffer);
}

async function syncBiomesFromRows(biomeRows, { execute, dryRun }) {
  let synced = 0;
  for (const biome of biomeRows) {
    if (dryRun) {
      synced += 1;
      continue;
    }
    await execute(
      `INSERT INTO gl_biomes (slug, nom, order_index, created_at, updated_at)
       VALUES (?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE nom = VALUES(nom), order_index = VALUES(order_index), updated_at = NOW()`,
      [biome.slug, biome.nom, biome.order_index]
    );
    synced += 1;
  }
  return synced;
}

async function ensureBiomeExists(payload, knownBiomes, { execute, dryRun }) {
  if (knownBiomes.has(payload.biome_slug)) return;
  const nom = payload.biome_nom || payload.biome_slug;
  if (!dryRun) {
    await execute(
      `INSERT INTO gl_biomes (slug, nom, order_index, created_at, updated_at)
       VALUES (?, ?, 999, NOW(), NOW())
       ON DUPLICATE KEY UPDATE nom = VALUES(nom), updated_at = NOW()`,
      [payload.biome_slug, nom]
    );
  }
  knownBiomes.add(payload.biome_slug);
}

/**
 * @param {object} deps
 * @param {Function} deps.queryAll
 * @param {Function} deps.execute
 * @param {object[]} speciesRows — lignes brutes feuille especes
 * @param {object} [options]
 */
async function applySpeciesImport(deps, speciesRows, options = {}) {
  const { queryAll, execute } = deps;
  const dryRun = !!options.dryRun;
  const syncBiomes = options.syncBiomes !== false;
  const biomeRows = Array.isArray(options.biomeRows) ? options.biomeRows : [];

  const report = buildImportReportBase(dryRun, 'xlsx', speciesRows.length);
  if (speciesRows.length > MAX_IMPORT_ROWS) {
    throw new Error(`Trop de lignes (max ${MAX_IMPORT_ROWS})`);
  }

  if (syncBiomes && biomeRows.length > 0) {
    report.totals.biomes_synced = await syncBiomesFromRows(biomeRows, { execute, dryRun });
  }

  const existingRows = await queryAll('SELECT species_code FROM gl_species');
  const existingCodes = new Set(existingRows.map((r) => String(r.species_code)));
  const knownBiomes = new Set([
    ...biomeRows.map((b) => b.slug),
    ...(await queryAll('SELECT slug FROM gl_biomes')).map((r) => String(r.slug)),
  ]);

  const validRows = [];
  for (let i = 0; i < speciesRows.length; i += 1) {
    const rowNumber = i + 2;
    const payload = buildSpeciesPayload(speciesRows[i]);
    const rowErrors = validateSpeciesPayload(payload, rowNumber);
    if (rowErrors.length) {
      report.errors.push(...rowErrors);
      report.totals.skipped_invalid += 1;
      continue;
    }
    validRows.push({ rowNumber, payload });
  }

  report.totals.valid = validRows.length;
  report.preview = validRows.slice(0, 5).map(({ payload }) => ({
    species_code: payload.species_code,
    biome_slug: payload.biome_slug,
    type: payload.type,
    nom_commun: payload.nom_commun,
  }));

  if (dryRun) {
    for (const { payload } of validRows) {
      if (existingCodes.has(payload.species_code)) report.totals.updated += 1;
      else report.totals.created += 1;
    }
    return report;
  }

  for (const { payload } of validRows) {
    await ensureBiomeExists(payload, knownBiomes, { execute, dryRun });
    const existed = existingCodes.has(payload.species_code);
    await execute(SPECIES_UPSERT_SQL, buildSpeciesUpsertParams(payload));
    if (existed) report.totals.updated += 1;
    else {
      report.totals.created += 1;
      existingCodes.add(payload.species_code);
    }
  }

  return report;
}

module.exports = {
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
  SPECIES_FIELD_KEYS,
  SPECIES_UPSERT_SQL,
  asTrimmedString,
  buildSpeciesPayload,
  validateSpeciesPayload,
  parseSpeciesWorkbook,
  parseBiomeStatsRows,
  buildSpeciesUpsertParams,
  speciesPayloadToDbRow,
  resolveImportRows,
  applySpeciesImport,
};
