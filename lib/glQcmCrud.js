'use strict';

const {
  asTrimmedString,
  buildGlossaryLookupMap,
  matchGlossaryTermsForSpecies,
} = require('./glGlossaryMatch');
const { CHOICE_LETTERS } = require('./glQcmChoices');
const {
  QUESTION_UPSERT_SQL,
  buildQuestionUpsertParams,
  validateQuestionPayload,
  combineKeywords,
} = require('./glQcmImport');

const VALID_SORTS = new Set(['biome', 'code', 'code_desc', 'category', 'difficulte']);

const ADMIN_QUESTION_SELECT = `
  SELECT q.question_code, q.biome_slug, q.categorie_slug, q.numero_dans_categorie, q.question,
         q.choix_a, q.choix_b, q.choix_c, q.choix_d, q.choix_e,
         q.reponse_correcte, q.reponse_texte, q.niveau, q.difficulte, q.difficulte_label,
         q.notes_pedagogiques, q.tags, q.mots_cles,
         q.photo_url, q.photo_url_hd, q.photo_description_url, q.photo_filename, q.photo_credit,
         q.photo_licence, q.photo_licence_url, q.photo_legende, q.photo_sujet,
         q.wikipedia_title, q.wikipedia_url, q.photo_method, q.statut,
         q.feedback_correct, q.feedback_a, q.feedback_b, q.feedback_c, q.feedback_d, q.feedback_e,
         q.created_at, q.updated_at,
         c.nom AS categorie_nom
    FROM gl_qcm_questions q
    LEFT JOIN gl_qcm_categories c ON c.slug = q.categorie_slug
`;

function normalizeOptionalString(value) {
  const s = asTrimmedString(value);
  return s.length > 0 ? s : null;
}

function normalizeQuestionApiBody(body = {}) {
  const reponse = asTrimmedString(body.reponse_correcte).toUpperCase();
  const difficulteRaw = body.difficulte;
  const difficulte = difficulteRaw === '' || difficulteRaw == null ? null : Number(difficulteRaw);

  return {
    question_code: asTrimmedString(body.question_code).toUpperCase(),
    biome_slug: asTrimmedString(body.biome_slug).toLowerCase(),
    categorie_slug: asTrimmedString(body.categorie_slug).toLowerCase(),
    numero_dans_categorie: Number(body.numero_dans_categorie) || 0,
    question: asTrimmedString(body.question),
    choix_a: asTrimmedString(body.choix_a),
    choix_b: asTrimmedString(body.choix_b),
    choix_c: asTrimmedString(body.choix_c),
    choix_d: asTrimmedString(body.choix_d),
    choix_e: asTrimmedString(body.choix_e),
    reponse_correcte: CHOICE_LETTERS.includes(reponse) ? reponse : null,
    reponse_texte: normalizeOptionalString(body.reponse_texte),
    niveau: normalizeOptionalString(body.niveau) || 'base',
    difficulte: Number.isFinite(difficulte) ? difficulte : null,
    difficulte_label: normalizeOptionalString(body.difficulte_label),
    notes_pedagogiques: normalizeOptionalString(body.notes_pedagogiques),
    tags: normalizeOptionalString(body.tags),
    mots_cles: normalizeOptionalString(body.mots_cles),
    photo_url: normalizeOptionalString(body.photo_url),
    photo_url_hd: normalizeOptionalString(body.photo_url_hd),
    photo_description_url: normalizeOptionalString(body.photo_description_url),
    photo_filename: normalizeOptionalString(body.photo_filename),
    photo_credit: normalizeOptionalString(body.photo_credit),
    photo_licence: normalizeOptionalString(body.photo_licence),
    photo_licence_url: normalizeOptionalString(body.photo_licence_url),
    photo_legende: normalizeOptionalString(body.photo_legende),
    photo_sujet: normalizeOptionalString(body.photo_sujet),
    wikipedia_title: normalizeOptionalString(body.wikipedia_title),
    wikipedia_url: normalizeOptionalString(body.wikipedia_url),
    photo_method: normalizeOptionalString(body.photo_method),
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

async function loadKnownBiomeSlugs(deps) {
  const rows = await deps.queryAll('SELECT slug FROM gl_biomes');
  return new Set(rows.map((row) => String(row.slug)));
}

async function loadKnownCategorySlugs(deps) {
  const rows = await deps.queryAll('SELECT slug FROM gl_qcm_categories');
  return new Set(rows.map((row) => String(row.slug)));
}

async function syncSingleQuestionGlossaryLinks(deps, payload) {
  const { queryAll, execute } = deps;
  const glossaryRows = await queryAll(
    `SELECT glossary_code, terme, variantes, categorie, definition_courte
       FROM gl_glossary_terms WHERE statut = 'actif'`,
  );
  const glossaryByKey = buildGlossaryLookupMap(glossaryRows);
  const matched = matchGlossaryTermsForSpecies(combineKeywords(payload), glossaryByKey);

  await execute('DELETE FROM gl_qcm_question_glossary WHERE question_code = ?', [
    payload.question_code,
  ]);
  for (const term of matched) {
    await execute(
      'INSERT IGNORE INTO gl_qcm_question_glossary (question_code, glossary_code) VALUES (?, ?)',
      [payload.question_code, term.glossary_code],
    );
  }
  return matched.length;
}

async function loadAdminQuestionDetail(deps, code) {
  return deps.queryOne(`${ADMIN_QUESTION_SELECT} WHERE q.question_code = ? LIMIT 1`, [code]);
}

async function allocateNextGlQcmQuestionCode(deps) {
  const row = await deps.queryOne(
    `SELECT question_code FROM gl_qcm_questions
      WHERE question_code REGEXP '^QCM[0-9]+$'
      ORDER BY CAST(SUBSTRING(question_code, 4) AS UNSIGNED) DESC
      LIMIT 1`,
  );
  const current = row?.question_code ? Number(String(row.question_code).slice(3)) : 0;
  const next = Number.isFinite(current) && current > 0 ? current + 1 : 1;
  return `QCM${String(next).padStart(4, '0')}`;
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
    case 'biome':
    default:
      return 'q.biome_slug ASC, q.categorie_slug ASC, q.numero_dans_categorie ASC';
  }
}

async function listAdminQuestions(deps, options = {}) {
  const biomeSlug = normalizeOptionalString(options.biomeSlug)?.toLowerCase();
  const categorieSlug = normalizeOptionalString(options.categorieSlug)?.toLowerCase();
  const niveau = normalizeOptionalString(options.niveau);
  const q = normalizeOptionalString(options.q);
  const statutRaw = normalizeOptionalString(options.statut)?.toLowerCase() || 'actif';
  const sort = VALID_SORTS.has(options.sort) ? options.sort : 'biome';

  const params = [];
  let sql = `${ADMIN_QUESTION_SELECT} WHERE 1=1`;

  if (statutRaw !== 'all') {
    sql += ' AND q.statut = ?';
    params.push(statutRaw === 'inactif' ? 'inactif' : 'actif');
  }
  if (biomeSlug) {
    sql += ' AND q.biome_slug = ?';
    params.push(biomeSlug);
  }
  if (categorieSlug) {
    sql += ' AND q.categorie_slug = ?';
    params.push(categorieSlug);
  }
  if (niveau) {
    sql += ' AND q.niveau = ?';
    params.push(niveau);
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
    biome_slug: row.biome_slug,
    categorie_slug: row.categorie_slug,
    categorie_nom: row.categorie_nom,
    numero_dans_categorie: row.numero_dans_categorie,
    question: row.question,
    niveau: row.niveau,
    difficulte: row.difficulte,
    difficulte_label: row.difficulte_label,
    reponse_correcte: row.reponse_correcte,
    statut: row.statut,
  }));
}

async function upsertGlQcmQuestion(deps, body, options = {}) {
  const payload = normalizeQuestionApiBody(body);
  if (options.question_code) {
    payload.question_code = asTrimmedString(options.question_code).toUpperCase();
  }
  if (!payload.question_code) {
    throw Object.assign(new Error('Code question requis'), { statusCode: 400 });
  }

  const knownBiomes = await loadKnownBiomeSlugs(deps);
  const knownCategories = await loadKnownCategorySlugs(deps);
  const errors = validateQuestionPayload(payload, 0, knownBiomes, knownCategories);
  if (errors.length) {
    throw Object.assign(new Error(formatValidationError(errors)), {
      statusCode: 400,
      details: errors,
    });
  }

  const existing = await deps.queryOne(
    'SELECT question_code FROM gl_qcm_questions WHERE question_code = ? LIMIT 1',
    [payload.question_code],
  );
  if (options.requireExisting && !existing) {
    throw Object.assign(new Error('Question introuvable'), { statusCode: 404 });
  }
  if (options.requireNew && existing) {
    throw Object.assign(new Error('Ce code question existe déjà'), { statusCode: 409 });
  }

  await deps.execute(QUESTION_UPSERT_SQL, buildQuestionUpsertParams(payload));
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
  allocateNextGlQcmQuestionCode,
  listAdminQuestions,
  upsertGlQcmQuestion,
};
