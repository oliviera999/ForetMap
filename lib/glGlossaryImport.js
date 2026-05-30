'use strict';

const XLSX = require('xlsx');
const {
  asTrimmedString,
  normalizeMatchKey,
  parseBiomesConcernes,
  resolveRelatedTermCodes,
  buildTermToCodeMap,
  GLOSSARY_CATEGORIES,
} = require('./glGlossaryMatch');

const MAX_IMPORT_FILE_BYTES = 8 * 1024 * 1024;
const MAX_IMPORT_ROWS = 500;
const GLOSSARY_SHEET = 'glossaire';

const GLOSSARY_FIELD_KEYS = [
  'glossary_code',
  'terme',
  'variantes',
  'categorie',
  'niveau',
  'definition_courte',
  'definition_complete',
  'exemple',
  'etymologie',
  'present_dans_qcm',
  'illustration_idee',
  'all_biomes',
  'statut',
];

const HEADER_ALIASES = new Map([
  ['id', 'glossary_code'],
  ['glossary_code', 'glossary_code'],
  ['terme', 'terme'],
  ['variantes', 'variantes'],
  ['categorie', 'categorie'],
  ['niveau', 'niveau'],
  ['definition_courte', 'definition_courte'],
  ['definition_complete', 'definition_complete'],
  ['exemple', 'exemple'],
  ['etymologie', 'etymologie'],
  ['termes_lies', 'termes_lies'],
  ['biomes_concernes', 'biomes_concernes'],
  ['present_dans_qcm', 'present_dans_qcm'],
  ['illustration_idee', 'illustration_idee'],
  ['statut', 'statut'],
]);

const VALID_NIVEAUX = new Set(['base', 'approfondissement', 'avance']);

const GLOSSARY_TEMPLATE_HEADERS = [
  'id',
  'terme',
  'variantes',
  'categorie',
  'niveau',
  'definition_courte',
  'definition_complete',
  'exemple',
  'etymologie',
  'termes_lies',
  'biomes_concernes',
  'present_dans_qcm',
  'illustration_idee',
  'statut',
];

const GLOSSARY_TEMPLATE_SAMPLE_ROW = [
  'GL0001',
  'Biome',
  '',
  'biome',
  'base',
  'Grande région écologique homogène.',
  '',
  '',
  '',
  '',
  'tous',
  '',
  '',
  'actif',
];

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

function normalizeCategorie(value) {
  const s = asTrimmedString(value).toLowerCase();
  return GLOSSARY_CATEGORIES.includes(s) ? s : null;
}

function normalizeNiveau(value) {
  const s = asTrimmedString(value).toLowerCase();
  return VALID_NIVEAUX.has(s) ? s : null;
}

function readSheetRows(wb, sheetName) {
  if (!wb.SheetNames.includes(sheetName)) return [];
  const ws = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(ws, { defval: '', raw: false, blankrows: false });
}

function mapRowToGlossaryShape(row = {}) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    const canonical = HEADER_ALIASES.get(normalizeImportHeader(key));
    if (!canonical) continue;
    out[canonical] = value;
  }
  return out;
}

function buildGlossaryPayload(row = {}) {
  const mapped = mapRowToGlossaryShape(row);
  const biomes = parseBiomesConcernes(mapped.biomes_concernes);
  return {
    glossary_code: asTrimmedString(mapped.glossary_code),
    terme: asTrimmedString(mapped.terme),
    variantes: normalizeOptionalString(mapped.variantes),
    categorie: normalizeCategorie(mapped.categorie),
    niveau: normalizeNiveau(mapped.niveau) || 'base',
    definition_courte: normalizeOptionalString(mapped.definition_courte),
    definition_complete: normalizeOptionalString(mapped.definition_complete),
    exemple: normalizeOptionalString(mapped.exemple),
    etymologie: normalizeOptionalString(mapped.etymologie),
    present_dans_qcm: normalizeOptionalString(mapped.present_dans_qcm),
    illustration_idee: normalizeOptionalString(mapped.illustration_idee),
    termes_lies: normalizeOptionalString(mapped.termes_lies),
    all_biomes: biomes.allBiomes ? 1 : 0,
    biome_slugs: biomes.slugs,
    statut: normalizeOptionalString(mapped.statut) || 'actif',
  };
}

function validateGlossaryPayload(payload, rowNumber) {
  const errors = [];
  if (!payload.glossary_code) {
    errors.push({ row: rowNumber, field: 'glossary_code', error: 'Code glossaire requis (id)' });
  }
  if (!payload.terme) {
    errors.push({ row: rowNumber, field: 'terme', error: 'terme requis' });
  }
  if (!payload.categorie) {
    errors.push({ row: rowNumber, field: 'categorie', error: 'categorie invalide' });
  }
  if (!payload.niveau) {
    errors.push({ row: rowNumber, field: 'niveau', error: 'niveau invalide' });
  }
  return errors;
}

function parseGlossaryWorkbook(buffer) {
  if (!buffer || buffer.length === 0) throw new Error('Fichier import vide');
  if (buffer.length > MAX_IMPORT_FILE_BYTES) throw new Error('Fichier import trop volumineux (max 8 Mo)');
  const wb = XLSX.read(buffer, { type: 'buffer', raw: false, cellDates: false });
  const glossaryRows = readSheetRows(wb, GLOSSARY_SHEET);
  return { glossaryRows };
}

function buildImportReportBase(dryRun, rowsCount) {
  return {
    dryRun,
    sourceType: 'xlsx',
    totals: {
      received: rowsCount,
      valid: 0,
      created: 0,
      updated: 0,
      skipped_invalid: 0,
      relations_synced: 0,
      biome_links_synced: 0,
    },
    preview: [],
    errors: [],
  };
}

const GLOSSARY_UPSERT_SQL = `
  INSERT INTO gl_glossary_terms (
    glossary_code, terme, variantes, categorie, niveau, definition_courte, definition_complete,
    exemple, etymologie, present_dans_qcm, illustration_idee, all_biomes, statut, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
  ON DUPLICATE KEY UPDATE
    terme = VALUES(terme),
    variantes = VALUES(variantes),
    categorie = VALUES(categorie),
    niveau = VALUES(niveau),
    definition_courte = VALUES(definition_courte),
    definition_complete = VALUES(definition_complete),
    exemple = VALUES(exemple),
    etymologie = VALUES(etymologie),
    present_dans_qcm = VALUES(present_dans_qcm),
    illustration_idee = VALUES(illustration_idee),
    all_biomes = VALUES(all_biomes),
    statut = VALUES(statut),
    updated_at = NOW()
`;

function buildGlossaryUpsertParams(payload) {
  return [
    payload.glossary_code,
    payload.terme,
    payload.variantes,
    payload.categorie,
    payload.niveau,
    payload.definition_courte,
    payload.definition_complete,
    payload.exemple,
    payload.etymologie,
    payload.present_dans_qcm,
    payload.illustration_idee,
    payload.all_biomes,
    payload.statut,
  ];
}

function resolveImportRows(body = {}) {
  const fileDataBase64 = asTrimmedString(body.fileDataBase64);
  if (!fileDataBase64) throw new Error('Fichier requis');
  const raw = fileDataBase64.includes(',') ? fileDataBase64.split(',')[1] : fileDataBase64;
  const buffer = Buffer.from(raw, 'base64');
  return parseGlossaryWorkbook(buffer);
}

async function syncGlossaryBiomes(payload, knownBiomes, { execute, dryRun }) {
  if (payload.all_biomes) return 0;
  let count = 0;
  for (const slug of payload.biome_slugs) {
    if (!knownBiomes.has(slug)) {
      if (!dryRun) {
        await execute(
          `INSERT INTO gl_biomes (slug, nom, order_index, created_at, updated_at)
           VALUES (?, ?, 999, NOW(), NOW())
           ON DUPLICATE KEY UPDATE updated_at = NOW()`,
          [slug, slug]
        );
      }
      knownBiomes.add(slug);
    }
    if (dryRun) {
      count += 1;
      continue;
    }
    await execute(
      `INSERT IGNORE INTO gl_glossary_term_biomes (glossary_code, biome_slug) VALUES (?, ?)`,
      [payload.glossary_code, slug]
    );
    count += 1;
  }
  return count;
}

async function applyGlossaryImport(deps, glossaryRows, options = {}) {
  const { queryAll, execute } = deps;
  const dryRun = !!options.dryRun;

  const report = buildImportReportBase(dryRun, glossaryRows.length);
  if (glossaryRows.length > MAX_IMPORT_ROWS) {
    throw new Error(`Trop de lignes (max ${MAX_IMPORT_ROWS})`);
  }

  const existingRows = await queryAll('SELECT glossary_code FROM gl_glossary_terms');
  const existingCodes = new Set(existingRows.map((r) => String(r.glossary_code)));
  const knownBiomes = new Set((await queryAll('SELECT slug FROM gl_biomes')).map((r) => String(r.slug)));

  const validRows = [];
  for (let i = 0; i < glossaryRows.length; i += 1) {
    const rowNumber = i + 2;
    const payload = buildGlossaryPayload(glossaryRows[i]);
    const rowErrors = validateGlossaryPayload(payload, rowNumber);
    if (rowErrors.length) {
      report.errors.push(...rowErrors);
      report.totals.skipped_invalid += 1;
      continue;
    }
    validRows.push({ rowNumber, payload });
  }

  report.totals.valid = validRows.length;
  report.preview = validRows.slice(0, 5).map(({ payload }) => ({
    glossary_code: payload.glossary_code,
    terme: payload.terme,
    categorie: payload.categorie,
  }));

  if (dryRun) {
    for (const { payload } of validRows) {
      if (existingCodes.has(payload.glossary_code)) report.totals.updated += 1;
      else report.totals.created += 1;
      report.totals.biome_links_synced += payload.all_biomes ? 0 : payload.biome_slugs.length;
      report.totals.relations_synced += resolveRelatedTermCodes(
        payload.termes_lies,
        buildTermToCodeMap(validRows.map((r) => r.payload))
      ).length;
    }
    return report;
  }

  if (validRows.length > 0) {
    await execute('DELETE FROM gl_glossary_term_biomes');
    await execute('DELETE FROM gl_glossary_term_relations');
  }

  for (const { payload } of validRows) {
    const existed = existingCodes.has(payload.glossary_code);
    await execute(GLOSSARY_UPSERT_SQL, buildGlossaryUpsertParams(payload));
    if (existed) report.totals.updated += 1;
    else {
      report.totals.created += 1;
      existingCodes.add(payload.glossary_code);
    }
    report.totals.biome_links_synced += await syncGlossaryBiomes(payload, knownBiomes, { execute, dryRun });
  }

  const termToCode = buildTermToCodeMap(validRows.map((r) => r.payload));
  for (const { payload } of validRows) {
    const related = resolveRelatedTermCodes(payload.termes_lies, termToCode);
    for (const toCode of related) {
      if (toCode === payload.glossary_code) continue;
      await execute(
        `INSERT IGNORE INTO gl_glossary_term_relations (from_code, to_code) VALUES (?, ?)`,
        [payload.glossary_code, toCode]
      );
      report.totals.relations_synced += 1;
    }
  }

  return report;
}

function glossaryRowToExportArray(row) {
  return [
    row.id ?? '',
    row.terme ?? '',
    row.variantes ?? '',
    row.categorie ?? '',
    row.niveau ?? '',
    row.definition_courte ?? '',
    row.definition_complete ?? '',
    row.exemple ?? '',
    row.etymologie ?? '',
    row.termes_lies ?? '',
    row.biomes_concernes ?? '',
    row.present_dans_qcm ?? '',
    row.illustration_idee ?? '',
    row.statut ?? '',
  ];
}

function buildGlossaryExportWorkbook(rows) {
  const wb = XLSX.utils.book_new();
  const data = [GLOSSARY_TEMPLATE_HEADERS, ...rows.map(glossaryRowToExportArray)];
  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, GLOSSARY_SHEET);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function buildGlossaryTemplateWorkbook() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([GLOSSARY_TEMPLATE_HEADERS, GLOSSARY_TEMPLATE_SAMPLE_ROW]);
  XLSX.utils.book_append_sheet(wb, ws, GLOSSARY_SHEET);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

async function loadGlossaryExportRows(deps, options = {}) {
  const { queryAll } = deps;
  const statut = options.statut === 'all' ? null : (options.statut || 'actif');

  const terms = statut
    ? await queryAll(
      `SELECT glossary_code, terme, variantes, categorie, niveau, definition_courte,
              definition_complete, exemple, etymologie, present_dans_qcm, illustration_idee,
              all_biomes, statut
         FROM gl_glossary_terms
        WHERE statut = ?
        ORDER BY glossary_code ASC`,
      [statut]
    )
    : await queryAll(
      `SELECT glossary_code, terme, variantes, categorie, niveau, definition_courte,
              definition_complete, exemple, etymologie, present_dans_qcm, illustration_idee,
              all_biomes, statut
         FROM gl_glossary_terms
        ORDER BY glossary_code ASC`
    );

  const biomeLinks = await queryAll(
    `SELECT glossary_code, biome_slug
       FROM gl_glossary_term_biomes
      ORDER BY glossary_code ASC, biome_slug ASC`
  );
  const biomesByCode = new Map();
  for (const link of biomeLinks) {
    const code = String(link.glossary_code);
    if (!biomesByCode.has(code)) biomesByCode.set(code, []);
    biomesByCode.get(code).push(String(link.biome_slug));
  }

  const relations = await queryAll(
    `SELECT r.from_code, t.terme
       FROM gl_glossary_term_relations r
  INNER JOIN gl_glossary_terms t ON t.glossary_code = r.to_code
      ORDER BY r.from_code ASC, t.terme ASC`
  );
  const relatedByCode = new Map();
  for (const rel of relations) {
    const code = String(rel.from_code);
    if (!relatedByCode.has(code)) relatedByCode.set(code, []);
    relatedByCode.get(code).push(String(rel.terme));
  }

  return terms.map((term) => {
    const code = String(term.glossary_code);
    const allBiomes = Number(term.all_biomes) === 1;
    const biomeSlugs = biomesByCode.get(code) || [];
    return {
      id: code,
      terme: term.terme || '',
      variantes: term.variantes || '',
      categorie: term.categorie || '',
      niveau: term.niveau || '',
      definition_courte: term.definition_courte || '',
      definition_complete: term.definition_complete || '',
      exemple: term.exemple || '',
      etymologie: term.etymologie || '',
      termes_lies: (relatedByCode.get(code) || []).join(', '),
      biomes_concernes: allBiomes ? 'tous' : biomeSlugs.join(', '),
      present_dans_qcm: term.present_dans_qcm || '',
      illustration_idee: term.illustration_idee || '',
      statut: term.statut || 'actif',
    };
  });
}

module.exports = {
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
  GLOSSARY_SHEET,
  GLOSSARY_FIELD_KEYS,
  GLOSSARY_TEMPLATE_HEADERS,
  GLOSSARY_TEMPLATE_SAMPLE_ROW,
  buildGlossaryPayload,
  validateGlossaryPayload,
  parseGlossaryWorkbook,
  resolveImportRows,
  applyGlossaryImport,
  buildGlossaryUpsertParams,
  buildGlossaryTemplateWorkbook,
  buildGlossaryExportWorkbook,
  loadGlossaryExportRows,
};
