'use strict';

/**
 * Import/export XLSX du quiz ForetMap. Même squelette que les imports QCM GL :
 * le moteur générique (parse, mapping des entêtes, boucle de validation, upserts,
 * rapport) vit dans `lib/shared/xlsxImportCore.js`. Ce module conserve le SCHÉMA
 * propre au dataset : `theme` (sciences|jardinage) sur les catégories, `niveau`
 * borné (college|lycee, repli college), photos réduites à 4 colonnes, validation
 * « choix A–C requis », messages français exacts et synchro glossaire ForetMap
 * (table `resource_question_links`, sans `question_dataset`).
 */

const { buildWorkbookBuffer } = require('./spreadsheet');
const {
  buildGlossaryLookupMap,
  matchGlossaryTermsForSpecies,
  asTrimmedString,
} = require('./glGlossaryMatch');
const { CHOICE_LETTERS } = require('./glQcmChoices');
const { normalizeOptionalString } = require('./shared/httpHelpers');
const {
  readSheetRows,
  mapRow,
  normalizeHttpsUrl,
  createQuestionCodeHelpers,
  parseImportWorkbook,
  decodeImportFileBase64,
  buildImportReportBase,
  assertMaxImportRows,
  collectValidRows,
  buildParamsFromFieldKeys,
  loadExistingQuestionCodes,
  countDryRunUpserts,
  executeQuestionUpserts,
  executeCatalogUpserts,
  rowToExportArrayByHeaders,
} = require('./shared/xlsxImportCore');

const MAX_IMPORT_ROWS = 800;
const CATEGORIES_SHEET = 'categories';
const QUESTIONS_SHEET = 'questions';
const VALID_THEMES = new Set(['sciences', 'jardinage']);
const VALID_NIVEAUX = new Set(['college', 'lycee']);

const CATEGORY_TEMPLATE_HEADERS = [
  'categorie_slug',
  'categorie_nom',
  'emoji',
  'theme',
  'description',
  'ordre',
];

const CATEGORY_TEMPLATE_SAMPLE_ROW = [
  'vivant_classification',
  'Le vivant et sa classification',
  '🔬',
  'sciences',
  'Reconnaître et classer les êtres vivants du jardin.',
  '1',
];

const QUESTION_TEMPLATE_HEADERS = [
  'id',
  'question_code',
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
  'photo_url',
  'photo_credit',
  'photo_licence',
  'photo_legende',
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
  '',
  'vivant_classification',
  '1',
  'Combien de pattes possède un insecte adulte ?',
  'Six',
  'Huit',
  'Quatre',
  'Dix',
  '',
  'A',
  'Six',
  'college',
  '1',
  '★ Facile',
  '',
  'insecte, classification',
  '',
  '',
  '',
  '',
  'actif',
  'Exact !',
  '',
  '',
  '',
  '',
  '',
];

const QUESTION_FIELD_KEYS = [
  'question_code',
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
  'photo_url',
  'photo_credit',
  'photo_licence',
  'photo_legende',
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
  ['theme', 'theme'],
  ['description', 'description'],
  ['ordre', 'order_index'],
  ['order_index', 'order_index'],
]);

const QUESTION_HEADER_ALIASES = new Map([
  ['id', 'id'],
  ['question_code', 'question_code'],
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
  ['photo_url', 'photo_url'],
  ['photo_credit', 'photo_credit'],
  ['photo_licence', 'photo_licence'],
  ['photo_legende', 'photo_legende'],
  ['statut', 'statut'],
  ['feedback_correct', 'feedback_correct'],
  ['feedback_a', 'feedback_a'],
  ['feedback_b', 'feedback_b'],
  ['feedback_c', 'feedback_c'],
  ['feedback_d', 'feedback_d'],
  ['feedback_e', 'feedback_e'],
]);

const { formatQuestionCode, parseQuestionIdFromCode } = createQuestionCodeHelpers('QF');

function buildCategoryPayload(row = {}) {
  const mapped = mapRow(row, CATEGORY_HEADER_ALIASES);
  return {
    slug: asTrimmedString(mapped.slug).toLowerCase(),
    nom: asTrimmedString(mapped.nom),
    emoji: normalizeOptionalString(mapped.emoji),
    theme: asTrimmedString(mapped.theme).toLowerCase(),
    description: normalizeOptionalString(mapped.description),
    order_index: Number(mapped.order_index) || 0,
  };
}

function validateCategoryPayload(payload, rowNumber) {
  const errors = [];
  if (!payload.slug) errors.push({ row: rowNumber, field: 'categorie_slug', error: 'slug requis' });
  if (!payload.nom) errors.push({ row: rowNumber, field: 'categorie_nom', error: 'nom requis' });
  if (!payload.theme || !VALID_THEMES.has(payload.theme)) {
    errors.push({
      row: rowNumber,
      field: 'theme',
      error: 'theme requis (sciences ou jardinage)',
    });
  }
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
  const difficulte = difficulteRaw === '' || difficulteRaw == null ? null : Number(difficulteRaw);
  const niveauRaw = asTrimmedString(mapped.niveau).toLowerCase();

  return {
    question_code: questionCode,
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
    niveau: VALID_NIVEAUX.has(niveauRaw) ? niveauRaw : 'college',
    difficulte: Number.isFinite(difficulte) ? difficulte : null,
    difficulte_label: normalizeOptionalString(mapped.difficulte_label),
    notes_pedagogiques: normalizeOptionalString(mapped.notes_pedagogiques),
    tags: normalizeOptionalString(mapped.tags),
    photo_url: normalizeOptionalString(normalizeHttpsUrl(mapped.photo_url)),
    photo_credit: normalizeOptionalString(mapped.photo_credit),
    photo_licence: normalizeOptionalString(mapped.photo_licence),
    photo_legende: normalizeOptionalString(mapped.photo_legende),
    statut: normalizeOptionalString(mapped.statut) || 'actif',
    feedback_correct: normalizeOptionalString(mapped.feedback_correct),
    feedback_a: normalizeOptionalString(mapped.feedback_a),
    feedback_b: normalizeOptionalString(mapped.feedback_b),
    feedback_c: normalizeOptionalString(mapped.feedback_c),
    feedback_d: normalizeOptionalString(mapped.feedback_d),
    feedback_e: normalizeOptionalString(mapped.feedback_e),
  };
}

function validateQuestionPayload(payload, rowNumber, knownCategories) {
  const errors = [];
  if (!payload.question_code) {
    errors.push({
      row: rowNumber,
      field: 'id',
      error: 'Code question requis (id ou question_code)',
    });
  }
  if (!payload.categorie_slug) {
    errors.push({ row: rowNumber, field: 'categorie_slug', error: 'categorie_slug requis' });
  } else if (!knownCategories.has(payload.categorie_slug)) {
    errors.push({
      row: rowNumber,
      field: 'categorie_slug',
      error: `categorie_slug inconnu: ${payload.categorie_slug}`,
    });
  }
  if (!payload.numero_dans_categorie) {
    errors.push({
      row: rowNumber,
      field: 'numero_dans_categorie',
      error: 'numero_dans_categorie requis',
    });
  }
  if (!payload.question) {
    errors.push({ row: rowNumber, field: 'question', error: 'question requise' });
  }
  for (const letter of ['A', 'B', 'C']) {
    const key = `choix_${letter.toLowerCase()}`;
    if (!payload[key]) {
      errors.push({ row: rowNumber, field: key, error: `${key} requis` });
    }
  }
  if (!payload.reponse_correcte) {
    errors.push({
      row: rowNumber,
      field: 'reponse_correcte',
      error: 'reponse_correcte invalide (A-E)',
    });
  } else {
    const choiceKey = `choix_${payload.reponse_correcte.toLowerCase()}`;
    if (!payload[choiceKey]) {
      errors.push({
        row: rowNumber,
        field: 'reponse_correcte',
        error: `choix ${payload.reponse_correcte} manquant pour la bonne réponse`,
      });
    }
  }
  return errors;
}

async function parseFmQuizWorkbook(buffer, options = {}) {
  const wb = await parseImportWorkbook(buffer, options);
  return {
    categoryRows: readSheetRows(wb, CATEGORIES_SHEET),
    questionRows: readSheetRows(wb, QUESTIONS_SHEET),
  };
}

const CATEGORY_UPSERT_SQL = `
  INSERT INTO quiz_categories (slug, nom, emoji, theme, description, order_index, created_at)
  VALUES (?, ?, ?, ?, ?, ?, NOW())
  ON DUPLICATE KEY UPDATE
    nom = VALUES(nom),
    emoji = VALUES(emoji),
    theme = VALUES(theme),
    description = VALUES(description),
    order_index = VALUES(order_index)
`;

const QUESTION_UPSERT_SQL = `
  INSERT INTO quiz_questions (
    question_code, categorie_slug, numero_dans_categorie, question,
    choix_a, choix_b, choix_c, choix_d, choix_e,
    reponse_correcte, reponse_texte, niveau, difficulte, difficulte_label,
    notes_pedagogiques, tags,
    photo_url, photo_credit, photo_licence, photo_legende, statut,
    feedback_correct, feedback_a, feedback_b, feedback_c, feedback_d, feedback_e,
    created_at, updated_at
  ) VALUES (
    ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?,
    NOW(), NOW()
  )
  ON DUPLICATE KEY UPDATE
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
    photo_url = VALUES(photo_url),
    photo_credit = VALUES(photo_credit),
    photo_licence = VALUES(photo_licence),
    photo_legende = VALUES(photo_legende),
    statut = VALUES(statut),
    feedback_correct = COALESCE(NULLIF(VALUES(feedback_correct), ''), feedback_correct),
    feedback_a = COALESCE(NULLIF(VALUES(feedback_a), ''), feedback_a),
    feedback_b = COALESCE(NULLIF(VALUES(feedback_b), ''), feedback_b),
    feedback_c = COALESCE(NULLIF(VALUES(feedback_c), ''), feedback_c),
    feedback_d = COALESCE(NULLIF(VALUES(feedback_d), ''), feedback_d),
    feedback_e = COALESCE(NULLIF(VALUES(feedback_e), ''), feedback_e),
    updated_at = NOW()
`;

// Variante « fiche éditeur » (PUT/POST formulaire admin) : un feedback vidé est persisté (NULL),
// contrairement à l'upsert d'import qui préserve l'existant sur valeur vide (import XLSX partiel).
const { toFormFeedbackUpsertSql } = require('./shared/feedbackUpsertSql');
const QUESTION_UPSERT_SQL_FORM = toFormFeedbackUpsertSql(QUESTION_UPSERT_SQL);

const EXISTING_CODES_SQL = 'SELECT question_code FROM quiz_questions';

function buildQuestionUpsertParams(payload) {
  return buildParamsFromFieldKeys(payload, QUESTION_FIELD_KEYS);
}

async function resolveImportRows(body = {}) {
  return parseFmQuizWorkbook(decodeImportFileBase64(body));
}

function combineKeywords(payload) {
  return payload.tags || '';
}

async function syncGlossaryLinks(validRows, deps, dryRun) {
  const { queryAll, execute } = deps;
  const glossaryRows = await queryAll(
    `SELECT glossary_code, terme, variantes, categorie, definition_courte
       FROM glossary_terms WHERE statut = 'actif'`,
  );
  const glossaryByKey = buildGlossaryLookupMap(glossaryRows);
  let count = 0;

  // Source de vérité unifiée : resource_question_links (cf. migration 144). DELETE global scopé
  // à origin='import' (PAS status) : préserve les liens produits par les scripts d'enrichissement
  // (origin='generated'/'auto'). resource_type='glossary' obligatoire (modèle polymorphe).
  if (!dryRun) {
    await execute(
      `DELETE FROM resource_question_links
        WHERE resource_type = 'glossary' AND origin = 'import'`,
    );
  }

  for (const { payload } of validRows) {
    const matched = matchGlossaryTermsForSpecies(combineKeywords(payload), glossaryByKey);
    count += matched.length;
    if (!dryRun) {
      for (const term of matched) {
        await execute(
          `INSERT IGNORE INTO resource_question_links
            (resource_type, resource_ref, question_code, status, origin, is_gating)
           VALUES ('glossary', ?, ?, 'approved', 'import', 1)`,
          [term.glossary_code, payload.question_code],
        );
      }
    }
  }
  return count;
}

async function applyFmQuizImport(deps, categoryRows, questionRows, options = {}) {
  const dryRun = !!options.dryRun;
  const report = buildImportReportBase(dryRun, questionRows.length, {
    categories_synced: 0,
    glossary_links_synced: 0,
  });

  assertMaxImportRows(questionRows.length, MAX_IMPORT_ROWS);

  const validCategories = collectValidRows(
    categoryRows,
    buildCategoryPayload,
    validateCategoryPayload,
    report,
  ).map(({ payload }) => payload);

  const knownCategories = new Set(validCategories.map((c) => c.slug));

  const validRows = collectValidRows(
    questionRows,
    buildQuestionPayload,
    (payload, rowNumber) => validateQuestionPayload(payload, rowNumber, knownCategories),
    report,
    { countInvalid: true },
  );

  report.totals.valid = validRows.length;
  report.preview = validRows.slice(0, 5).map(({ payload }) => ({
    question_code: payload.question_code,
    categorie_slug: payload.categorie_slug,
    question: payload.question.slice(0, 80),
  }));

  if (dryRun) {
    const existingCodes = await loadExistingQuestionCodes(deps, EXISTING_CODES_SQL);
    countDryRunUpserts(validRows, existingCodes, report.totals);
    report.totals.categories_synced = validCategories.length;
    report.totals.glossary_links_synced = await syncGlossaryLinks(validRows, deps, true);
    return report;
  }

  report.totals.categories_synced = await executeCatalogUpserts(
    deps,
    validCategories,
    CATEGORY_UPSERT_SQL,
    (payload) => [
      payload.slug,
      payload.nom,
      payload.emoji,
      payload.theme,
      payload.description,
      payload.order_index,
    ],
  );

  const existingCodes = await loadExistingQuestionCodes(deps, EXISTING_CODES_SQL);
  await executeQuestionUpserts(deps, validRows, {
    sql: QUESTION_UPSERT_SQL,
    buildParams: buildQuestionUpsertParams,
    existingCodes,
    totals: report.totals,
  });

  report.totals.glossary_links_synced = await syncGlossaryLinks(validRows, deps, false);
  return report;
}

async function buildFmQuizTemplateWorkbook() {
  return buildWorkbookBuffer([
    { name: CATEGORIES_SHEET, aoa: [CATEGORY_TEMPLATE_HEADERS, CATEGORY_TEMPLATE_SAMPLE_ROW] },
    { name: QUESTIONS_SHEET, aoa: [QUESTION_TEMPLATE_HEADERS, QUESTION_TEMPLATE_SAMPLE_ROW] },
  ]);
}

async function buildFmQuizExportWorkbook({ categories, questions }) {
  const catData = [
    CATEGORY_TEMPLATE_HEADERS,
    ...categories.map((row) => rowToExportArrayByHeaders(row, CATEGORY_TEMPLATE_HEADERS)),
  ];
  const qData = [
    QUESTION_TEMPLATE_HEADERS,
    ...questions.map((row) => rowToExportArrayByHeaders(row, QUESTION_TEMPLATE_HEADERS)),
  ];
  return buildWorkbookBuffer([
    { name: CATEGORIES_SHEET, aoa: catData },
    { name: QUESTIONS_SHEET, aoa: qData },
  ]);
}

async function loadFmQuizExportRows(deps, options = {}) {
  const { queryAll } = deps;
  const statut = options.statut === 'all' ? null : options.statut || 'actif';
  const theme = asTrimmedString(options.theme).toLowerCase() || null;
  const categorieSlug = asTrimmedString(options.categorieSlug).toLowerCase() || null;

  let categorySql = `SELECT slug, nom, emoji, theme, description, order_index FROM quiz_categories WHERE 1=1`;
  const categoryParams = [];
  if (theme) {
    categorySql += ' AND theme = ?';
    categoryParams.push(theme);
  }
  if (categorieSlug) {
    categorySql += ' AND slug = ?';
    categoryParams.push(categorieSlug);
  }
  categorySql += ' ORDER BY order_index ASC, slug ASC';

  const categories = await queryAll(categorySql, categoryParams);

  const params = [];
  let where = '1=1';
  if (statut) {
    where += ' AND q.statut = ?';
    params.push(statut);
  }
  if (categorieSlug) {
    where += ' AND q.categorie_slug = ?';
    params.push(categorieSlug);
  }
  if (theme) {
    where += ' AND c.theme = ?';
    params.push(theme);
  }

  const questions = await queryAll(
    `SELECT q.question_code, q.categorie_slug, q.numero_dans_categorie, q.question,
            q.choix_a, q.choix_b, q.choix_c, q.choix_d, q.choix_e,
            q.reponse_correcte, q.reponse_texte, q.niveau, q.difficulte, q.difficulte_label,
            q.notes_pedagogiques, q.tags,
            q.photo_url, q.photo_credit, q.photo_licence, q.photo_legende, q.statut,
            q.feedback_correct, q.feedback_a, q.feedback_b, q.feedback_c, q.feedback_d, q.feedback_e,
            c.theme
       FROM quiz_questions q
       JOIN quiz_categories c ON c.slug = q.categorie_slug
      WHERE ${where}
      ORDER BY c.theme ASC, q.categorie_slug ASC, q.numero_dans_categorie ASC`,
    params,
  );

  const hasQuestionFilter = !!(theme || categorieSlug);
  const categorySlugsInExport = [
    ...new Set(questions.map((q) => String(q.categorie_slug)).filter(Boolean)),
  ];
  let filteredCategories = categories;
  if (hasQuestionFilter && categorySlugsInExport.length > 0) {
    const placeholders = categorySlugsInExport.map(() => '?').join(',');
    filteredCategories = await queryAll(
      `SELECT slug, nom, emoji, theme, description, order_index
         FROM quiz_categories
        WHERE slug IN (${placeholders})
        ORDER BY order_index ASC, slug ASC`,
      categorySlugsInExport,
    );
  }

  return {
    categories: filteredCategories.map((c) => ({
      categorie_slug: c.slug,
      categorie_nom: c.nom,
      emoji: c.emoji || '',
      theme: c.theme || '',
      description: c.description || '',
      ordre: c.order_index ?? 0,
    })),
    questions: questions.map((q) => ({
      id: parseQuestionIdFromCode(q.question_code),
      question_code: q.question_code,
      categorie_slug: q.categorie_slug,
      numero_dans_categorie: q.numero_dans_categorie,
      question: q.question,
      choix_a: q.choix_a,
      choix_b: q.choix_b,
      choix_c: q.choix_c,
      choix_d: q.choix_d || '',
      choix_e: q.choix_e || '',
      reponse_correcte: q.reponse_correcte,
      reponse_texte: q.reponse_texte || '',
      niveau: q.niveau || '',
      difficulte: q.difficulte ?? '',
      difficulte_label: q.difficulte_label || '',
      notes_pedagogiques: q.notes_pedagogiques || '',
      tags: q.tags || '',
      photo_url: q.photo_url || '',
      photo_credit: q.photo_credit || '',
      photo_licence: q.photo_licence || '',
      photo_legende: q.photo_legende || '',
      statut: q.statut || '',
      feedback_correct: q.feedback_correct || '',
      feedback_a: q.feedback_a || '',
      feedback_b: q.feedback_b || '',
      feedback_c: q.feedback_c || '',
      feedback_d: q.feedback_d || '',
      feedback_e: q.feedback_e || '',
      theme: q.theme || '',
    })),
  };
}

module.exports = {
  MAX_IMPORT_ROWS,
  QUESTION_UPSERT_SQL,
  QUESTION_UPSERT_SQL_FORM,
  buildQuestionUpsertParams,
  resolveImportRows,
  applyFmQuizImport,
  buildFmQuizTemplateWorkbook,
  buildFmQuizExportWorkbook,
  loadFmQuizExportRows,
  buildCategoryPayload,
  buildQuestionPayload,
  validateCategoryPayload,
  validateQuestionPayload,
  parseFmQuizWorkbook,
  combineKeywords,
};
