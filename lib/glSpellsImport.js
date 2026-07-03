'use strict';

const { asTrimmedString, normalizeImportHeader } = require('./shared/stringHelpers');
const { normalizeOptionalString } = require('./shared/httpHelpers');
const { parseWorkbook, buildWorkbookBuffer } = require('./spreadsheet');
const { getGlImportMaxFileBytes, formatImportMaxFileLabel } = require('./glImportLimits');

const MAX_IMPORT_FILE_BYTES = getGlImportMaxFileBytes('default');
const MAX_IMPORT_ROWS = 500;
const SPELLS_SHEET = 'sortileges';
const CATEGORIES_STATS_SHEET = 'categories_stats';

const SPELL_TEMPLATE_HEADERS = [
  'id',
  'nom',
  'emoji',
  'cout_gemmes',
  'cout_coeurs',
  'cout_total_eq',
  'categorie',
  'portee',
  'cible',
  'timing',
  'effet_court',
  'effet_detaille',
  'limite_usage',
  'cumul',
  'statut',
  'source',
  'notes_pedagogiques',
  'cree_le',
];

const SPELL_TEMPLATE_SAMPLE_ROW = [
  'SL002',
  'Progression',
  '👣',
  '1',
  '0',
  '1 gemme',
  'mouvement',
  'equipe',
  'pion_equipe',
  'apres_jet_de',
  "Avance ou recule d'1 case",
  "Après le jet de dé, l'équipe peut avancer ou reculer son pion d'1 case par gemme dépensée.",
  'illimité (selon gemmes dispo)',
  'oui',
  'officiel',
  'yo.olution.info',
  '',
  '2026-05-26',
];

const CATEGORIES_STATS_TEMPLATE_HEADERS = [
  'categorie',
  'nb_total',
  'nb_officiels',
  'nb_proposes',
  'cout_moyen_gemmes',
];

const CATEGORIES_STATS_TEMPLATE_SAMPLE_ROW = ['mouvement', '6', '4', '2', '2.33'];

const SPELL_FIELD_KEYS = [
  'spell_code',
  'category_slug',
  'nom',
  'emoji',
  'cout_gemmes',
  'cout_coeurs',
  'cout_total_eq',
  'portee',
  'cible',
  'timing',
  'effet_court',
  'effet_detaille',
  'limite_usage',
  'cumul',
  'statut',
  'source',
  'notes_pedagogiques',
  'cree_le',
];

const HEADER_ALIASES = new Map([
  ['id', 'spell_code'],
  ['spell_code', 'spell_code'],
  ['nom', 'nom'],
  ['emoji', 'emoji'],
  ['cout_gemmes', 'cout_gemmes'],
  ['cout_coeurs', 'cout_coeurs'],
  ['cout_total_eq', 'cout_total_eq'],
  ['categorie', 'category_slug'],
  ['category_slug', 'category_slug'],
  ['portee', 'portee'],
  ['cible', 'cible'],
  ['timing', 'timing'],
  ['effet_court', 'effet_court'],
  ['effet_detaille', 'effet_detaille'],
  ['limite_usage', 'limite_usage'],
  ['cumul', 'cumul'],
  ['statut', 'statut'],
  ['source', 'source'],
  ['notes_pedagogiques', 'notes_pedagogiques'],
  ['cree_le', 'cree_le'],
]);

const CATEGORY_LABELS = {
  vie: 'Vie',
  mouvement: 'Mouvement',
  meta_social: 'Méta / social',
  pedagogique: 'Pédagogique',
};

function normalizeSpellCode(value) {
  const s = asTrimmedString(value).toUpperCase();
  return s.length > 0 ? s : '';
}

function parseIntOrZero(value) {
  const n = parseInt(String(value ?? '').replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function parseDateOrNull(value) {
  const s = asTrimmedString(value);
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function readSheetRows(wb, sheetName) {
  return wb.sheetNames.includes(sheetName) ? wb.sheets[sheetName] || [] : [];
}

function mapRowToSpellShape(row = {}) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    const canonical = HEADER_ALIASES.get(normalizeImportHeader(key));
    if (!canonical) continue;
    out[canonical] = value;
  }
  return out;
}

function buildSpellPayload(row = {}) {
  const mapped = mapRowToSpellShape(row);
  return {
    spell_code: normalizeSpellCode(mapped.spell_code),
    category_slug: asTrimmedString(mapped.category_slug).toLowerCase(),
    nom: asTrimmedString(mapped.nom),
    emoji: normalizeOptionalString(mapped.emoji),
    cout_gemmes: parseIntOrZero(mapped.cout_gemmes),
    cout_coeurs: parseIntOrZero(mapped.cout_coeurs),
    cout_total_eq: normalizeOptionalString(mapped.cout_total_eq),
    portee: normalizeOptionalString(mapped.portee),
    cible: normalizeOptionalString(mapped.cible),
    timing: normalizeOptionalString(mapped.timing),
    effet_court: normalizeOptionalString(mapped.effet_court),
    effet_detaille: normalizeOptionalString(mapped.effet_detaille),
    limite_usage: normalizeOptionalString(mapped.limite_usage),
    cumul: normalizeOptionalString(mapped.cumul),
    statut: normalizeOptionalString(mapped.statut) || 'officiel',
    source: normalizeOptionalString(mapped.source),
    notes_pedagogiques: normalizeOptionalString(mapped.notes_pedagogiques),
    cree_le: parseDateOrNull(mapped.cree_le),
  };
}

function validateSpellPayload(payload, rowNumber) {
  const errors = [];
  if (!payload.spell_code) {
    errors.push({ row: rowNumber, field: 'spell_code', error: 'Code sort requis (id)' });
  } else if (!/^SL\d+$/i.test(payload.spell_code)) {
    errors.push({ row: rowNumber, field: 'spell_code', error: 'Format attendu SL####' });
  }
  if (!payload.category_slug) {
    errors.push({ row: rowNumber, field: 'categorie', error: 'categorie requise' });
  }
  if (!payload.nom) {
    errors.push({ row: rowNumber, field: 'nom', error: 'nom requis' });
  }
  return errors;
}

function categorySlugToNom(slug) {
  return CATEGORY_LABELS[slug] || slug.replace(/_/g, ' ');
}

function parseCategoryStatsRows(rows = []) {
  const categories = [];
  let orderIndex = 0;
  for (const row of rows) {
    const slug = asTrimmedString(row.categorie).toLowerCase();
    if (!slug || slug.toUpperCase() === 'TOTAL') continue;
    orderIndex += 10;
    categories.push({
      slug,
      nom: categorySlugToNom(slug),
      order_index: orderIndex,
    });
  }
  return categories;
}

/**
 * @param {Buffer} buffer
 */
async function parseSpellsWorkbook(buffer, options = {}) {
  if (!buffer || buffer.length === 0) throw new Error('Fichier import vide');
  const maxBytes = options.maxFileBytes ?? getGlImportMaxFileBytes('default');
  if (buffer.length > maxBytes) {
    throw new Error(`Fichier import trop volumineux (max ${formatImportMaxFileLabel(maxBytes)})`);
  }
  const wb = await parseWorkbook(buffer);
  const spellRows = readSheetRows(wb, SPELLS_SHEET);
  const categoryRows = parseCategoryStatsRows(readSheetRows(wb, CATEGORIES_STATS_SHEET));
  return { spellRows, categoryRows };
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
      categories_synced: 0,
    },
    preview: [],
    errors: [],
  };
}

function spellPayloadToDbRow(payload) {
  const row = {};
  for (const key of SPELL_FIELD_KEYS) {
    row[key] = payload[key] ?? null;
  }
  return row;
}

const SPELL_UPSERT_SQL = `
  INSERT INTO gl_spells (
    spell_code, category_slug, nom, emoji, cout_gemmes, cout_coeurs, cout_total_eq,
    portee, cible, timing, effet_court, effet_detaille, limite_usage, cumul,
    statut, source, notes_pedagogiques, cree_le, created_at, updated_at
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, NOW(), NOW()
  )
  ON DUPLICATE KEY UPDATE
    category_slug = VALUES(category_slug),
    nom = VALUES(nom),
    emoji = VALUES(emoji),
    cout_gemmes = VALUES(cout_gemmes),
    cout_coeurs = VALUES(cout_coeurs),
    cout_total_eq = VALUES(cout_total_eq),
    portee = VALUES(portee),
    cible = VALUES(cible),
    timing = VALUES(timing),
    effet_court = VALUES(effet_court),
    effet_detaille = VALUES(effet_detaille),
    limite_usage = VALUES(limite_usage),
    cumul = VALUES(cumul),
    statut = VALUES(statut),
    source = VALUES(source),
    notes_pedagogiques = VALUES(notes_pedagogiques),
    cree_le = VALUES(cree_le),
    updated_at = NOW()
`;

function buildSpellUpsertParams(payload) {
  const row = spellPayloadToDbRow(payload);
  return SPELL_FIELD_KEYS.map((key) => row[key]);
}

async function resolveImportRows(body = {}) {
  const fileDataBase64 = asTrimmedString(body.fileDataBase64);
  if (!fileDataBase64) throw new Error('Fichier requis');
  const raw = fileDataBase64.includes(',') ? fileDataBase64.split(',')[1] : fileDataBase64;
  const buffer = Buffer.from(raw, 'base64');
  return parseSpellsWorkbook(buffer);
}

async function syncCategoriesFromRows(categoryRows, { execute, dryRun }) {
  let synced = 0;
  for (const cat of categoryRows) {
    if (dryRun) {
      synced += 1;
      continue;
    }
    await execute(
      `INSERT INTO gl_spell_categories (slug, nom, order_index, created_at, updated_at)
       VALUES (?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE nom = VALUES(nom), order_index = VALUES(order_index), updated_at = NOW()`,
      [cat.slug, cat.nom, cat.order_index],
    );
    synced += 1;
  }
  return synced;
}

async function ensureCategoryExists(payload, knownCategories, { execute, dryRun }) {
  if (knownCategories.has(payload.category_slug)) return;
  const nom = categorySlugToNom(payload.category_slug);
  if (!dryRun) {
    await execute(
      `INSERT INTO gl_spell_categories (slug, nom, order_index, created_at, updated_at)
       VALUES (?, ?, 999, NOW(), NOW())
       ON DUPLICATE KEY UPDATE nom = VALUES(nom), updated_at = NOW()`,
      [payload.category_slug, nom],
    );
  }
  knownCategories.add(payload.category_slug);
}

function validationErrorsToDetails(errors) {
  return (errors || []).map((item) => ({
    field: item.field,
    error: item.error,
  }));
}

async function allocateNextSpellCode(queryAll) {
  const rows = await queryAll(
    `SELECT spell_code FROM gl_spells WHERE spell_code REGEXP '^SL[0-9]+$'`,
  );
  let maxNum = 0;
  for (const row of rows) {
    const match = String(row.spell_code || '').match(/^SL(\d+)$/i);
    if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
  }
  return `SL${String(maxNum + 1).padStart(3, '0')}`;
}

async function upsertSpellRow(deps, body, options = {}) {
  const { queryAll, execute } = deps;
  const forceCode = options.spell_code ? normalizeSpellCode(options.spell_code) : null;
  const payload = buildSpellPayload(body);
  if (!payload.spell_code && !forceCode) {
    payload.spell_code = await allocateNextSpellCode(queryAll);
  } else if (forceCode) {
    payload.spell_code = forceCode;
  }

  const rowErrors = validateSpellPayload(payload, 1);
  if (rowErrors.length) {
    const err = new Error('Données sort invalides');
    err.statusCode = 400;
    err.details = validationErrorsToDetails(rowErrors);
    throw err;
  }

  const existing = await queryAll('SELECT spell_code FROM gl_spells WHERE spell_code = ? LIMIT 1', [
    payload.spell_code,
  ]);
  const created = existing.length === 0;
  if (created && options.requireExisting) {
    const err = new Error('Sort introuvable');
    err.statusCode = 404;
    throw err;
  }
  if (!created && options.requireNew) {
    const err = new Error('Ce code sort existe déjà');
    err.statusCode = 409;
    throw err;
  }

  const knownCategories = new Set(
    (await queryAll('SELECT slug FROM gl_spell_categories')).map((r) => String(r.slug)),
  );
  await ensureCategoryExists(payload, knownCategories, { execute, dryRun: false });
  await execute(SPELL_UPSERT_SQL, buildSpellUpsertParams(payload));

  return { created, payload };
}

async function applySpellsImport(deps, spellRows, options = {}) {
  const { queryAll, execute } = deps;
  const dryRun = !!options.dryRun;
  const syncCategories = options.syncCategories !== false;
  const categoryRows = Array.isArray(options.categoryRows) ? options.categoryRows : [];

  const report = buildImportReportBase(dryRun, 'xlsx', spellRows.length);
  if (spellRows.length > MAX_IMPORT_ROWS) {
    throw new Error(`Trop de lignes (max ${MAX_IMPORT_ROWS})`);
  }

  if (syncCategories && categoryRows.length > 0) {
    report.totals.categories_synced = await syncCategoriesFromRows(categoryRows, {
      execute,
      dryRun,
    });
  }

  const existingRows = await queryAll('SELECT spell_code FROM gl_spells');
  const existingCodes = new Set(existingRows.map((r) => String(r.spell_code).toUpperCase()));
  const knownCategories = new Set([
    ...categoryRows.map((c) => c.slug),
    ...(await queryAll('SELECT slug FROM gl_spell_categories')).map((r) => String(r.slug)),
  ]);

  const validRows = [];
  for (let i = 0; i < spellRows.length; i += 1) {
    const rowNumber = i + 2;
    const payload = buildSpellPayload(spellRows[i]);
    const rowErrors = validateSpellPayload(payload, rowNumber);
    if (rowErrors.length) {
      report.errors.push(...rowErrors);
      report.totals.skipped_invalid += 1;
      continue;
    }
    validRows.push({ rowNumber, payload });
  }

  report.totals.valid = validRows.length;
  report.preview = validRows.slice(0, 5).map(({ payload }) => ({
    spell_code: payload.spell_code,
    category_slug: payload.category_slug,
    nom: payload.nom,
    statut: payload.statut,
  }));

  if (dryRun) {
    for (const { payload } of validRows) {
      if (existingCodes.has(payload.spell_code)) report.totals.updated += 1;
      else report.totals.created += 1;
    }
    return report;
  }

  for (const { payload } of validRows) {
    await ensureCategoryExists(payload, knownCategories, { execute, dryRun });
    const existed = existingCodes.has(payload.spell_code);
    await execute(SPELL_UPSERT_SQL, buildSpellUpsertParams(payload));
    if (existed) report.totals.updated += 1;
    else {
      report.totals.created += 1;
      existingCodes.add(payload.spell_code);
    }
  }

  return report;
}

function spellRowToExportArray(row) {
  return [
    row.id ?? '',
    row.nom ?? '',
    row.emoji ?? '',
    row.cout_gemmes ?? '',
    row.cout_coeurs ?? '',
    row.cout_total_eq ?? '',
    row.categorie ?? '',
    row.portee ?? '',
    row.cible ?? '',
    row.timing ?? '',
    row.effet_court ?? '',
    row.effet_detaille ?? '',
    row.limite_usage ?? '',
    row.cumul ?? '',
    row.statut ?? '',
    row.source ?? '',
    row.notes_pedagogiques ?? '',
    row.cree_le ?? '',
  ];
}

function categoryStatsRowToExportArray(row) {
  return [
    row.categorie ?? '',
    row.nb_total ?? '',
    row.nb_officiels ?? '',
    row.nb_proposes ?? '',
    row.cout_moyen_gemmes ?? '',
  ];
}

async function buildSpellsTemplateWorkbook() {
  return buildWorkbookBuffer([
    { name: SPELLS_SHEET, aoa: [SPELL_TEMPLATE_HEADERS, SPELL_TEMPLATE_SAMPLE_ROW] },
    {
      name: CATEGORIES_STATS_SHEET,
      aoa: [CATEGORIES_STATS_TEMPLATE_HEADERS, CATEGORIES_STATS_TEMPLATE_SAMPLE_ROW],
    },
  ]);
}

async function buildSpellsExportWorkbook({ spellRows, categoryStatsRows }) {
  const spellData = [SPELL_TEMPLATE_HEADERS, ...spellRows.map(spellRowToExportArray)];
  const catData = [
    CATEGORIES_STATS_TEMPLATE_HEADERS,
    ...categoryStatsRows.map(categoryStatsRowToExportArray),
  ];
  return buildWorkbookBuffer([
    { name: SPELLS_SHEET, aoa: spellData },
    { name: CATEGORIES_STATS_SHEET, aoa: catData },
  ]);
}

async function loadSpellsExportRows(deps, options = {}) {
  const { queryAll } = deps;
  const statut = options.statut === 'all' ? null : options.statut || null;
  const categorySlug = asTrimmedString(options.categorySlug).toLowerCase() || null;

  const params = [];
  let spellWhere = '1=1';
  if (statut) {
    spellWhere += ' AND s.statut = ?';
    params.push(statut);
  }
  if (categorySlug) {
    spellWhere += ' AND s.category_slug = ?';
    params.push(categorySlug);
  }

  const spellDb = await queryAll(
    `SELECT s.spell_code, s.category_slug, c.nom AS category_nom, s.nom, s.emoji,
            s.cout_gemmes, s.cout_coeurs, s.cout_total_eq, s.portee, s.cible, s.timing,
            s.effet_court, s.effet_detaille, s.limite_usage, s.cumul, s.statut,
            s.source, s.notes_pedagogiques, s.cree_le
       FROM gl_spells s
  INNER JOIN gl_spell_categories c ON c.slug = s.category_slug
      WHERE ${spellWhere}
      ORDER BY c.order_index ASC, s.nom ASC`,
    params,
  );

  const spellRows = spellDb.map((row) => ({
    id: row.spell_code,
    nom: row.nom,
    emoji: row.emoji || '',
    cout_gemmes: row.cout_gemmes,
    cout_coeurs: row.cout_coeurs,
    cout_total_eq: row.cout_total_eq || '',
    categorie: row.category_slug,
    portee: row.portee || '',
    cible: row.cible || '',
    timing: row.timing || '',
    effet_court: row.effet_court || '',
    effet_detaille: row.effet_detaille || '',
    limite_usage: row.limite_usage || '',
    cumul: row.cumul || '',
    statut: row.statut || 'officiel',
    source: row.source || '',
    notes_pedagogiques: row.notes_pedagogiques || '',
    cree_le: row.cree_le ? String(row.cree_le).slice(0, 10) : '',
  }));

  const catParams = [];
  const joinStatut = statut ? ' AND sp.statut = ?' : '';
  if (statut) catParams.push(statut);
  const catWhere = categorySlug ? ' WHERE c.slug = ?' : '';
  if (categorySlug) catParams.push(categorySlug);

  const categoryStatsDb = await queryAll(
    `SELECT c.slug AS categorie,
            COUNT(sp.id) AS nb_total,
            SUM(CASE WHEN sp.statut = 'officiel' THEN 1 ELSE 0 END) AS nb_officiels,
            SUM(CASE WHEN sp.statut = 'propose' THEN 1 ELSE 0 END) AS nb_proposes,
            ROUND(AVG(sp.cout_gemmes), 2) AS cout_moyen_gemmes
       FROM gl_spell_categories c
  LEFT JOIN gl_spells sp ON sp.category_slug = c.slug${joinStatut}
      ${catWhere}
      GROUP BY c.slug, c.nom, c.order_index
      ORDER BY c.order_index ASC, c.slug ASC`,
    catParams,
  );

  const categoryStatsRows = categoryStatsDb.map((row) => ({
    categorie: row.categorie,
    nb_total: Number(row.nb_total || 0),
    nb_officiels: Number(row.nb_officiels || 0),
    nb_proposes: Number(row.nb_proposes || 0),
    cout_moyen_gemmes: row.cout_moyen_gemmes != null ? Number(row.cout_moyen_gemmes) : '',
  }));

  return { spellRows, categoryStatsRows };
}

module.exports = {
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
  SPELLS_SHEET,
  CATEGORIES_STATS_SHEET,
  SPELL_FIELD_KEYS,
  SPELL_TEMPLATE_HEADERS,
  SPELL_UPSERT_SQL,
  asTrimmedString,
  buildSpellPayload,
  validateSpellPayload,
  parseSpellsWorkbook,
  parseCategoryStatsRows,
  buildSpellUpsertParams,
  spellPayloadToDbRow,
  resolveImportRows,
  applySpellsImport,
  upsertSpellRow,
  allocateNextSpellCode,
  validationErrorsToDetails,
  buildSpellsTemplateWorkbook,
  buildSpellsExportWorkbook,
  loadSpellsExportRows,
  CATEGORY_LABELS,
};
