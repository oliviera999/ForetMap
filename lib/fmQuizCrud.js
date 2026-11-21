'use strict';

/**
 * CRUD admin des questions du quiz ForetMap. Adaptateur du socle commun
 * `lib/shared/questionCrudCore.js` (normalisation du corps, liste, allocation de
 * code, flux d'upsert). Restent propres à ce dataset : le SELECT admin (JOIN
 * quiz_categories pour le thème), `niveau` borné (college|lycee, repli college),
 * photos réduites à 4 colonnes, pas de `mots_cles`, et la synchro glossaire
 * ForetMap (`resource_question_links`, sans `question_dataset`).
 *
 * Rattachements saisis avec la question (`plant_ids`, `glossary_codes`, `tutorial_ids`) :
 * écrits par le service unique des liens, dans la transaction de l'upsert — voir
 * `linkQuestionToResources`.
 */

const {
  asTrimmedString,
  buildGlossaryLookupMap,
  matchGlossaryTermsForSpecies,
} = require('./glossaryMatch');
const { normalizeOptionalString } = require('./shared/httpHelpers');
const { httpError } = require('./shared/httpError');
const { sanitizeLinkInput } = require('./shared/resourceQuestionGatingCore');
const learningLinks = require('./pedago/learningLinks');
const { QUESTION_NIVEAU_ENUM, quizDifficulteLabel } = require('./shared/pedagoEnums');
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

const VALID_NIVEAUX = new Set(QUESTION_NIVEAU_ENUM.values);
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
  const common = normalizeQuestionBodyCommon(body);
  return {
    ...common,
    // Libellé dérivé de la difficulté (référentiel, audit § 3.5) : la saisie libre est ignorée.
    // Le socle `questionCrudCore`, commun avec G&L, n'est pas touché.
    difficulte_label: quizDifficulteLabel(common.difficulte),
    niveau: VALID_NIVEAUX.has(niveauRaw) ? niveauRaw : 'college',
    ...normalizeOptionalStringFields(body, OPTIONAL_EXTRA_FIELDS),
  };
}

async function syncSingleQuestionGlossaryLinks(deps, payload) {
  const glossaryRows = await deps.queryAll(
    `SELECT glossary_code, terme, variantes, categorie, definition_courte
       FROM glossary_terms WHERE statut = 'actif'`,
  );
  const glossaryByKey = buildGlossaryLookupMap(glossaryRows);
  const matched = matchGlossaryTermsForSpecies(combineKeywords(payload), glossaryByKey);

  // Service unique des liens (`lib/pedago/learningLinks.js`) : le rapprochement par
  // mots-clés ne remplace **que ses propres liens** de cette question (origin='keyword', lot
  // P0) ; les liens relus — dont la curation de la migration 227, stockée sous
  // origin='import' et bloquante —, saisis, repris (migration 300) ou produits par un script
  // ne sont jamais touchés (audit du 25/09/2026, § 1.3.3). INSERT IGNORE : un lien déjà
  // présent (relu, bloquant) n'est pas rétrogradé.
  await learningLinks.replaceKeywordGlossaryLinks(deps, {
    questionCode: payload.question_code,
    links: matched.map((term) => ({
      glossaryCode: term.glossary_code,
      questionCode: payload.question_code,
    })),
  });
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
      difficulte_label: quizDifficulteLabel(row.difficulte),
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
  // Clé unique d'emplacement : contrôlée avant l'upsert (P2, audit ForetMap du 19/11/2026).
  slot: { table: 'quiz_questions', columns: ['categorie_slug', 'numero_dans_categorie'] },
  async validate(deps, payload) {
    const knownCategories = await loadSlugSet(deps, 'SELECT slug FROM quiz_categories');
    return validateQuestionPayload(payload, 0, knownCategories);
  },
  upsertSql: QUESTION_UPSERT_SQL_FORM,
  buildUpsertParams: buildQuestionUpsertParams,
  syncGlossaryLinks: syncSingleQuestionGlossaryLinks,
  loadDetail: loadAdminQuestionDetail,
};

/** Nombre maximal de ressources rattachées par champ et par enregistrement. */
const MAX_RESOURCE_LINKS_PER_FIELD = 50;

/**
 * Champs de rattachement acceptés avec une question, par type de ressource. `lookup` relit
 * les références en base : seule une ressource existante est liée, sous sa référence
 * canonique (identifiant de la fiche ou du tutoriel, code du terme tel qu'il est stocké).
 */
const RESOURCE_LINK_FIELDS = Object.freeze([
  {
    field: 'plant_ids',
    resourceType: 'plant',
    numeric: true,
    label: 'Fiche(s) espèce introuvable(s)',
    lookupSql: (marks) => `SELECT id AS ref FROM plants WHERE id IN (${marks})`,
  },
  {
    field: 'glossary_codes',
    resourceType: 'glossary',
    numeric: false,
    label: 'Terme(s) du glossaire introuvable(s)',
    lookupSql: (marks) =>
      `SELECT glossary_code AS ref FROM glossary_terms WHERE glossary_code IN (${marks})`,
  },
  {
    field: 'tutorial_ids',
    resourceType: 'tutorial',
    numeric: true,
    label: 'Tutoriel(s) introuvable(s)',
    lookupSql: (marks) => `SELECT id AS ref FROM tutorials WHERE id IN (${marks})`,
  },
]);

/** Clé de comparaison d'une référence (les codes du glossaire ne dépendent pas de la casse). */
function resourceRefKey(ref) {
  return String(ref).trim().toLowerCase();
}

/**
 * Lit `plant_ids`, `glossary_codes` et `tutorial_ids` dans le corps d'une question.
 *
 * Un champ **absent** (ou `null`) n'est pas un rattachement vide : il est ignoré, la question
 * garde ses liens. Un champ présent doit être un tableau ; ses doublons sont retirés.
 *
 * @returns {Array<{ field: string, resourceType: string, refs: string[] }>} champs fournis
 * @throws erreur 400 si un champ n'est pas un tableau valide
 */
function parseResourceLinkFields(body = {}) {
  const requested = [];
  for (const def of RESOURCE_LINK_FIELDS) {
    const raw = body?.[def.field];
    if (raw == null) continue;
    if (!Array.isArray(raw)) throw httpError(400, `${def.field} : tableau attendu`);
    if (raw.length > MAX_RESOURCE_LINKS_PER_FIELD) {
      throw httpError(400, `${def.field} : ${MAX_RESOURCE_LINKS_PER_FIELD} éléments au plus`);
    }
    const refs = new Map();
    for (const item of raw) {
      const text = String(item == null ? '' : item).trim();
      const valid = def.numeric ? /^[1-9][0-9]{0,9}$/.test(text) : text.length > 0;
      if (!valid || text.length > 64) {
        throw httpError(400, `${def.field} : valeur invalide (${text.slice(0, 32) || 'vide'})`);
      }
      if (!refs.has(resourceRefKey(text))) refs.set(resourceRefKey(text), text);
    }
    requested.push({ ...def, refs: [...refs.values()] });
  }
  return requested;
}

/**
 * Rattache une question aux ressources demandées, par le **service unique des liens**
 * (`lib/pedago/learningLinks.js`, table `resource_question_links`).
 *
 * Règles :
 *   - **ajout seulement** : une ressource absente de la liste n'est pas détachée (le retrait
 *     d'un lien reste un geste de l'écran des liens) ;
 *   - lien nouveau : approuvé, **non bloquant**, `origin = 'manual'` ;
 *   - lien déjà approuvé : laissé tel quel (caractère bloquant, origine, poids et note
 *     conservés) — rejouer la même demande ne change rien ;
 *   - lien seulement proposé ou rejeté : approuvé, sans toucher à son caractère bloquant ni
 *     à son origine ;
 *   - une référence inconnue refuse toute la demande (400) : l'appelant est dans la
 *     transaction de l'upsert, la question n'est donc pas enregistrée à moitié.
 *
 * @param {{ queryAll: Function, queryOne: Function, execute: Function }} deps
 * @param {string} questionCode
 * @param {ReturnType<typeof parseResourceLinkFields>} requested
 * @param {{ actor?: { userType?: string|null, userId?: string|null } }} [options]
 * @returns {Promise<{ created: object[], approved: object[], unchanged: object[] }>}
 */
async function linkQuestionToResources(deps, questionCode, requested, { actor = {} } = {}) {
  const report = { created: [], approved: [], unchanged: [] };
  for (const def of requested) {
    if (!def.refs.length) continue;
    const marks = def.refs.map(() => '?').join(', ');
    const rows = await deps.queryAll(def.lookupSql(marks), def.refs);
    const canonical = new Map(rows.map((row) => [resourceRefKey(row.ref), String(row.ref)]));
    const missing = def.refs.filter((ref) => !canonical.has(resourceRefKey(ref)));
    if (missing.length) throw httpError(400, `${def.label} : ${missing.join(', ')}`);

    for (const ref of def.refs) {
      const resourceRef = canonical.get(resourceRefKey(ref));
      const entry = { resource_type: def.resourceType, resource_ref: resourceRef };
      const existing = await learningLinks.findLinkByKey(deps, {
        resourceType: def.resourceType,
        resourceRef,
        questionCode,
      });
      if (existing && existing.status === learningLinks.LINK_STATUSES.APPROVED) {
        report.unchanged.push(entry);
        continue;
      }
      if (existing) {
        await learningLinks.updateLink(deps, existing.id, {
          status: learningLinks.LINK_STATUSES.APPROVED,
        });
        report.approved.push(entry);
        continue;
      }
      const parsed = sanitizeLinkInput(
        { ...entry, question_code: questionCode },
        { allowedResourceTypes: [def.resourceType] },
      );
      if (!parsed.ok) throw httpError(400, parsed.error);
      await learningLinks.upsertLink(deps, parsed.value, { actor });
      report.created.push(entry);
    }
  }
  return report;
}

/**
 * Crée ou met à jour une question. Si le corps porte `plant_ids`, `glossary_codes` ou
 * `tutorial_ids`, le résultat gagne `links` (rapport de `linkQuestionToResources`).
 *
 * @param {object} deps `{ queryAll, queryOne, execute }` (connexion de la transaction)
 * @param {object} body corps de la requête
 * @param {{ question_code?: string, requireExisting?: boolean, requireNew?: boolean,
 *           actor?: { userType?: string|null, userId?: string|null } }} [options]
 */
async function upsertQuizQuestion(deps, body, options = {}) {
  // Rattachements validés AVANT toute écriture : un champ mal formé ne coûte pas un upsert.
  const requested = parseResourceLinkFields(body);
  const result = await upsertQuestionCore(
    deps,
    normalizeQuestionApiBody(body),
    options,
    UPSERT_CONFIG,
  );
  if (!requested.length) return result;
  const links = await linkQuestionToResources(deps, result.question.question_code, requested, {
    actor: options.actor,
  });
  return { ...result, links };
}

/**
 * Upsert d'une question **et** de ses liens par mots-clés dans une seule transaction (audit du
 * 25/09/2026, § 1.3.3 et § 3.2.3) : une panne après la purge des liens ne laisse plus la
 * question à jour et ses rattachements effacés. La transaction est posée ici, côté ForetMap,
 * sans toucher le socle `questionCrudCore` commun avec G&L.
 *
 * @param {(work: (tx: object) => Promise<any>) => Promise<any>} withTransaction
 */
async function upsertQuizQuestionInTransaction(withTransaction, body, options = {}) {
  return withTransaction((tx) =>
    upsertQuizQuestion(
      { queryAll: tx.queryAll, queryOne: tx.queryOne, execute: tx.execute },
      body,
      options,
    ),
  );
}

module.exports = {
  VALID_SORTS,
  RESOURCE_LINK_FIELDS,
  MAX_RESOURCE_LINKS_PER_FIELD,
  normalizeQuestionApiBody,
  parseResourceLinkFields,
  linkQuestionToResources,
  loadAdminQuestionDetail,
  allocateNextQuizQuestionCode,
  listAdminQuestions,
  upsertQuizQuestion,
  upsertQuizQuestionInTransaction,
};
