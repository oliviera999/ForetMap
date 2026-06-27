'use strict';

const {
  buildLoreGlossaryLookupMap,
  matchLoreGlossaryTermsForText,
  asTrimmedString,
} = require('./glLoreGlossaryMatch');
const { CHOICE_LETTERS } = require('./glQcmChoices');
const {
  QUESTION_UPSERT_SQL_FORM,
  buildQuestionUpsertParams,
  validateQuestionPayload,
  combineKeywords,
} = require('./glQcmLoreImport');

const LORE_TIER_VALUES = new Set(['cle', 'recit']);
const VALID_SORTS = new Set(['chapitre', 'code', 'code_desc', 'category', 'difficulte', 'tier']);

const ADMIN_QUESTION_SELECT = `
  SELECT q.question_code, q.chapitre_slug, q.categorie_slug, q.numero_dans_categorie, q.tier_lore,
         q.question,
         q.choix_a, q.choix_b, q.choix_c, q.choix_d, q.choix_e,
         q.reponse_correcte, q.reponse_texte, q.niveau, q.difficulte, q.difficulte_label,
         q.notes_pedagogiques, q.source_lore, q.tags, q.mots_cles, q.statut,
         q.feedback_correct, q.feedback_a, q.feedback_b, q.feedback_c, q.feedback_d, q.feedback_e,
         q.created_at, q.updated_at,
         c.nom AS categorie_nom
    FROM gl_qcm_lore_questions q
    LEFT JOIN gl_qcm_lore_categories c ON c.slug = q.categorie_slug
`;

function normalizeOptionalString(value) {
  const s = asTrimmedString(value);
  return s.length > 0 ? s : null;
}

function normalizeQuestionApiBody(body = {}) {
  const reponse = asTrimmedString(body.reponse_correcte).toUpperCase();
  const difficulteRaw = body.difficulte;
  const difficulte = difficulteRaw === '' || difficulteRaw == null ? null : Number(difficulteRaw);
  const tierRaw = asTrimmedString(body.tier_lore).toLowerCase();

  return {
    question_code: asTrimmedString(body.question_code).toUpperCase(),
    chapitre_slug: asTrimmedString(body.chapitre_slug).toLowerCase(),
    categorie_slug: asTrimmedString(body.categorie_slug).toLowerCase(),
    numero_dans_categorie: Number(body.numero_dans_categorie) || 0,
    tier_lore: LORE_TIER_VALUES.has(tierRaw) ? tierRaw : 'recit',
    question: asTrimmedString(body.question),
    choix_a: asTrimmedString(body.choix_a),
    choix_b: asTrimmedString(body.choix_b),
    choix_c: asTrimmedString(body.choix_c),
    choix_d: asTrimmedString(body.choix_d),
    choix_e: asTrimmedString(body.choix_e),
    reponse_correcte: CHOICE_LETTERS.includes(reponse) ? reponse : null,
    reponse_texte: normalizeOptionalString(body.reponse_texte),
    niveau: normalizeOptionalString(body.niveau),
    difficulte: Number.isFinite(difficulte) ? difficulte : null,
    difficulte_label: normalizeOptionalString(body.difficulte_label),
    notes_pedagogiques: normalizeOptionalString(body.notes_pedagogiques),
    source_lore: normalizeOptionalString(body.source_lore),
    tags: normalizeOptionalString(body.tags),
    mots_cles: normalizeOptionalString(body.mots_cles),
    statut: normalizeOptionalString(body.statut) || 'actif',
    feedback_correct: normalizeOptionalString(body.feedback_correct),
    feedback_a: normalizeOptionalString(body.feedback_a),
    feedback_b: normalizeOptionalString(body.feedback_b),
    feedback_c: normalizeOptionalString(body.feedback_c),
    feedback_d: normalizeOptionalString(body.feedback_d),
    feedback_e: normalizeOptionalString(body.feedback_e),
  };
}

function formatValidationError(errors) {
  const first = errors[0];
  if (!first) return 'Données invalides';
  return first.error || 'Données invalides';
}

async function loadKnownScopeSlugs(deps) {
  const rows = await deps.queryAll('SELECT slug FROM gl_qcm_lore_scopes');
  return new Set(rows.map((row) => String(row.slug)));
}

async function loadKnownCategorySlugs(deps) {
  const rows = await deps.queryAll('SELECT slug FROM gl_qcm_lore_categories');
  return new Set(rows.map((row) => String(row.slug)));
}

async function syncSingleQuestionGlossaryLinks(deps, payload) {
  const { queryAll, execute } = deps;
  const glossaryRows = await queryAll(
    `SELECT lore_code, terme, variantes, categorie, definition_courte, niveau
       FROM gl_lore_glossary_terms WHERE statut = 'actif'`,
  );
  const glossaryByKey = buildLoreGlossaryLookupMap(glossaryRows);
  const matched = matchLoreGlossaryTermsForText(combineKeywords(payload), glossaryByKey);

  // Source de vérité unifiée : gl_resource_question_links (cf. migration 145). Côté lore :
  // question_dataset='qcm_lore', resource_type='lore_glossary'. DELETE scopé à origin='import'
  // (matcher-owned) : ne touche QUE les liens régénérables par le matcher ; préserve
  // manual/point4/auto/generated approuvés ET suggested.
  await execute(
    `DELETE FROM gl_resource_question_links
      WHERE question_dataset = 'qcm_lore' AND resource_type = 'lore_glossary'
        AND origin = 'import' AND question_code = ?`,
    [payload.question_code],
  );
  for (const term of matched) {
    await execute(
      `INSERT IGNORE INTO gl_resource_question_links
        (question_dataset, question_code, resource_type, resource_ref, status, origin, is_gating)
       VALUES ('qcm_lore', ?, 'lore_glossary', ?, 'approved', 'import', 1)`,
      [payload.question_code, term.lore_code],
    );
  }
  return matched.length;
}

async function loadAdminQuestionDetail(deps, code) {
  return deps.queryOne(`${ADMIN_QUESTION_SELECT} WHERE q.question_code = ? LIMIT 1`, [code]);
}

async function allocateNextGlQcmLoreQuestionCode(deps) {
  const row = await deps.queryOne(
    `SELECT question_code FROM gl_qcm_lore_questions
      WHERE question_code REGEXP '^LQCM[0-9]+$'
      ORDER BY CAST(SUBSTRING(question_code, 5) AS UNSIGNED) DESC
      LIMIT 1`,
  );
  const current = row?.question_code ? Number(String(row.question_code).slice(4)) : 0;
  const next = Number.isFinite(current) && current > 0 ? current + 1 : 1;
  return `LQCM${String(next).padStart(4, '0')}`;
}

function buildListOrderClause(sort) {
  switch (sort) {
    case 'code':
      return 'q.question_code ASC';
    case 'code_desc':
      return 'q.question_code DESC';
    case 'category':
      return 'q.categorie_slug ASC, q.numero_dans_categorie ASC';
    case 'difficulte':
      return 'q.difficulte IS NULL, q.difficulte ASC, q.question_code ASC';
    case 'tier':
      return 'q.tier_lore ASC, q.chapitre_slug ASC, q.question_code ASC';
    case 'chapitre':
    default:
      return 'q.chapitre_slug ASC, q.categorie_slug ASC, q.numero_dans_categorie ASC';
  }
}

async function listAdminQuestions(deps, options = {}) {
  const chapitreSlug = normalizeOptionalString(options.chapitreSlug)?.toLowerCase();
  const categorieSlug = normalizeOptionalString(options.categorieSlug)?.toLowerCase();
  const tierLore = normalizeOptionalString(options.tierLore)?.toLowerCase();
  const q = normalizeOptionalString(options.q);
  const statutRaw = normalizeOptionalString(options.statut)?.toLowerCase() || 'actif';
  const sort = VALID_SORTS.has(options.sort) ? options.sort : 'chapitre';

  const params = [];
  let sql = `${ADMIN_QUESTION_SELECT} WHERE 1=1`;

  if (statutRaw !== 'all') {
    sql += ' AND q.statut = ?';
    params.push(statutRaw === 'inactif' ? 'inactif' : 'actif');
  }
  if (chapitreSlug) {
    sql += ' AND q.chapitre_slug = ?';
    params.push(chapitreSlug);
  }
  if (categorieSlug) {
    sql += ' AND q.categorie_slug = ?';
    params.push(categorieSlug);
  }
  if (tierLore && LORE_TIER_VALUES.has(tierLore)) {
    sql += ' AND q.tier_lore = ?';
    params.push(tierLore);
  }

  sql += ` ORDER BY ${buildListOrderClause(sort)}`;

  let rows = await deps.queryAll(sql, params);
  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter((row) => {
      const hay =
        `${row.question_code} ${row.question} ${row.tags || ''} ${row.mots_cles || ''} ${row.categorie_slug}`.toLowerCase();
      return hay.includes(needle);
    });
  }

  return rows.map((row) => ({
    question_code: row.question_code,
    chapitre_slug: row.chapitre_slug,
    categorie_slug: row.categorie_slug,
    categorie_nom: row.categorie_nom,
    numero_dans_categorie: row.numero_dans_categorie,
    tier_lore: row.tier_lore,
    question: row.question,
    niveau: row.niveau,
    difficulte: row.difficulte,
    difficulte_label: row.difficulte_label,
    reponse_correcte: row.reponse_correcte,
    statut: row.statut,
  }));
}

async function upsertGlQcmLoreQuestion(deps, body, options = {}) {
  const payload = normalizeQuestionApiBody(body);
  if (options.question_code) {
    payload.question_code = asTrimmedString(options.question_code).toUpperCase();
  }
  if (!payload.question_code) {
    throw Object.assign(new Error('Code question requis'), { statusCode: 400 });
  }

  const knownScopes = await loadKnownScopeSlugs(deps);
  const knownCategories = await loadKnownCategorySlugs(deps);
  const errors = validateQuestionPayload(payload, 0, knownScopes, knownCategories);
  if (errors.length) {
    throw Object.assign(new Error(formatValidationError(errors)), {
      statusCode: 400,
      details: errors,
    });
  }

  const existing = await deps.queryOne(
    'SELECT question_code FROM gl_qcm_lore_questions WHERE question_code = ? LIMIT 1',
    [payload.question_code],
  );
  if (options.requireExisting && !existing) {
    throw Object.assign(new Error('Question introuvable'), { statusCode: 404 });
  }
  if (options.requireNew && existing) {
    throw Object.assign(new Error('Ce code question existe déjà'), { statusCode: 409 });
  }

  await deps.execute(QUESTION_UPSERT_SQL_FORM, buildQuestionUpsertParams(payload));
  const glossaryLinks = await syncSingleQuestionGlossaryLinks(deps, payload);
  const question = await loadAdminQuestionDetail(deps, payload.question_code);

  return {
    created: !existing,
    question,
    glossaryLinks,
  };
}

module.exports = {
  VALID_SORTS,
  normalizeQuestionApiBody,
  loadAdminQuestionDetail,
  allocateNextGlQcmLoreQuestionCode,
  listAdminQuestions,
  upsertGlQcmLoreQuestion,
};
