'use strict';

/**
 * CRUD admin des questions du quiz ForetMap. Adaptateur du socle commun
 * `lib/shared/questionCrudCore.js` (normalisation du corps, liste, allocation de
 * code, flux d'upsert). Restent propres à ce dataset : le SELECT admin (JOIN
 * quiz_categories pour le thème), `niveau` borné (college|lycee, repli college),
 * photos réduites à 4 colonnes, pas de `mots_cles`, et la synchro glossaire
 * ForetMap (`resource_question_links`, sans `question_dataset`).
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
} = require('./fmQuizImport');

const VALID_NIVEAUX = new Set(['college', 'lycee']);
const VALID_SORTS = new Set(['theme', 'code', 'code_desc', 'category', 'difficulte']);

const ADMIN_QUESTION_SELECT = `
  SELECT q.question_code, q.categorie_slug, q.numero_dans_categorie, q.question,
         q.choix_a, q.choix_b, q.choix_c, q.choix_d, q.choix_e,
         q.reponse_correcte, q.reponse_texte, q.niveau, q.difficulte, q.difficulte_label,
         q.feedback_correct, q.feedback_a, q.feedback_b, q.feedback_c, q.feedback_d, q.feedback_e,
         q.notes_pedagogiques, q.tags,
         q.photo_url, q.photo_credit, q.photo_licence, q.photo_legende, q.statut,
         q.created_at, q.updated_at,
         c.theme, c.nom AS categorie_nom
    FROM quiz_questions q
    JOIN quiz_categories c ON c.slug = q.categorie_slug
`;

/** Champs optionnels propres au quiz ForetMap (photos réduites, pas de mots_cles). */
const OPTIONAL_EXTRA_FIELDS = ['photo_url', 'photo_credit', 'photo_licence', 'photo_legende'];

function normalizeQuestionApiBody(body = {}) {
  const niveauRaw = asTrimmedString(body.niveau).toLowerCase();
  return {
    ...normalizeQuestionBodyCommon(body),
    niveau: VALID_NIVEAUX.has(niveauRaw) ? niveauRaw : 'college',
    ...normalizeOptionalStringFields(body, OPTIONAL_EXTRA_FIELDS),
  };
}

async function syncSingleQuestionGlossaryLinks(deps, payload) {
  const { queryAll, execute } = deps;
  const glossaryRows = await queryAll(
    `SELECT glossary_code, terme, variantes, categorie, definition_courte
       FROM glossary_terms WHERE statut = 'actif'`,
  );
  const glossaryByKey = buildGlossaryLookupMap(glossaryRows);
  const matched = matchGlossaryTermsForSpecies(combineKeywords(payload), glossaryByKey);

  // Source de vérité unifiée : resource_question_links (cf. migration 144). DELETE scopé à
  // origin='import' (PAS status='approved') pour ne PAS détruire les liens produits par les
  // scripts d'enrichissement (origin='generated'/'auto', status approved/suggested).
  // resource_type='glossary' obligatoire dans le WHERE (modèle polymorphe).
  await execute(
    `DELETE FROM resource_question_links
      WHERE resource_type = 'glossary' AND origin = 'import' AND question_code = ?`,
    [payload.question_code],
  );
  for (const term of matched) {
    await execute(
      `INSERT IGNORE INTO resource_question_links
        (resource_type, resource_ref, question_code, status, origin, is_gating)
       VALUES ('glossary', ?, ?, 'approved', 'import', 1)`,
      [term.glossary_code, payload.question_code],
    );
  }
  return matched.length;
}

async function loadAdminQuestionDetail(deps, code) {
  return deps.queryOne(`${ADMIN_QUESTION_SELECT} WHERE q.question_code = ? LIMIT 1`, [code]);
}

async function allocateNextQuizQuestionCode(deps) {
  return allocateNextQuestionCode(deps, { table: 'quiz_questions', prefix: 'QF' });
}

const LIST_CONFIG = {
  adminSelect: ADMIN_QUESTION_SELECT,
  validSorts: VALID_SORTS,
  defaultSort: 'theme',
  buildOrderClause: createOrderClauseBuilder(
    { theme: 'c.theme ASC, q.categorie_slug ASC, q.numero_dans_categorie ASC' },
    'theme',
  ),
  searchExtraFields: [],
  buildFilters(options) {
    // Divergence assumée : le thème n'est PAS minusculisé (valeurs canoniques en base),
    // contrairement au niveau (saisie utilisateur libre).
    const theme = normalizeOptionalString(options.theme);
    const categorieSlug = normalizeOptionalString(options.categorieSlug)?.toLowerCase();
    const niveau = normalizeOptionalString(options.niveau)?.toLowerCase();
    return [
      theme && { clause: 'c.theme = ?', value: theme },
      categorieSlug && { clause: 'q.categorie_slug = ?', value: categorieSlug },
      niveau && { clause: 'q.niveau = ?', value: niveau },
    ];
  },
  toSummary(row) {
    return {
      question_code: row.question_code,
      theme: row.theme,
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
  existsSql: 'SELECT question_code FROM quiz_questions WHERE question_code = ? LIMIT 1',
  async validate(deps, payload) {
    const knownCategories = await loadSlugSet(deps, 'SELECT slug FROM quiz_categories');
    return validateQuestionPayload(payload, 0, knownCategories);
  },
  upsertSql: QUESTION_UPSERT_SQL_FORM,
  buildUpsertParams: buildQuestionUpsertParams,
  syncGlossaryLinks: syncSingleQuestionGlossaryLinks,
  loadDetail: loadAdminQuestionDetail,
};

async function upsertQuizQuestion(deps, body, options = {}) {
  return upsertQuestionCore(deps, normalizeQuestionApiBody(body), options, UPSERT_CONFIG);
}

module.exports = {
  VALID_SORTS,
  normalizeQuestionApiBody,
  loadAdminQuestionDetail,
  allocateNextQuizQuestionCode,
  listAdminQuestions,
  upsertQuizQuestion,
};
