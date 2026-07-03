'use strict';

const { parseWorkbook, buildWorkbookBuffer } = require('./spreadsheet');
const { getGlImportMaxFileBytes, formatImportMaxFileLabel } = require('./glImportLimits');
const {
  asTrimmedString,
  normalizeMatchKey,
  buildTermToCodeMap,
  resolveRelatedLoreCodes,
  normalizeLoreCategorie,
  normalizeLoreNiveau,
  normalizeChapitreScope,
  LORE_GLOSSARY_CATEGORIES,
} = require('./glLoreGlossaryMatch');
const { normalizeOptionalString } = require('./shared/httpHelpers');
const { normalizeImportHeader } = require('./shared/stringHelpers');

const MAX_IMPORT_FILE_BYTES = getGlImportMaxFileBytes('default');
const MAX_IMPORT_ROWS = 200;
const GLOSSARY_SHEET = 'glossaire';

const HEADER_ALIASES = new Map([
  ['id', 'lore_code'],
  ['lore_code', 'lore_code'],
  ['terme', 'terme'],
  ['variantes', 'variantes'],
  ['categorie', 'categorie'],
  ['niveau', 'niveau'],
  ['definition_courte', 'definition_courte'],
  ['definition_complete', 'definition_complete'],
  ['role_recit', 'role_recit'],
  ['correspondance_reelle', 'correspondance_reelle'],
  ['chapitre', 'chapitre_scope'],
  ['chapitre_scope', 'chapitre_scope'],
  ['termes_lies', 'termes_lies'],
  ['source', 'source'],
  ['statut', 'statut'],
]);

function readSheetRows(wb, sheetName) {
  return wb.sheetNames.includes(sheetName) ? wb.sheets[sheetName] || [] : [];
}

function mapRow(row = {}) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    const canonical = HEADER_ALIASES.get(normalizeImportHeader(key));
    if (!canonical) continue;
    out[canonical] = value;
  }
  return out;
}

function buildLoreGlossaryPayload(row = {}) {
  const mapped = mapRow(row);
  return {
    lore_code: asTrimmedString(mapped.lore_code),
    terme: asTrimmedString(mapped.terme),
    variantes: normalizeOptionalString(mapped.variantes),
    categorie: normalizeLoreCategorie(mapped.categorie),
    niveau: normalizeLoreNiveau(mapped.niveau) || 'recit',
    definition_courte: normalizeOptionalString(mapped.definition_courte),
    definition_complete: normalizeOptionalString(mapped.definition_complete),
    role_recit: normalizeOptionalString(mapped.role_recit),
    correspondance_reelle: normalizeOptionalString(mapped.correspondance_reelle),
    chapitre_scope: normalizeChapitreScope(mapped.chapitre_scope),
    termes_lies: normalizeOptionalString(mapped.termes_lies),
    source: normalizeOptionalString(mapped.source),
    statut: normalizeOptionalString(mapped.statut) || 'actif',
  };
}

function validatePayload(payload, rowNumber) {
  const errors = [];
  if (!payload.lore_code)
    errors.push({ row: rowNumber, field: 'lore_code', error: 'Code lore requis' });
  if (!payload.terme) errors.push({ row: rowNumber, field: 'terme', error: 'terme requis' });
  if (!payload.categorie)
    errors.push({ row: rowNumber, field: 'categorie', error: 'categorie invalide' });
  return errors;
}

async function resolveLoreGlossaryImportBody(body = {}) {
  const fileDataBase64 = asTrimmedString(body.fileDataBase64 || body.fileData);
  if (!fileDataBase64) throw new Error('Fichier requis');
  const raw = fileDataBase64.includes(',') ? fileDataBase64.split(',')[1] : fileDataBase64;
  const buffer = Buffer.from(raw, 'base64');
  return parseLoreGlossaryWorkbook(buffer);
}

async function parseLoreGlossaryWorkbook(buffer, options = {}) {
  if (!buffer || buffer.length === 0) throw new Error('Fichier import vide');
  const maxBytes = options.maxFileBytes ?? getGlImportMaxFileBytes('default');
  if (buffer.length > maxBytes) {
    throw new Error(`Fichier import trop volumineux (max ${formatImportMaxFileLabel(maxBytes)})`);
  }
  const wb = await parseWorkbook(buffer);
  return { glossaryRows: readSheetRows(wb, GLOSSARY_SHEET) };
}

const LORE_UPSERT_SQL = `
  INSERT INTO gl_lore_glossary_terms (
    lore_code, terme, variantes, categorie, niveau, definition_courte, definition_complete,
    role_recit, correspondance_reelle, chapitre_scope, source, statut, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
  ON DUPLICATE KEY UPDATE
    terme = VALUES(terme),
    variantes = VALUES(variantes),
    categorie = VALUES(categorie),
    niveau = VALUES(niveau),
    definition_courte = VALUES(definition_courte),
    definition_complete = VALUES(definition_complete),
    role_recit = VALUES(role_recit),
    correspondance_reelle = VALUES(correspondance_reelle),
    chapitre_scope = VALUES(chapitre_scope),
    source = VALUES(source),
    statut = VALUES(statut),
    updated_at = NOW()
`;

function buildUpsertParams(payload) {
  return [
    payload.lore_code,
    payload.terme,
    payload.variantes,
    payload.categorie,
    payload.niveau,
    payload.definition_courte,
    payload.definition_complete,
    payload.role_recit,
    payload.correspondance_reelle,
    payload.chapitre_scope,
    payload.source,
    payload.statut,
  ];
}

async function loadLoreTermToCodeMap(queryAll) {
  const rows = await queryAll('SELECT lore_code, terme, variantes FROM gl_lore_glossary_terms');
  return buildTermToCodeMap(rows);
}

async function syncLoreRelations(payload, termToCode, { execute }) {
  await execute('DELETE FROM gl_lore_glossary_relations WHERE from_code = ?', [payload.lore_code]);
  const related = resolveRelatedLoreCodes(payload.termes_lies, termToCode);
  let count = 0;
  for (const toCode of related) {
    if (toCode === payload.lore_code) continue;
    await execute(
      'INSERT IGNORE INTO gl_lore_glossary_relations (from_code, to_code) VALUES (?, ?)',
      [payload.lore_code, toCode],
    );
    count += 1;
  }
  return count;
}

async function applyLoreGlossaryImport(deps, glossaryRows, options = {}) {
  const dryRun = options.dryRun !== false;
  const report = {
    dryRun,
    totals: { received: glossaryRows.length, valid: 0, upserted: 0, relations: 0, errors: [] },
  };
  const payloads = [];
  for (let i = 0; i < glossaryRows.length; i += 1) {
    const payload = buildLoreGlossaryPayload(glossaryRows[i]);
    const errors = validatePayload(payload, i + 2);
    if (errors.length) {
      report.totals.errors.push(...errors);
      continue;
    }
    payloads.push(payload);
    report.totals.valid += 1;
  }

  if (dryRun) {
    report.totals.upserted = payloads.length;
    return report;
  }

  for (const payload of payloads) {
    await deps.execute(LORE_UPSERT_SQL, buildUpsertParams(payload));
    report.totals.upserted += 1;
  }

  const termToCode = await loadLoreTermToCodeMap(deps.queryAll);
  for (const payload of payloads) {
    termToCode.set(normalizeMatchKey(payload.terme), payload.lore_code);
    for (const v of String(payload.variantes || '').split(/[,;|\n]+/)) {
      const key = normalizeMatchKey(v);
      if (key) termToCode.set(key, payload.lore_code);
    }
  }
  for (const payload of payloads) {
    report.totals.relations += await syncLoreRelations(payload, termToCode, deps);
  }
  return report;
}

async function allocateNextLoreCode(queryAll) {
  const rows = await queryAll(
    `SELECT lore_code FROM gl_lore_glossary_terms WHERE lore_code REGEXP '^LR[0-9]+$'`,
  );
  let maxNum = 0;
  for (const row of rows) {
    const match = String(row.lore_code || '').match(/^LR(\d+)$/i);
    if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
  }
  return `LR${String(maxNum + 1).padStart(4, '0')}`;
}

async function upsertLoreGlossaryTerm(deps, body, options = {}) {
  const payload = buildLoreGlossaryPayload(body);
  if (!payload.lore_code) payload.lore_code = await allocateNextLoreCode(deps.queryAll);
  const errors = validatePayload(payload, 1);
  if (errors.length) {
    const err = new Error('Données glossaire lore invalides');
    err.statusCode = 400;
    err.details = errors;
    throw err;
  }
  const existing = await deps.queryOne(
    'SELECT lore_code FROM gl_lore_glossary_terms WHERE lore_code = ? LIMIT 1',
    [payload.lore_code],
  );
  await deps.execute(LORE_UPSERT_SQL, buildUpsertParams(payload));
  const termToCode = await loadLoreTermToCodeMap(deps.queryAll);
  await syncLoreRelations(payload, termToCode, deps);
  return { created: !existing, payload };
}

async function buildLoreGlossaryTemplateWorkbook() {
  const headers = [
    'id',
    'terme',
    'variantes',
    'categorie',
    'niveau',
    'definition_courte',
    'definition_complete',
    'role_recit',
    'correspondance_reelle',
    'chapitre',
    'termes_lies',
    'source',
    'statut',
  ];
  return buildWorkbookBuffer([
    {
      name: GLOSSARY_SHEET,
      aoa: [
        headers,
        [
          'LR0001',
          'la Trame',
          'Trame',
          'cosmologie',
          'cle',
          'Définition courte',
          '',
          '',
          '',
          'tous',
          '',
          '',
          'actif',
        ],
      ],
    },
  ]);
}

async function loadLoreGlossaryExportRows(deps, statut = 'actif') {
  if (statut === 'all') {
    return deps.queryAll(
      `SELECT lore_code, terme, variantes, categorie, niveau, definition_courte, definition_complete,
              role_recit, correspondance_reelle, chapitre_scope, source, statut
         FROM gl_lore_glossary_terms
        ORDER BY categorie ASC, terme ASC`,
    );
  }
  return deps.queryAll(
    `SELECT lore_code, terme, variantes, categorie, niveau, definition_courte, definition_complete,
            role_recit, correspondance_reelle, chapitre_scope, source, statut
       FROM gl_lore_glossary_terms
      WHERE statut = ?
      ORDER BY categorie ASC, terme ASC`,
    [statut],
  );
}

async function buildLoreGlossaryExportWorkbook(rows) {
  const headers = [
    'id',
    'terme',
    'variantes',
    'categorie',
    'niveau',
    'definition_courte',
    'definition_complete',
    'role_recit',
    'correspondance_reelle',
    'chapitre',
    'termes_lies',
    'source',
    'statut',
  ];
  const data = [headers];
  for (const row of rows || []) {
    data.push([
      row.lore_code,
      row.terme,
      row.variantes ?? '',
      row.categorie,
      row.niveau,
      row.definition_courte ?? '',
      row.definition_complete ?? '',
      row.role_recit ?? '',
      row.correspondance_reelle ?? '',
      row.chapitre_scope ?? 'tous',
      '',
      row.source ?? '',
      row.statut ?? 'actif',
    ]);
  }
  return buildWorkbookBuffer([{ name: GLOSSARY_SHEET, aoa: data }]);
}

module.exports = {
  LORE_GLOSSARY_CATEGORIES,
  parseLoreGlossaryWorkbook,
  resolveLoreGlossaryImportBody,
  applyLoreGlossaryImport,
  buildLoreGlossaryPayload,
  upsertLoreGlossaryTerm,
  allocateNextLoreCode,
  buildLoreGlossaryTemplateWorkbook,
  buildLoreGlossaryExportWorkbook,
  loadLoreGlossaryExportRows,
  MAX_IMPORT_ROWS,
};
