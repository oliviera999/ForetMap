'use strict';

/**
 * Import/export XLSX des QCM lore GL. Le moteur générique (parse, mapping des
 * entêtes, boucle de validation, upserts, rapport) vit dans
 * `lib/shared/xlsxImportCore.js` ; ce module conserve le SCHÉMA propre au dataset :
 * feuille supplémentaire `chapitres` (scopes), colonne `tier_lore` (cle|recit),
 * `source_lore`, validation « ≥ 2 choix non vides + réponse parmi les choix »,
 * messages français exacts et synchro glossaire lore.
 */

const { buildWorkbookBuffer } = require('./spreadsheet');
const { getGlImportMaxFileBytes } = require('./glImportLimits');
const {
  buildLoreGlossaryLookupMap,
  matchLoreGlossaryTermsForText,
  asTrimmedString,
} = require('./glLoreGlossaryMatch');
const { CHOICE_LETTERS } = require('./glQcmChoices');
const { normalizeOptionalString } = require('./shared/httpHelpers');
const {
  readSheetRows,
  mapRow,
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

const MAX_IMPORT_FILE_BYTES = getGlImportMaxFileBytes('default');
const MAX_IMPORT_ROWS = 800;
const CATEGORIES_SHEET = 'categories';
const SCOPES_SHEET = 'chapitres';
const QUESTIONS_SHEET = 'questions';

const LORE_TIER_VALUES = new Set(['cle', 'recit']);

const SCOPE_TEMPLATE_HEADERS = ['chapitre_slug', 'chapitre_nom', 'plateau', 'description'];

const SCOPE_TEMPLATE_SAMPLE_ROW = [
  'tous',
  'Transversal',
  '',
  'Questions valables dans tous les chapitres.',
];

const CATEGORY_TEMPLATE_HEADERS = [
  'categorie_slug',
  'categorie_nom',
  'emoji',
  'description',
  'ordre',
];

const CATEGORY_TEMPLATE_SAMPLE_ROW = [
  'cosmologie',
  'La Trame & le monde-miroir',
  '🌌',
  "Le tissage du vivant, le miroir, le rôle de l'observateur.",
  '1',
];

const QUESTION_TEMPLATE_HEADERS = [
  'id',
  'chapitre_slug',
  'categorie_slug',
  'numero_dans_categorie',
  'tier_lore',
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
  'source_lore',
  'tags',
  'mots_cles',
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
  'tous',
  'cosmologie',
  '1',
  'cle',
  'Comment appelle-t-on le tissage vivant du monde ?',
  'La Trame',
  'La Grise',
  'Le Souffle',
  'Le miroir',
  '',
  'A',
  'La Trame',
  '6ème',
  '1',
  '⭐ Facile',
  '',
  'Codex, Livre I',
  'Trame, cosmologie',
  'trame, cosmologie',
  'actif',
  "Exactement ! La Trame, c'est le tissu du vivant.",
  '✅ Oui : la Trame.',
  '❌ La Grise est un visage du Souffle.',
  '❌ Le Souffle défait le tissu.',
  '❌ Le miroir est un passage, pas le monde.',
  '',
];

const QUESTION_FIELD_KEYS = [
  'question_code',
  'chapitre_slug',
  'categorie_slug',
  'numero_dans_categorie',
  'tier_lore',
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
  'source_lore',
  'tags',
  'mots_cles',
  'statut',
  'feedback_correct',
  'feedback_a',
  'feedback_b',
  'feedback_c',
  'feedback_d',
  'feedback_e',
];

const SCOPE_HEADER_ALIASES = new Map([
  ['chapitre_slug', 'slug'],
  ['slug', 'slug'],
  ['chapitre_nom', 'nom'],
  ['nom', 'nom'],
  ['plateau', 'plateau'],
  ['description', 'description'],
  ['ordre', 'order_index'],
  ['order_index', 'order_index'],
]);

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
  ['chapitre_slug', 'chapitre_slug'],
  ['categorie_slug', 'categorie_slug'],
  ['numero_dans_categorie', 'numero_dans_categorie'],
  ['tier_lore', 'tier_lore'],
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
  ['source_lore', 'source_lore'],
  ['tags', 'tags'],
  ['mots_cles', 'mots_cles'],
  ['statut', 'statut'],
  ['feedback_correct', 'feedback_correct'],
  ['feedback_a', 'feedback_a'],
  ['feedback_b', 'feedback_b'],
  ['feedback_c', 'feedback_c'],
  ['feedback_d', 'feedback_d'],
  ['feedback_e', 'feedback_e'],
]);

const {
  formatQuestionCode: formatLoreQuestionCode,
  parseQuestionIdFromCode: parseLoreQuestionIdFromCode,
} = createQuestionCodeHelpers('LQCM');

function buildScopePayload(row = {}) {
  const mapped = mapRow(row, SCOPE_HEADER_ALIASES);
  const plateauRaw = mapped.plateau;
  const plateau = plateauRaw === '' || plateauRaw == null ? null : Number(plateauRaw);
  return {
    slug: asTrimmedString(mapped.slug).toLowerCase(),
    nom: asTrimmedString(mapped.nom),
    plateau: Number.isFinite(plateau) ? Math.floor(plateau) : null,
    description: normalizeOptionalString(mapped.description),
    order_index: Number(mapped.order_index) || 0,
  };
}

function validateScopePayload(payload, rowNumber) {
  const errors = [];
  if (!payload.slug) errors.push({ row: rowNumber, field: 'chapitre_slug', error: 'slug requis' });
  if (!payload.nom) errors.push({ row: rowNumber, field: 'chapitre_nom', error: 'nom requis' });
  return errors;
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
    : formatLoreQuestionCode(rawId);
  const reponse = asTrimmedString(mapped.reponse_correcte).toUpperCase();
  const difficulteRaw = mapped.difficulte;
  const difficulte = difficulteRaw === '' || difficulteRaw == null ? null : Number(difficulteRaw);
  const tierRaw = asTrimmedString(mapped.tier_lore).toLowerCase();
  const tierLore = LORE_TIER_VALUES.has(tierRaw) ? tierRaw : 'recit';

  return {
    question_code: questionCode,
    chapitre_slug: asTrimmedString(mapped.chapitre_slug).toLowerCase(),
    categorie_slug: asTrimmedString(mapped.categorie_slug).toLowerCase(),
    numero_dans_categorie: Number(mapped.numero_dans_categorie) || 0,
    tier_lore: tierLore,
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
    source_lore: normalizeOptionalString(mapped.source_lore),
    tags: normalizeOptionalString(mapped.tags),
    mots_cles: normalizeOptionalString(mapped.mots_cles),
    statut: normalizeOptionalString(mapped.statut) || 'actif',
    feedback_correct: normalizeOptionalString(mapped.feedback_correct),
    feedback_a: normalizeOptionalString(mapped.feedback_a),
    feedback_b: normalizeOptionalString(mapped.feedback_b),
    feedback_c: normalizeOptionalString(mapped.feedback_c),
    feedback_d: normalizeOptionalString(mapped.feedback_d),
    feedback_e: normalizeOptionalString(mapped.feedback_e),
  };
}

function countNonEmptyChoices(payload) {
  return CHOICE_LETTERS.filter((letter) => {
    const key = `choix_${letter.toLowerCase()}`;
    return asTrimmedString(payload[key]).length > 0;
  }).length;
}

function validateQuestionPayload(payload, rowNumber, knownScopes, knownCategories) {
  const errors = [];
  if (!payload.question_code) {
    errors.push({ row: rowNumber, field: 'id', error: 'Code question requis (id)' });
  }
  if (!payload.chapitre_slug) {
    errors.push({ row: rowNumber, field: 'chapitre_slug', error: 'chapitre_slug requis' });
  } else if (!knownScopes.has(payload.chapitre_slug)) {
    errors.push({
      row: rowNumber,
      field: 'chapitre_slug',
      error: `chapitre_slug inconnu: ${payload.chapitre_slug}`,
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
  if (countNonEmptyChoices(payload) < 2) {
    errors.push({ row: rowNumber, field: 'choix_a', error: 'Au moins 2 choix non vides requis' });
  }
  if (!payload.reponse_correcte) {
    errors.push({
      row: rowNumber,
      field: 'reponse_correcte',
      error: 'reponse_correcte invalide (A-E)',
    });
  } else {
    const answerKey = `choix_${payload.reponse_correcte.toLowerCase()}`;
    if (!asTrimmedString(payload[answerKey])) {
      errors.push({
        row: rowNumber,
        field: 'reponse_correcte',
        error: 'reponse_correcte absente des choix non vides',
      });
    }
  }
  if (!LORE_TIER_VALUES.has(payload.tier_lore)) {
    errors.push({ row: rowNumber, field: 'tier_lore', error: 'tier_lore invalide (cle ou recit)' });
  }
  return errors;
}

async function parseQcmLoreWorkbook(buffer, options = {}) {
  const wb = await parseImportWorkbook(buffer, options);
  return {
    scopeRows: readSheetRows(wb, SCOPES_SHEET),
    categoryRows: readSheetRows(wb, CATEGORIES_SHEET),
    questionRows: readSheetRows(wb, QUESTIONS_SHEET),
  };
}

const SCOPE_UPSERT_SQL = `
  INSERT INTO gl_qcm_lore_scopes (slug, nom, plateau, description, order_index, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, NOW(), NOW())
  ON DUPLICATE KEY UPDATE
    nom = VALUES(nom),
    plateau = VALUES(plateau),
    description = VALUES(description),
    order_index = VALUES(order_index),
    updated_at = NOW()
`;

const CATEGORY_UPSERT_SQL = `
  INSERT INTO gl_qcm_lore_categories (slug, nom, emoji, description, order_index, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, NOW(), NOW())
  ON DUPLICATE KEY UPDATE
    nom = VALUES(nom),
    emoji = VALUES(emoji),
    description = VALUES(description),
    order_index = VALUES(order_index),
    updated_at = NOW()
`;

const QUESTION_UPSERT_SQL = `
  INSERT INTO gl_qcm_lore_questions (
    question_code, chapitre_slug, categorie_slug, numero_dans_categorie, tier_lore, question,
    choix_a, choix_b, choix_c, choix_d, choix_e,
    reponse_correcte, reponse_texte, niveau, difficulte, difficulte_label,
    notes_pedagogiques, source_lore, tags, mots_cles, statut,
    feedback_correct, feedback_a, feedback_b, feedback_c, feedback_d, feedback_e,
    created_at, updated_at
  ) VALUES (
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?,
    NOW(), NOW()
  )
  ON DUPLICATE KEY UPDATE
    chapitre_slug = VALUES(chapitre_slug),
    categorie_slug = VALUES(categorie_slug),
    numero_dans_categorie = VALUES(numero_dans_categorie),
    tier_lore = VALUES(tier_lore),
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
    source_lore = VALUES(source_lore),
    tags = VALUES(tags),
    mots_cles = VALUES(mots_cles),
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

const EXISTING_CODES_SQL = 'SELECT question_code FROM gl_qcm_lore_questions';

function buildQuestionUpsertParams(payload) {
  return buildParamsFromFieldKeys(payload, QUESTION_FIELD_KEYS);
}

async function resolveImportRows(body = {}) {
  return parseQcmLoreWorkbook(decodeImportFileBase64(body));
}

function combineKeywords(payload) {
  return [payload.tags, payload.mots_cles].filter(Boolean).join(', ');
}

async function syncGlossaryLinks(validRows, deps, dryRun) {
  const { queryAll, execute } = deps;
  const glossaryRows = await queryAll(
    `SELECT lore_code, terme, variantes, categorie, definition_courte, niveau
       FROM gl_lore_glossary_terms WHERE statut = 'actif'`,
  );
  const glossaryByKey = buildLoreGlossaryLookupMap(glossaryRows);
  let count = 0;

  if (!dryRun) {
    // DELETE scopé à origin='import' (matcher-owned) : ne touche QUE les liens lore_glossary
    // régénérables par le matcher ; préserve manual/point4/auto/generated approuvés ET suggested
    // (ainsi que species/feuillet/glossary). Source de vérité unifiée : gl_resource_question_links (cf. migration 145).
    await execute(
      `DELETE FROM gl_resource_question_links
        WHERE question_dataset = 'qcm_lore' AND resource_type = 'lore_glossary' AND origin = 'import'`,
    );
  }

  for (const { payload } of validRows) {
    const matched = matchLoreGlossaryTermsForText(combineKeywords(payload), glossaryByKey);
    count += matched.length;
    if (!dryRun) {
      for (const term of matched) {
        await execute(
          `INSERT IGNORE INTO gl_resource_question_links
            (question_dataset, question_code, resource_type, resource_ref, status, origin, is_gating)
           VALUES ('qcm_lore', ?, 'lore_glossary', ?, 'approved', 'import', 1)`,
          [payload.question_code, term.lore_code],
        );
      }
    }
  }
  return count;
}

async function applyQcmLoreImport(deps, scopeRows, categoryRows, questionRows, options = {}) {
  const dryRun = !!options.dryRun;
  const report = buildImportReportBase(dryRun, questionRows.length, {
    scopes_synced: 0,
    categories_synced: 0,
    glossary_links_synced: 0,
  });

  assertMaxImportRows(questionRows.length, MAX_IMPORT_ROWS);

  const validScopes = collectValidRows(
    scopeRows,
    buildScopePayload,
    validateScopePayload,
    report,
  ).map(({ payload }) => payload);

  const validCategories = collectValidRows(
    categoryRows,
    buildCategoryPayload,
    validateCategoryPayload,
    report,
  ).map(({ payload }) => payload);

  const knownScopes = new Set(validScopes.map((s) => s.slug));
  const knownCategories = new Set(validCategories.map((c) => c.slug));

  const validRows = collectValidRows(
    questionRows,
    buildQuestionPayload,
    (payload, rowNumber) =>
      validateQuestionPayload(payload, rowNumber, knownScopes, knownCategories),
    report,
    { countInvalid: true },
  );

  report.totals.valid = validRows.length;
  report.preview = validRows.slice(0, 5).map(({ payload }) => ({
    question_code: payload.question_code,
    chapitre_slug: payload.chapitre_slug,
    categorie_slug: payload.categorie_slug,
    tier_lore: payload.tier_lore,
    question: payload.question.slice(0, 80),
  }));

  if (dryRun) {
    const existingCodes = await loadExistingQuestionCodes(deps, EXISTING_CODES_SQL);
    countDryRunUpserts(validRows, existingCodes, report.totals);
    report.totals.scopes_synced = validScopes.length;
    report.totals.categories_synced = validCategories.length;
    report.totals.glossary_links_synced = await syncGlossaryLinks(validRows, deps, true);
    return report;
  }

  report.totals.scopes_synced = await executeCatalogUpserts(
    deps,
    validScopes,
    SCOPE_UPSERT_SQL,
    (payload) => [
      payload.slug,
      payload.nom,
      payload.plateau,
      payload.description,
      payload.order_index,
    ],
  );

  report.totals.categories_synced = await executeCatalogUpserts(
    deps,
    validCategories,
    CATEGORY_UPSERT_SQL,
    (payload) => [
      payload.slug,
      payload.nom,
      payload.emoji,
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

async function buildQcmLoreTemplateWorkbook() {
  return buildWorkbookBuffer([
    { name: SCOPES_SHEET, aoa: [SCOPE_TEMPLATE_HEADERS, SCOPE_TEMPLATE_SAMPLE_ROW] },
    { name: CATEGORIES_SHEET, aoa: [CATEGORY_TEMPLATE_HEADERS, CATEGORY_TEMPLATE_SAMPLE_ROW] },
    { name: QUESTIONS_SHEET, aoa: [QUESTION_TEMPLATE_HEADERS, QUESTION_TEMPLATE_SAMPLE_ROW] },
  ]);
}

async function buildQcmLoreExportWorkbook({ scopes, categories, questions }) {
  const scopeData = [
    SCOPE_TEMPLATE_HEADERS,
    ...scopes.map((row) => rowToExportArrayByHeaders(row, SCOPE_TEMPLATE_HEADERS)),
  ];
  const catData = [
    CATEGORY_TEMPLATE_HEADERS,
    ...categories.map((row) => rowToExportArrayByHeaders(row, CATEGORY_TEMPLATE_HEADERS)),
  ];
  const qData = [
    QUESTION_TEMPLATE_HEADERS,
    ...questions.map((row) => rowToExportArrayByHeaders(row, QUESTION_TEMPLATE_HEADERS)),
  ];
  return buildWorkbookBuffer([
    { name: SCOPES_SHEET, aoa: scopeData },
    { name: CATEGORIES_SHEET, aoa: catData },
    { name: QUESTIONS_SHEET, aoa: qData },
  ]);
}

async function loadQcmLoreExportRows(deps, options = {}) {
  const { queryAll } = deps;
  const statut = options.statut === 'all' ? null : options.statut || 'actif';
  const chapitreSlug = asTrimmedString(options.chapitreSlug).toLowerCase() || null;
  const categorieSlug = asTrimmedString(options.categorieSlug).toLowerCase() || null;

  const scopes = await queryAll(
    `SELECT slug, nom, plateau, description, order_index
       FROM gl_qcm_lore_scopes
      ORDER BY order_index ASC, slug ASC`,
  );

  const categories = await queryAll(
    `SELECT slug, nom, emoji, description, order_index
       FROM gl_qcm_lore_categories
      ORDER BY order_index ASC, slug ASC`,
  );

  const params = [];
  let where = '1=1';
  if (statut) {
    where += ' AND statut = ?';
    params.push(statut);
  }
  if (chapitreSlug) {
    where += ' AND chapitre_slug = ?';
    params.push(chapitreSlug);
  }
  if (categorieSlug) {
    where += ' AND categorie_slug = ?';
    params.push(categorieSlug);
  }

  const questions = await queryAll(
    `SELECT question_code, chapitre_slug, categorie_slug, numero_dans_categorie, tier_lore, question,
            choix_a, choix_b, choix_c, choix_d, choix_e,
            reponse_correcte, reponse_texte, niveau, difficulte, difficulte_label,
            notes_pedagogiques, source_lore, tags, mots_cles, statut,
            feedback_correct, feedback_a, feedback_b, feedback_c, feedback_d, feedback_e
       FROM gl_qcm_lore_questions
      WHERE ${where}
      ORDER BY chapitre_slug ASC, categorie_slug ASC, numero_dans_categorie ASC`,
    params,
  );

  const hasQuestionFilter = !!(chapitreSlug || categorieSlug);
  const categorySlugsInExport = [
    ...new Set(questions.map((q) => String(q.categorie_slug)).filter(Boolean)),
  ];
  let filteredCategories = categories;
  if (hasQuestionFilter && categorySlugsInExport.length > 0) {
    const placeholders = categorySlugsInExport.map(() => '?').join(',');
    filteredCategories = await queryAll(
      `SELECT slug, nom, emoji, description, order_index
         FROM gl_qcm_lore_categories
        WHERE slug IN (${placeholders})
        ORDER BY order_index ASC, slug ASC`,
      categorySlugsInExport,
    );
  }

  const scopeSlugsInExport = [
    ...new Set(questions.map((q) => String(q.chapitre_slug)).filter(Boolean)),
  ];
  let filteredScopes = scopes;
  if (hasQuestionFilter && scopeSlugsInExport.length > 0) {
    const placeholders = scopeSlugsInExport.map(() => '?').join(',');
    filteredScopes = await queryAll(
      `SELECT slug, nom, plateau, description, order_index
         FROM gl_qcm_lore_scopes
        WHERE slug IN (${placeholders})
        ORDER BY order_index ASC, slug ASC`,
      scopeSlugsInExport,
    );
  }

  return {
    scopes: filteredScopes.map((s) => ({
      chapitre_slug: s.slug,
      chapitre_nom: s.nom,
      plateau: s.plateau ?? '',
      description: s.description || '',
    })),
    categories: filteredCategories.map((c) => ({
      categorie_slug: c.slug,
      categorie_nom: c.nom,
      emoji: c.emoji || '',
      description: c.description || '',
      ordre: c.order_index ?? 0,
    })),
    questions: questions.map((q) => ({
      id: parseLoreQuestionIdFromCode(q.question_code),
      chapitre_slug: q.chapitre_slug,
      categorie_slug: q.categorie_slug,
      numero_dans_categorie: q.numero_dans_categorie,
      tier_lore: q.tier_lore,
      question: q.question,
      choix_a: q.choix_a,
      choix_b: q.choix_b,
      choix_c: q.choix_c,
      choix_d: q.choix_d,
      choix_e: q.choix_e || '',
      reponse_correcte: q.reponse_correcte,
      reponse_texte: q.reponse_texte || '',
      niveau: q.niveau || '',
      difficulte: q.difficulte ?? '',
      difficulte_label: q.difficulte_label || '',
      notes_pedagogiques: q.notes_pedagogiques || '',
      source_lore: q.source_lore || '',
      tags: q.tags || '',
      mots_cles: q.mots_cles || '',
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
  SCOPES_SHEET,
  QUESTIONS_SHEET,
  LORE_TIER_VALUES,
  SCOPE_TEMPLATE_HEADERS,
  CATEGORY_TEMPLATE_HEADERS,
  QUESTION_TEMPLATE_HEADERS,
  QUESTION_FIELD_KEYS,
  buildScopePayload,
  buildCategoryPayload,
  buildQuestionPayload,
  validateQuestionPayload,
  validateCategoryPayload,
  validateScopePayload,
  parseQcmLoreWorkbook,
  QUESTION_UPSERT_SQL,
  QUESTION_UPSERT_SQL_FORM,
  buildQuestionUpsertParams,
  resolveImportRows,
  applyQcmLoreImport,
  formatLoreQuestionCode,
  parseLoreQuestionIdFromCode,
  combineKeywords,
  buildQcmLoreTemplateWorkbook,
  buildQcmLoreExportWorkbook,
  loadQcmLoreExportRows,
};
