'use strict';

/**
 * CRUD admin des questions QCM lore GL. Adaptateur du socle commun
 * `lib/shared/questionCrudCore.js` (normalisation du corps, liste, allocation de
 * code, flux d'upsert). Restent propres à ce dataset : le SELECT admin, les champs
 * chapitre/tier_lore/source_lore, `niveau` libre et NULLABLE (pas de repli, à la
 * différence du QCM biomes), la validation par scopes (chapitres) et la synchro
 * glossaire lore (`gl_resource_question_links`, dataset 'qcm_lore').
 */

const {
  buildLoreGlossaryLookupMap,
  matchLoreGlossaryTermsForText,
  asTrimmedString,
} = require('./glLoreGlossaryMatch');
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
  LORE_TIER_VALUES,
  QUESTION_UPSERT_SQL_FORM,
  buildQuestionUpsertParams,
  validateQuestionPayload,
  combineKeywords,
} = require('./glQcmLoreImport');

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

/** Champs optionnels propres au QCM lore (niveau nullable, source, mots-clés). */
const OPTIONAL_EXTRA_FIELDS = ['niveau', 'source_lore', 'mots_cles'];

function normalizeQuestionApiBody(body = {}) {
  const tierRaw = asTrimmedString(body.tier_lore).toLowerCase();
  return {
    ...normalizeQuestionBodyCommon(body),
    chapitre_slug: asTrimmedString(body.chapitre_slug).toLowerCase(),
    tier_lore: LORE_TIER_VALUES.has(tierRaw) ? tierRaw : 'recit',
    ...normalizeOptionalStringFields(body, OPTIONAL_EXTRA_FIELDS),
  };
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
  return allocateNextQuestionCode(deps, { table: 'gl_qcm_lore_questions', prefix: 'LQCM' });
}

const LIST_CONFIG = {
  adminSelect: ADMIN_QUESTION_SELECT,
  validSorts: VALID_SORTS,
  defaultSort: 'chapitre',
  buildOrderClause: createOrderClauseBuilder(
    {
      tier: 'q.tier_lore ASC, q.chapitre_slug ASC, q.question_code ASC',
      chapitre: 'q.chapitre_slug ASC, q.categorie_slug ASC, q.numero_dans_categorie ASC',
    },
    'chapitre',
  ),
  searchExtraFields: ['mots_cles'],
  buildFilters(options) {
    const chapitreSlug = normalizeOptionalString(options.chapitreSlug)?.toLowerCase();
    const categorieSlug = normalizeOptionalString(options.categorieSlug)?.toLowerCase();
    const tierLore = normalizeOptionalString(options.tierLore)?.toLowerCase();
    return [
      chapitreSlug && { clause: 'q.chapitre_slug = ?', value: chapitreSlug },
      categorieSlug && { clause: 'q.categorie_slug = ?', value: categorieSlug },
      // Divergence assumée : un tier inconnu est ignoré (pas d'erreur, pas de filtre).
      tierLore && LORE_TIER_VALUES.has(tierLore) && { clause: 'q.tier_lore = ?', value: tierLore },
    ];
  },
  toSummary(row) {
    return {
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
    };
  },
};

async function listAdminQuestions(deps, options = {}) {
  return listAdminQuestionsCore(deps, options, LIST_CONFIG);
}

const UPSERT_CONFIG = {
  existsSql: 'SELECT question_code FROM gl_qcm_lore_questions WHERE question_code = ? LIMIT 1',
  async validate(deps, payload) {
    const knownScopes = await loadSlugSet(deps, 'SELECT slug FROM gl_qcm_lore_scopes');
    const knownCategories = await loadSlugSet(deps, 'SELECT slug FROM gl_qcm_lore_categories');
    return validateQuestionPayload(payload, 0, knownScopes, knownCategories);
  },
  upsertSql: QUESTION_UPSERT_SQL_FORM,
  buildUpsertParams: buildQuestionUpsertParams,
  syncGlossaryLinks: syncSingleQuestionGlossaryLinks,
  loadDetail: loadAdminQuestionDetail,
};

async function upsertGlQcmLoreQuestion(deps, body, options = {}) {
  return upsertQuestionCore(deps, normalizeQuestionApiBody(body), options, UPSERT_CONFIG);
}

module.exports = {
  VALID_SORTS,
  normalizeQuestionApiBody,
  loadAdminQuestionDetail,
  allocateNextGlQcmLoreQuestionCode,
  listAdminQuestions,
  upsertGlQcmLoreQuestion,
};
