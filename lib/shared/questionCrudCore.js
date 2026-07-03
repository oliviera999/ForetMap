'use strict';

/**
 * Socle commun des CRUD admin de questions à choix multiples (audit §4.2, paire 1.1) :
 * `glQcmCrud` (QCM biomes GL), `glQcmLoreCrud` (QCM lore GL) et `fmQuizCrud` (quiz ForetMap)
 * partageaient ~60 % de code recopié. Ce module factorise la normalisation du corps API,
 * l'allocation de code, la liste admin et le flux d'upsert « fiche éditeur », paramétrés
 * par configuration. Les schémas de champs (biome vs chapitre/tier vs thème, photos,
 * Wikipédia…), les SELECT admin et la synchro glossaire restent dans chaque adaptateur :
 * ils divergent réellement (tables, matchers et datasets distincts).
 */

const { asTrimmedString } = require('./stringHelpers');
const { normalizeOptionalString } = require('./httpHelpers');
const { CHOICE_LETTERS } = require('../glQcmChoices');

/** Construit une erreur HTTP portée par `statusCode` (contrat des routes admin). */
function httpError(statusCode, message, extra = {}) {
  return Object.assign(new Error(message), { statusCode, ...extra });
}

/**
 * Normalise les champs communs aux trois corps API de question (code, catégorie, énoncé,
 * choix A–E, réponse, difficulté, feedbacks…). Les champs divergents (`niveau` — trois
 * politiques distinctes —, `biome_slug`/`chapitre_slug`/`tier_lore`, photos, mots-clés)
 * sont ajoutés par chaque adaptateur.
 */
function normalizeQuestionBodyCommon(body = {}) {
  const reponse = asTrimmedString(body.reponse_correcte).toUpperCase();
  const difficulteRaw = body.difficulte;
  const difficulte = difficulteRaw === '' || difficulteRaw == null ? null : Number(difficulteRaw);

  return {
    question_code: asTrimmedString(body.question_code).toUpperCase(),
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
    difficulte: Number.isFinite(difficulte) ? difficulte : null,
    difficulte_label: normalizeOptionalString(body.difficulte_label),
    notes_pedagogiques: normalizeOptionalString(body.notes_pedagogiques),
    tags: normalizeOptionalString(body.tags),
    statut: normalizeOptionalString(body.statut) || 'actif',
    feedback_correct: normalizeOptionalString(body.feedback_correct),
    feedback_a: normalizeOptionalString(body.feedback_a),
    feedback_b: normalizeOptionalString(body.feedback_b),
    feedback_c: normalizeOptionalString(body.feedback_c),
    feedback_d: normalizeOptionalString(body.feedback_d),
    feedback_e: normalizeOptionalString(body.feedback_e),
  };
}

/**
 * Normalise une liste de champs optionnels (chaîne rognée ou `null`) — permet à chaque
 * adaptateur de déclarer ses champs propres (photos, Wikipédia, source lore…) par liste.
 */
function normalizeOptionalStringFields(body = {}, fieldKeys = []) {
  const out = {};
  for (const key of fieldKeys) out[key] = normalizeOptionalString(body[key]);
  return out;
}

/** Message d'erreur de la première violation (contrat des formulaires admin). */
function formatQuestionValidationError(errors) {
  const first = errors[0];
  if (!first) return 'Données invalides';
  return first.error || 'Données invalides';
}

/** Charge un ensemble de slugs connus (`SELECT slug FROM …`) pour la validation. */
async function loadSlugSet(deps, selectSql) {
  const rows = await deps.queryAll(selectSql);
  return new Set(rows.map((row) => String(row.slug)));
}

/**
 * Alloue le prochain code question `PREFIXNNNN` (zero-pad 4) pour une table donnée.
 * `table` et `prefix` sont des constantes de module des adaptateurs (jamais des entrées
 * utilisateur) : leur interpolation est sûre.
 */
async function allocateNextQuestionCode(deps, { table, prefix }) {
  const row = await deps.queryOne(
    `SELECT question_code FROM ${table}
      WHERE question_code REGEXP '^${prefix}[0-9]+$'
      ORDER BY CAST(SUBSTRING(question_code, ${prefix.length + 1}) AS UNSIGNED) DESC
      LIMIT 1`,
  );
  const current = row?.question_code ? Number(String(row.question_code).slice(prefix.length)) : 0;
  const next = Number.isFinite(current) && current > 0 ? current + 1 : 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

/** Clauses ORDER BY communes aux trois catalogues admin. */
const COMMON_QUESTION_ORDER_CLAUSES = {
  code: 'q.question_code ASC',
  code_desc: 'q.question_code DESC',
  category: 'q.categorie_slug ASC, q.numero_dans_categorie ASC',
  difficulte: 'q.difficulte IS NULL, q.difficulte ASC, q.question_code ASC',
};

/**
 * Fabrique un résolveur de clause ORDER BY : clauses communes + clauses propres au
 * catalogue (ex. `biome`, `tier`, `theme`), repli sur `defaultSort`.
 */
function createOrderClauseBuilder(extraClauses, defaultSort) {
  const clauses = { ...COMMON_QUESTION_ORDER_CLAUSES, ...extraClauses };
  return (sort) => clauses[sort] ?? clauses[defaultSort];
}

/**
 * Liste admin générique : filtre `statut` commun, filtres propres via `config.buildFilters`
 * (entrées falsy ignorées), tri validé, recherche plein-texte en mémoire (code, énoncé,
 * tags, catégorie + `config.searchExtraFields`), projection via `config.toSummary`.
 */
async function listAdminQuestionsCore(deps, options = {}, config) {
  const q = normalizeOptionalString(options.q);
  const statutRaw = normalizeOptionalString(options.statut)?.toLowerCase() || 'actif';
  const sort = config.validSorts.has(options.sort) ? options.sort : config.defaultSort;

  const params = [];
  let sql = `${config.adminSelect} WHERE 1=1`;

  if (statutRaw !== 'all') {
    sql += ' AND q.statut = ?';
    params.push(statutRaw === 'inactif' ? 'inactif' : 'actif');
  }
  for (const filter of config.buildFilters(options)) {
    if (!filter) continue;
    sql += ` AND ${filter.clause}`;
    params.push(filter.value);
  }

  sql += ` ORDER BY ${config.buildOrderClause(sort)}`;

  let rows = await deps.queryAll(sql, params);
  if (q) {
    const needle = q.toLowerCase();
    const extraFields = config.searchExtraFields || [];
    rows = rows.filter((row) => {
      const hay = [
        row.question_code,
        row.question,
        row.tags || '',
        ...extraFields.map((field) => row[field] || ''),
        row.categorie_slug,
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }

  return rows.map(config.toSummary);
}

/**
 * Flux d'upsert « fiche éditeur » commun : code imposé/requis, validation (messages du
 * validateur d'import, contrat testé), garde requireExisting/requireNew (404/409), upsert
 * paramétré par liste de champs (`config.buildUpsertParams`), synchro glossaire puis
 * relecture du détail.
 */
async function upsertQuestionCore(deps, payload, options = {}, config) {
  if (options.question_code) {
    payload.question_code = asTrimmedString(options.question_code).toUpperCase();
  }
  if (!payload.question_code) {
    throw httpError(400, 'Code question requis');
  }

  const errors = await config.validate(deps, payload);
  if (errors.length) {
    throw httpError(400, formatQuestionValidationError(errors), { details: errors });
  }

  const existing = await deps.queryOne(config.existsSql, [payload.question_code]);
  if (options.requireExisting && !existing) {
    throw httpError(404, 'Question introuvable');
  }
  if (options.requireNew && existing) {
    throw httpError(409, 'Ce code question existe déjà');
  }

  await deps.execute(config.upsertSql, config.buildUpsertParams(payload));
  const glossaryLinks = await config.syncGlossaryLinks(deps, payload);
  const question = await config.loadDetail(deps, payload.question_code);

  return {
    created: !existing,
    question,
    glossaryLinks,
  };
}

module.exports = {
  normalizeQuestionBodyCommon,
  normalizeOptionalStringFields,
  formatQuestionValidationError,
  loadSlugSet,
  allocateNextQuestionCode,
  createOrderClauseBuilder,
  listAdminQuestionsCore,
  upsertQuestionCore,
};
