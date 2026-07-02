'use strict';

/**
 * CRUD admin des questions QCM biomes GL. Adaptateur du socle commun
 * `lib/shared/questionCrudCore.js` (normalisation du corps, liste, allocation de
 * code, flux d'upsert). Restent propres à ce dataset : le SELECT admin, les champs
 * biome/photos/Wikipédia, `niveau` libre (repli 'base') et la synchro glossaire GL
 * (`gl_resource_question_links`, dataset 'qcm').
 */

const {
  asTrimmedString,
  buildGlossaryLookupMap,
  matchGlossaryTermsForSpecies,
} = require('./glGlossaryMatch');
const { normalizeOptionalString } = require('./shared/httpHelpers');
const {
  normalizeQuestionBodyCommon,
  normalizeOptionalStringFields,
  loadSlugSet,
  allocateNextQuestionCode,
  createOrderClauseBuilder,
  listAdminQuestionsCore,
  upsertQuestionCore,
} = require('./shared/questionCrudCore');
const {
  QUESTION_UPSERT_SQL_FORM,
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

/** Champs optionnels propres au QCM biomes (mots-clés, photos, Wikipédia). */
const OPTIONAL_EXTRA_FIELDS = [
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
];

function normalizeQuestionApiBody(body = {}) {
  return {
    ...normalizeQuestionBodyCommon(body),
    biome_slug: asTrimmedString(body.biome_slug).toLowerCase(),
    niveau: normalizeOptionalString(body.niveau) || 'base',
    ...normalizeOptionalStringFields(body, OPTIONAL_EXTRA_FIELDS),
  };
}

async function syncSingleQuestionGlossaryLinks(deps, payload) {
  const { queryAll, execute } = deps;
  const glossaryRows = await queryAll(
    `SELECT glossary_code, terme, variantes, categorie, definition_courte
       FROM gl_glossary_terms WHERE statut = 'actif'`,
  );
  const glossaryByKey = buildGlossaryLookupMap(glossaryRows);
  const matched = matchGlossaryTermsForSpecies(combineKeywords(payload), glossaryByKey);

  // Source de vérité unifiée : gl_resource_question_links (cf. migration 145). DELETE scopé à
  // origin='import' (matcher-owned) : ne touche QUE les liens régénérables par le matcher ;
  // préserve manual/point4/auto/generated approuvés ET suggested.
  await execute(
    `DELETE FROM gl_resource_question_links
      WHERE question_dataset = 'qcm' AND resource_type = 'glossary'
        AND origin = 'import' AND question_code = ?`,
    [payload.question_code],
  );
  for (const term of matched) {
    await execute(
      `INSERT IGNORE INTO gl_resource_question_links
        (question_dataset, question_code, resource_type, resource_ref, status, origin, is_gating)
       VALUES ('qcm', ?, 'glossary', ?, 'approved', 'import', 1)`,
      [payload.question_code, term.glossary_code],
    );
  }
  return matched.length;
}

async function loadAdminQuestionDetail(deps, code) {
  return deps.queryOne(`${ADMIN_QUESTION_SELECT} WHERE q.question_code = ? LIMIT 1`, [code]);
}

async function allocateNextGlQcmQuestionCode(deps) {
  return allocateNextQuestionCode(deps, { table: 'gl_qcm_questions', prefix: 'QCM' });
}

const LIST_CONFIG = {
  adminSelect: ADMIN_QUESTION_SELECT,
  validSorts: VALID_SORTS,
  defaultSort: 'biome',
  buildOrderClause: createOrderClauseBuilder(
    { biome: 'q.biome_slug ASC, q.categorie_slug ASC, q.numero_dans_categorie ASC' },
    'biome',
  ),
  searchExtraFields: ['mots_cles'],
  buildFilters(options) {
    const biomeSlug = normalizeOptionalString(options.biomeSlug)?.toLowerCase();
    const categorieSlug = normalizeOptionalString(options.categorieSlug)?.toLowerCase();
    const niveau = normalizeOptionalString(options.niveau);
    return [
      biomeSlug && { clause: 'q.biome_slug = ?', value: biomeSlug },
      categorieSlug && { clause: 'q.categorie_slug = ?', value: categorieSlug },
      niveau && { clause: 'q.niveau = ?', value: niveau },
    ];
  },
  toSummary(row) {
    return {
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
    };
  },
};

async function listAdminQuestions(deps, options = {}) {
  return listAdminQuestionsCore(deps, options, LIST_CONFIG);
}

const UPSERT_CONFIG = {
  existsSql: 'SELECT question_code FROM gl_qcm_questions WHERE question_code = ? LIMIT 1',
  async validate(deps, payload) {
    const knownBiomes = await loadSlugSet(deps, 'SELECT slug FROM gl_biomes');
    const knownCategories = await loadSlugSet(deps, 'SELECT slug FROM gl_qcm_categories');
    return validateQuestionPayload(payload, 0, knownBiomes, knownCategories);
  },
  upsertSql: QUESTION_UPSERT_SQL_FORM,
  buildUpsertParams: buildQuestionUpsertParams,
  syncGlossaryLinks: syncSingleQuestionGlossaryLinks,
  loadDetail: loadAdminQuestionDetail,
};

async function upsertGlQcmQuestion(deps, body, options = {}) {
  return upsertQuestionCore(deps, normalizeQuestionApiBody(body), options, UPSERT_CONFIG);
}

module.exports = {
  VALID_SORTS,
  normalizeQuestionApiBody,
  loadAdminQuestionDetail,
  allocateNextGlQcmQuestionCode,
  listAdminQuestions,
  upsertGlQcmQuestion,
};
