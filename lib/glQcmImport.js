'use strict';

const { parseWorkbook, buildWorkbookBuffer } = require('./spreadsheet');
const { getGlImportMaxFileBytes, formatImportMaxFileLabel } = require('./glImportLimits');
const {
  buildGlossaryLookupMap,
  matchGlossaryTermsForSpecies,
  asTrimmedString,
} = require('./glGlossaryMatch');
const { CHOICE_LETTERS } = require('./glQcmChoices');
const { normalizeLoreBiomeSlug } = require('./glBiomesRegistry');

const MAX_IMPORT_FILE_BYTES = getGlImportMaxFileBytes('default');
const MAX_IMPORT_ROWS = 800;
const CATEGORIES_SHEET = 'categories';
const QUESTIONS_SHEET = 'questions';

const CATEGORY_TEMPLATE_HEADERS = [
  'categorie_slug',
  'categorie_nom',
  'emoji',
  'description',
  'ordre',
];

const CATEGORY_TEMPLATE_SAMPLE_ROW = [
  'ecologie',
  'Écologie',
  '🌿',
  'Questions sur les interactions et les écosystèmes.',
  '1',
];

const QUESTION_TEMPLATE_HEADERS = [
  'id',
  'biome_slug',
  'categorie_slug',
  'numero_dans_categorie',
  'question',
  'choix_a',
  'choix_b',
  'choix_c',
  'choix_d',
  'choix_e',
  'reponse_correcte',
  'reponse_texte',
  'niveau',
  'difficulte',
  'difficulte_label',
  'notes_pedagogiques',
  'tags',
  'mots_cles',
  'photo_url',
  'photo_url_hd',
  'photo_description_url',
  'photo_filename',
  'photo_credit',
  'photo_licence',
  'photo_licence_url',
  'photo_legende',
  'photo_sujet',
  'wikipedia_title',
  'wikipedia_url',
  'photo_method',
  'statut',
  'feedback_correct',
  'feedback_a',
  'feedback_b',
  'feedback_c',
  'feedback_d',
  'feedback_e',
];

const QUESTION_TEMPLATE_SAMPLE_ROW = [
  '1',
  'foret_temperee',
  'ecologie',
  '1',
  'Qu’est-ce qu’un biome ?',
  'Une grande région écologique homogène',
  'Un animal de la forêt',
  'Une plante comestible',
  'Un type de sol uniquement',
  'Une zone urbaine',
  'A',
  '',
  'base',
  '1',
  'facile',
  '',
  'biome, écologie',
  'biome',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  'actif',
  'Exact ! Les grandes oreilles du fennec dissipent la chaleur.',
  '',
  'Non. Aucune couleur de fourrure ne repousse le soleil.',
  '',
  '',
  '',
];

const QUESTION_FIELD_KEYS = [
  'question_code',
  'biome_slug',
  'categorie_slug',
  'numero_dans_categorie',
  'question',
  'choix_a',
  'choix_b',
  'choix_c',
  'choix_d',
  'choix_e',
  'reponse_correcte',
  'reponse_texte',
  'niveau',
  'difficulte',
  'difficulte_label',
  'notes_pedagogiques',
  'tags',
  'mots_cles',
  'photo_url',
  'photo_url_hd',
  'photo_description_url',
  'photo_filename',
  'photo_credit',
  'photo_licence',
  'photo_licence_url',
  'photo_legende',
  'photo_sujet',
  'wikipedia_title',
  'wikipedia_url',
  'photo_method',
  'statut',
  'feedback_correct',
  'feedback_a',
  'feedback_b',
  'feedback_c',
  'feedback_d',
  'feedback_e',
];

const CATEGORY_HEADER_ALIASES = new Map([
  ['categorie_slug', 'slug'],
  ['slug', 'slug'],
  ['categorie_nom', 'nom'],
  ['nom', 'nom'],
  ['emoji', 'emoji'],
  ['description', 'description'],
  ['ordre', 'order_index'],
  ['order_index', 'order_index'],
]);

const QUESTION_HEADER_ALIASES = new Map([
  ['id', 'id'],
  ['question_code', 'question_code'],
  ['biome_slug', 'biome_slug'],
  ['categorie_slug', 'categorie_slug'],
  ['numero_dans_categorie', 'numero_dans_categorie'],
  ['question', 'question'],
  ['choix_a', 'choix_a'],
  ['choix_b', 'choix_b'],
  ['choix_c', 'choix_c'],
  ['choix_d', 'choix_d'],
  ['choix_e', 'choix_e'],
  ['reponse_correcte', 'reponse_correcte'],
  ['reponse_texte', 'reponse_texte'],
  ['niveau', 'niveau'],
  ['difficulte', 'difficulte'],
  ['difficulte_label', 'difficulte_label'],
  ['notes_pedagogiques', 'notes_pedagogiques'],
  ['tags', 'tags'],
  ['mots_cles', 'mots_cles'],
  ['photo_url', 'photo_url'],
  ['photo_url_hd', 'photo_url_hd'],
  ['photo_description_url', 'photo_description_url'],
  ['photo_filename', 'photo_filename'],
  ['photo_credit', 'photo_credit'],
  ['photo_licence', 'photo_licence'],
  ['photo_licence_url', 'photo_licence_url'],
  ['photo_legende', 'photo_legende'],
  ['photo_sujet', 'photo_sujet'],
  ['wikipedia_title', 'wikipedia_title'],
  ['wikipedia_url', 'wikipedia_url'],
  ['photo_method', 'photo_method'],
  ['statut', 'statut'],
  ['feedback_correct', 'feedback_correct'],
  ['feedback_a', 'feedback_a'],
  ['feedback_b', 'feedback_b'],
  ['feedback_c', 'feedback_c'],
  ['feedback_d', 'feedback_d'],
  ['feedback_e', 'feedback_e'],
]);

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

function normalizeHttpsUrl(value) {
  const s = asTrimmedString(value);
  if (!s) return null;
  if (/^http:\/\//i.test(s)) return s.replace(/^http:\/\//i, 'https://');
  return s;
}

function formatQuestionCode(rawId) {
  const n = Number(rawId);
  if (!Number.isFinite(n) || n <= 0) return '';
  return `QCM${String(Math.floor(n)).padStart(4, '0')}`;
}

function parseQuestionIdFromCode(code) {
  const m = /^QCM(\d+)$/i.exec(asTrimmedString(code));
  return m ? Number(m[1]) : '';
}

function readSheetRows(wb, sheetName) {
  return wb.sheetNames.includes(sheetName) ? (wb.sheets[sheetName] || []) : [];
}

function mapRow(row = {}, aliases) {
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    const canonical = aliases.get(normalizeImportHeader(key));
    if (!canonical) continue;
    out[canonical] = value;
  }
  return out;
}

function buildCategoryPayload(row = {}) {
  const mapped = mapRow(row, CATEGORY_HEADER_ALIASES);
  return {
    slug: asTrimmedString(mapped.slug).toLowerCase(),
    nom: asTrimmedString(mapped.nom),
    emoji: normalizeOptionalString(mapped.emoji),
    description: normalizeOptionalString(mapped.description),
    order_index: Number(mapped.order_index) || 0,
  };
}

function validateCategoryPayload(payload, rowNumber) {
  const errors = [];
  if (!payload.slug) errors.push({ row: rowNumber, field: 'categorie_slug', error: 'slug requis' });
  if (!payload.nom) errors.push({ row: rowNumber, field: 'categorie_nom', error: 'nom requis' });
  return errors;
}

function buildQuestionPayload(row = {}) {
  const mapped = mapRow(row, QUESTION_HEADER_ALIASES);
  const rawId = mapped.id || mapped.question_code;
  const questionCode = mapped.question_code
    ? asTrimmedString(mapped.question_code).toUpperCase()
    : formatQuestionCode(rawId);
  const reponse = asTrimmedString(mapped.reponse_correcte).toUpperCase();
  const difficulteRaw = mapped.difficulte;
  const difficulte = difficulteRaw === '' || difficulteRaw == null
    ? null
    : Number(difficulteRaw);

  return {
    question_code: questionCode,
    biome_slug: normalizeLoreBiomeSlug(mapped.biome_slug) || asTrimmedString(mapped.biome_slug).toLowerCase(),
    categorie_slug: asTrimmedString(mapped.categorie_slug).toLowerCase(),
    numero_dans_categorie: Number(mapped.numero_dans_categorie) || 0,
    question: asTrimmedString(mapped.question),
    choix_a: asTrimmedString(mapped.choix_a),
    choix_b: asTrimmedString(mapped.choix_b),
    choix_c: asTrimmedString(mapped.choix_c),
    choix_d: asTrimmedString(mapped.choix_d),
    choix_e: asTrimmedString(mapped.choix_e),
    reponse_correcte: CHOICE_LETTERS.includes(reponse) ? reponse : null,
    reponse_texte: normalizeOptionalString(mapped.reponse_texte),
    niveau: normalizeOptionalString(mapped.niveau),
    difficulte: Number.isFinite(difficulte) ? difficulte : null,
    difficulte_label: normalizeOptionalString(mapped.difficulte_label),
    notes_pedagogiques: normalizeOptionalString(mapped.notes_pedagogiques),
    tags: normalizeOptionalString(mapped.tags),
    mots_cles: normalizeOptionalString(mapped.mots_cles),
    photo_url: normalizeOptionalString(normalizeHttpsUrl(mapped.photo_url)),
    photo_url_hd: normalizeOptionalString(normalizeHttpsUrl(mapped.photo_url_hd)),
    photo_description_url: normalizeOptionalString(normalizeHttpsUrl(mapped.photo_description_url)),
    photo_filename: normalizeOptionalString(mapped.photo_filename),
    photo_credit: normalizeOptionalString(mapped.photo_credit),
    photo_licence: normalizeOptionalString(mapped.photo_licence),
    photo_licence_url: normalizeOptionalString(normalizeHttpsUrl(mapped.photo_licence_url)),
    photo_legende: normalizeOptionalString(mapped.photo_legende),
    photo_sujet: normalizeOptionalString(mapped.photo_sujet),
    wikipedia_title: normalizeOptionalString(mapped.wikipedia_title),
    wikipedia_url: normalizeOptionalString(normalizeHttpsUrl(mapped.wikipedia_url)),
    photo_method: normalizeOptionalString(mapped.photo_method),
    statut: normalizeOptionalString(mapped.statut) || 'actif',
    feedback_correct: normalizeOptionalString(mapped.feedback_correct),
    feedback_a: normalizeOptionalString(mapped.feedback_a),
    feedback_b: normalizeOptionalString(mapped.feedback_b),
    feedback_c: normalizeOptionalString(mapped.feedback_c),
    feedback_d: normalizeOptionalString(mapped.feedback_d),
    feedback_e: normalizeOptionalString(mapped.feedback_e),
  };
}

function validateQuestionPayload(payload, rowNumber, knownBiomes, knownCategories) {
  const errors = [];
  if (!payload.question_code) {
    errors.push({ row: rowNumber, field: 'id', error: 'Code question requis (id)' });
  }
  if (!payload.biome_slug) {
    errors.push({ row: rowNumber, field: 'biome_slug', error: 'biome_slug requis' });
  } else if (!knownBiomes.has(payload.biome_slug)) {
    errors.push({ row: rowNumber, field: 'biome_slug', error: `biome_slug inconnu: ${payload.biome_slug}` });
  }
  if (!payload.categorie_slug) {
    errors.push({ row: rowNumber, field: 'categorie_slug', error: 'categorie_slug requis' });
  } else if (!knownCategories.has(payload.categorie_slug)) {
    errors.push({ row: rowNumber, field: 'categorie_slug', error: `categorie_slug inconnu: ${payload.categorie_slug}` });
  }
  if (!payload.numero_dans_categorie) {
    errors.push({ row: rowNumber, field: 'numero_dans_categorie', error: 'numero_dans_categorie requis' });
  }
  if (!payload.question) {
    errors.push({ row: rowNumber, field: 'question', error: 'question requise' });
  }
  for (const letter of CHOICE_LETTERS) {
    const key = `choix_${letter.toLowerCase()}`;
    if (!payload[key]) {
      errors.push({ row: rowNumber, field: key, error: `${key} requis` });
    }
  }
  if (!payload.reponse_correcte) {
    errors.push({ row: rowNumber, field: 'reponse_correcte', error: 'reponse_correcte invalide (A-E)' });
  }
  return errors;
}

async function parseQcmWorkbook(buffer, options = {}) {
  if (!buffer || buffer.length === 0) throw new Error('Fichier import vide');
  const maxBytes = options.maxFileBytes ?? getGlImportMaxFileBytes('default');
  if (buffer.length > maxBytes) {
    throw new Error(`Fichier import trop volumineux (max ${formatImportMaxFileLabel(maxBytes)})`);
  }
  const wb = await parseWorkbook(buffer);
  return {
    categoryRows: readSheetRows(wb, CATEGORIES_SHEET),
    questionRows: readSheetRows(wb, QUESTIONS_SHEET),
  };
}

function buildImportReportBase(dryRun, questionCount) {
  return {
    dryRun,
    sourceType: 'xlsx',
    totals: {
      received: questionCount,
      valid: 0,
      created: 0,
      updated: 0,
      skipped_invalid: 0,
      categories_synced: 0,
      glossary_links_synced: 0,
    },
    preview: [],
    errors: [],
  };
}

const CATEGORY_UPSERT_SQL = `
  INSERT INTO gl_qcm_categories (slug, nom, emoji, description, order_index, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, NOW(), NOW())
  ON DUPLICATE KEY UPDATE
    nom = VALUES(nom),
    emoji = VALUES(emoji),
    description = VALUES(description),
    order_index = VALUES(order_index),
    updated_at = NOW()
`;

const QUESTION_UPSERT_SQL = `
  INSERT INTO gl_qcm_questions (
    question_code, biome_slug, categorie_slug, numero_dans_categorie, question,
    choix_a, choix_b, choix_c, choix_d, choix_e,
    reponse_correcte, reponse_texte, niveau, difficulte, difficulte_label,
    notes_pedagogiques, tags, mots_cles,
    photo_url, photo_url_hd, photo_description_url, photo_filename, photo_credit,
    photo_licence, photo_licence_url, photo_legende, photo_sujet,
    wikipedia_title, wikipedia_url, photo_method, statut,
    feedback_correct, feedback_a, feedback_b, feedback_c, feedback_d, feedback_e,
    created_at, updated_at
  ) VALUES (
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?,
    NOW(), NOW()
  )
  ON DUPLICATE KEY UPDATE
    biome_slug = VALUES(biome_slug),
    categorie_slug = VALUES(categorie_slug),
    numero_dans_categorie = VALUES(numero_dans_categorie),
    question = VALUES(question),
    choix_a = VALUES(choix_a),
    choix_b = VALUES(choix_b),
    choix_c = VALUES(choix_c),
    choix_d = VALUES(choix_d),
    choix_e = VALUES(choix_e),
    reponse_correcte = VALUES(reponse_correcte),
    reponse_texte = VALUES(reponse_texte),
    niveau = VALUES(niveau),
    difficulte = VALUES(difficulte),
    difficulte_label = VALUES(difficulte_label),
    notes_pedagogiques = VALUES(notes_pedagogiques),
    tags = VALUES(tags),
    mots_cles = VALUES(mots_cles),
    photo_url = VALUES(photo_url),
    photo_url_hd = VALUES(photo_url_hd),
    photo_description_url = VALUES(photo_description_url),
    photo_filename = VALUES(photo_filename),
    photo_credit = VALUES(photo_credit),
    photo_licence = VALUES(photo_licence),
    photo_licence_url = VALUES(photo_licence_url),
    photo_legende = VALUES(photo_legende),
    photo_sujet = VALUES(photo_sujet),
    wikipedia_title = VALUES(wikipedia_title),
    wikipedia_url = VALUES(wikipedia_url),
    photo_method = VALUES(photo_method),
    statut = VALUES(statut),
    feedback_correct = COALESCE(NULLIF(VALUES(feedback_correct), ''), feedback_correct),
    feedback_a = COALESCE(NULLIF(VALUES(feedback_a), ''), feedback_a),
    feedback_b = COALESCE(NULLIF(VALUES(feedback_b), ''), feedback_b),
    feedback_c = COALESCE(NULLIF(VALUES(feedback_c), ''), feedback_c),
    feedback_d = COALESCE(NULLIF(VALUES(feedback_d), ''), feedback_d),
    feedback_e = COALESCE(NULLIF(VALUES(feedback_e), ''), feedback_e),
    updated_at = NOW()
`;

function buildQuestionUpsertParams(payload) {
  return QUESTION_FIELD_KEYS.map((key) => payload[key] ?? null);
}

async function resolveImportRows(body = {}) {
  const fileDataBase64 = asTrimmedString(body.fileDataBase64);
  if (!fileDataBase64) throw new Error('Fichier requis');
  const raw = fileDataBase64.includes(',') ? fileDataBase64.split(',')[1] : fileDataBase64;
  const buffer = Buffer.from(raw, 'base64');
  return parseQcmWorkbook(buffer);
}

function combineKeywords(payload) {
  return [payload.tags, payload.mots_cles].filter(Boolean).join(', ');
}

async function syncGlossaryLinks(validRows, deps, dryRun) {
  const { queryAll, execute } = deps;
  const glossaryRows = await queryAll(
    `SELECT glossary_code, terme, variantes, categorie, definition_courte
       FROM gl_glossary_terms WHERE statut = 'actif'`
  );
  const glossaryByKey = buildGlossaryLookupMap(glossaryRows);
  let count = 0;

  if (!dryRun) {
    await execute('DELETE FROM gl_qcm_question_glossary');
  }

  for (const { payload } of validRows) {
    const matched = matchGlossaryTermsForSpecies(combineKeywords(payload), glossaryByKey);
    count += matched.length;
    if (!dryRun) {
      for (const term of matched) {
        await execute(
          'INSERT IGNORE INTO gl_qcm_question_glossary (question_code, glossary_code) VALUES (?, ?)',
          [payload.question_code, term.glossary_code]
        );
      }
    }
  }
  return count;
}

async function applyQcmImport(deps, categoryRows, questionRows, options = {}) {
  const { execute } = deps;
  const dryRun = !!options.dryRun;
  const report = buildImportReportBase(dryRun, questionRows.length);

  if (questionRows.length > MAX_IMPORT_ROWS) {
    throw new Error(`Trop de lignes (max ${MAX_IMPORT_ROWS})`);
  }

  const validCategories = [];
  for (let i = 0; i < categoryRows.length; i += 1) {
    const rowNumber = i + 2;
    const payload = buildCategoryPayload(categoryRows[i]);
    const rowErrors = validateCategoryPayload(payload, rowNumber);
    if (rowErrors.length) {
      report.errors.push(...rowErrors);
      continue;
    }
    validCategories.push(payload);
  }

  const knownCategories = new Set(validCategories.map((c) => c.slug));
  const knownBiomes = new Set(
    (await deps.queryAll('SELECT slug FROM gl_biomes')).map((r) => String(r.slug))
  );

  const validRows = [];
  for (let i = 0; i < questionRows.length; i += 1) {
    const rowNumber = i + 2;
    const payload = buildQuestionPayload(questionRows[i]);
    const rowErrors = validateQuestionPayload(payload, rowNumber, knownBiomes, knownCategories);
    if (rowErrors.length) {
      report.errors.push(...rowErrors);
      report.totals.skipped_invalid += 1;
      continue;
    }
    validRows.push({ rowNumber, payload });
  }

  report.totals.valid = validRows.length;
  report.preview = validRows.slice(0, 5).map(({ payload }) => ({
    question_code: payload.question_code,
    biome_slug: payload.biome_slug,
    categorie_slug: payload.categorie_slug,
    question: payload.question.slice(0, 80),
  }));

  if (dryRun) {
    const existingRows = await deps.queryAll('SELECT question_code FROM gl_qcm_questions');
    const existingCodes = new Set(existingRows.map((r) => String(r.question_code)));
    for (const { payload } of validRows) {
      if (existingCodes.has(payload.question_code)) report.totals.updated += 1;
      else report.totals.created += 1;
    }
    report.totals.categories_synced = validCategories.length;
    report.totals.glossary_links_synced = await syncGlossaryLinks(validRows, deps, true);
    return report;
  }

  for (const payload of validCategories) {
    await execute(CATEGORY_UPSERT_SQL, [
      payload.slug,
      payload.nom,
      payload.emoji,
      payload.description,
      payload.order_index,
    ]);
    report.totals.categories_synced += 1;
  }

  const existingRows = await deps.queryAll('SELECT question_code FROM gl_qcm_questions');
  const existingCodes = new Set(existingRows.map((r) => String(r.question_code)));

  for (const { payload } of validRows) {
    const existed = existingCodes.has(payload.question_code);
    await execute(QUESTION_UPSERT_SQL, buildQuestionUpsertParams(payload));
    if (existed) report.totals.updated += 1;
    else {
      report.totals.created += 1;
      existingCodes.add(payload.question_code);
    }
  }

  report.totals.glossary_links_synced = await syncGlossaryLinks(validRows, deps, false);
  return report;
}

function categoryRowToExportArray(row) {
  return [
    row.categorie_slug ?? '',
    row.categorie_nom ?? '',
    row.emoji ?? '',
    row.description ?? '',
    row.ordre ?? '',
  ];
}

function questionRowToExportArray(row) {
  return [
    row.id ?? '',
    row.biome_slug ?? '',
    row.categorie_slug ?? '',
    row.numero_dans_categorie ?? '',
    row.question ?? '',
    row.choix_a ?? '',
    row.choix_b ?? '',
    row.choix_c ?? '',
    row.choix_d ?? '',
    row.choix_e ?? '',
    row.reponse_correcte ?? '',
    row.reponse_texte ?? '',
    row.niveau ?? '',
    row.difficulte ?? '',
    row.difficulte_label ?? '',
    row.notes_pedagogiques ?? '',
    row.tags ?? '',
    row.mots_cles ?? '',
    row.photo_url ?? '',
    row.photo_url_hd ?? '',
    row.photo_description_url ?? '',
    row.photo_filename ?? '',
    row.photo_credit ?? '',
    row.photo_licence ?? '',
    row.photo_licence_url ?? '',
    row.photo_legende ?? '',
    row.photo_sujet ?? '',
    row.wikipedia_title ?? '',
    row.wikipedia_url ?? '',
    row.photo_method ?? '',
    row.statut ?? '',
    row.feedback_correct ?? '',
    row.feedback_a ?? '',
    row.feedback_b ?? '',
    row.feedback_c ?? '',
    row.feedback_d ?? '',
    row.feedback_e ?? '',
  ];
}

async function buildQcmTemplateWorkbook() {
  return buildWorkbookBuffer([
    { name: CATEGORIES_SHEET, aoa: [CATEGORY_TEMPLATE_HEADERS, CATEGORY_TEMPLATE_SAMPLE_ROW] },
    { name: QUESTIONS_SHEET, aoa: [QUESTION_TEMPLATE_HEADERS, QUESTION_TEMPLATE_SAMPLE_ROW] },
  ]);
}

async function buildQcmExportWorkbook({ categories, questions }) {
  const catData = [CATEGORY_TEMPLATE_HEADERS, ...categories.map(categoryRowToExportArray)];
  const qData = [QUESTION_TEMPLATE_HEADERS, ...questions.map(questionRowToExportArray)];
  return buildWorkbookBuffer([
    { name: CATEGORIES_SHEET, aoa: catData },
    { name: QUESTIONS_SHEET, aoa: qData },
  ]);
}

async function loadQcmExportRows(deps, options = {}) {
  const { queryAll } = deps;
  const statut = options.statut === 'all' ? null : (options.statut || 'actif');
  const biomeSlug = asTrimmedString(options.biomeSlug).toLowerCase() || null;
  const categorieSlug = asTrimmedString(options.categorieSlug).toLowerCase() || null;

  const categories = await queryAll(
    `SELECT slug, nom, emoji, description, order_index
       FROM gl_qcm_categories
      ORDER BY order_index ASC, slug ASC`
  );

  const params = [];
  let where = '1=1';
  if (statut) {
    where += ' AND statut = ?';
    params.push(statut);
  }
  if (biomeSlug) {
    where += ' AND biome_slug = ?';
    params.push(biomeSlug);
  }
  if (categorieSlug) {
    where += ' AND categorie_slug = ?';
    params.push(categorieSlug);
  }

  const questions = await queryAll(
    `SELECT question_code, biome_slug, categorie_slug, numero_dans_categorie, question,
            choix_a, choix_b, choix_c, choix_d, choix_e,
            reponse_correcte, reponse_texte, niveau, difficulte, difficulte_label,
            notes_pedagogiques, tags, mots_cles,
            photo_url, photo_url_hd, photo_description_url, photo_filename, photo_credit,
            photo_licence, photo_licence_url, photo_legende, photo_sujet,
            wikipedia_title, wikipedia_url, photo_method, statut,
            feedback_correct, feedback_a, feedback_b, feedback_c, feedback_d, feedback_e
       FROM gl_qcm_questions
      WHERE ${where}
      ORDER BY biome_slug ASC, categorie_slug ASC, numero_dans_categorie ASC`,
    params
  );

  const hasQuestionFilter = !!(biomeSlug || categorieSlug);
  const categorySlugsInExport = [...new Set(questions.map((q) => String(q.categorie_slug)).filter(Boolean))];
  let filteredCategories = categories;
  if (hasQuestionFilter && categorySlugsInExport.length > 0) {
    const placeholders = categorySlugsInExport.map(() => '?').join(',');
    filteredCategories = await queryAll(
      `SELECT slug, nom, emoji, description, order_index
         FROM gl_qcm_categories
        WHERE slug IN (${placeholders})
        ORDER BY order_index ASC, slug ASC`,
      categorySlugsInExport
    );
  }

  return {
    categories: filteredCategories.map((c) => ({
      categorie_slug: c.slug,
      categorie_nom: c.nom,
      emoji: c.emoji || '',
      description: c.description || '',
      ordre: c.order_index ?? 0,
    })),
    questions: questions.map((q) => ({
      id: parseQuestionIdFromCode(q.question_code),
      biome_slug: q.biome_slug,
      categorie_slug: q.categorie_slug,
      numero_dans_categorie: q.numero_dans_categorie,
      question: q.question,
      choix_a: q.choix_a,
      choix_b: q.choix_b,
      choix_c: q.choix_c,
      choix_d: q.choix_d,
      choix_e: q.choix_e,
      reponse_correcte: q.reponse_correcte,
      reponse_texte: q.reponse_texte || '',
      niveau: q.niveau || '',
      difficulte: q.difficulte ?? '',
      difficulte_label: q.difficulte_label || '',
      notes_pedagogiques: q.notes_pedagogiques || '',
      tags: q.tags || '',
      mots_cles: q.mots_cles || '',
      photo_url: q.photo_url || '',
      photo_url_hd: q.photo_url_hd || '',
      photo_description_url: q.photo_description_url || '',
      photo_filename: q.photo_filename || '',
      photo_credit: q.photo_credit || '',
      photo_licence: q.photo_licence || '',
      photo_licence_url: q.photo_licence_url || '',
      photo_legende: q.photo_legende || '',
      photo_sujet: q.photo_sujet || '',
      wikipedia_title: q.wikipedia_title || '',
      wikipedia_url: q.wikipedia_url || '',
      photo_method: q.photo_method || '',
      statut: q.statut || 'actif',
      feedback_correct: q.feedback_correct || '',
      feedback_a: q.feedback_a || '',
      feedback_b: q.feedback_b || '',
      feedback_c: q.feedback_c || '',
      feedback_d: q.feedback_d || '',
      feedback_e: q.feedback_e || '',
    })),
  };
}

module.exports = {
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
  CATEGORIES_SHEET,
  QUESTIONS_SHEET,
  CATEGORY_TEMPLATE_HEADERS,
  QUESTION_TEMPLATE_HEADERS,
  QUESTION_FIELD_KEYS,
  buildCategoryPayload,
  buildQuestionPayload,
  validateQuestionPayload,
  validateCategoryPayload,
  parseQcmWorkbook,
  buildQuestionUpsertParams,
  resolveImportRows,
  applyQcmImport,
  formatQuestionCode,
  parseQuestionIdFromCode,
  combineKeywords,
  buildQcmTemplateWorkbook,
  buildQcmExportWorkbook,
  loadQcmExportRows,
};
