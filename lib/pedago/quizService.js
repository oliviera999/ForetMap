'use strict';

/**
 * Service du quiz ForetMap (étape B2 de la piste B, audit du 25/09/2026, § 3.1 et § 3.3
 * ligne 8) : règles métier de `/api/quiz`, sorties de `routes/quiz.js`, qui ne garde que
 * HTTP (`validate()` → service → JSON).
 *
 * Aucune dépendance à Express. Les erreurs attendues sont levées par `quizError(status,
 * body)` : la route renvoie `body` tel quel avec `status`, ce qui préserve les champs
 * annexes de certaines réponses (`reserved_for`, `cooldown`). Toute autre exception remonte
 * au gestionnaire central (500), comme avant l'extraction.
 *
 * Le SQL vit dans `lib/pedago/quizRepository.js` ; le CRUD admin et l'import restent dans
 * `lib/fmQuizCrud.js` / `lib/fmQuizImport.js` (socle partagé avec les QCM G&L).
 */

const quizRepository = require('./quizRepository');
const { defaultDb } = quizRepository;
const { httpError } = require('../shared/httpError');
const { normalizeOptionalString } = require('../shared/httpHelpers');
const { hasPermission } = require('../../middleware/requireTeacher');
const {
  presentQuestion,
  verifyPresentationAnswer,
  resolveQcmAnswerFeedback,
} = require('../qcmChoices');
const { consumePresentationJti } = require('../qcmPresentationUse');
const {
  loadAdminQuestionDetail,
  allocateNextQuizQuestionCode,
  listAdminQuestions: listAdminQuestionsCrud,
  upsertQuizQuestionInTransaction,
} = require('../fmQuizCrud');
const {
  resolveImportRows,
  applyFmQuizImport,
  MAX_IMPORT_ROWS,
  buildFmQuizTemplateWorkbook,
  buildFmQuizExportWorkbook,
  loadFmQuizExportRows,
  combineKeywords,
} = require('../fmQuizImport');
const { buildGlossaryLookupMap, matchGlossaryTermsForSpecies } = require('../glossaryMatch');
const { registerFmCooldownOnWrongIfGating } = require('../learningGatingRuntime');
const {
  resolvePresentContext,
  assertPresentAllowed,
  resolveAnswerContext,
  assertQuestionOpen,
  listStrictGatingQuestionCodes,
} = require('../learningGatingLockMode');
const {
  listFmQuestionStats,
  MIN_ATTEMPTS_FOR_FLAG,
  SUSPECT_SUCCESS_RATE,
} = require('../quizQuestionStats');
const {
  buildQuizQuestionNotionFilter,
  buildQuizCategoryNotionFilter,
  parseNotionNiveauFilter,
  normalizeNotionId,
} = require('../curriculumNotions');
const { getNamedMemoryTtlCache } = require('../memoryTtlCache');

/** Type de jeton de présentation du quiz ForetMap (distinct des QCM G&L). */
const FM_QCM_JWT_KIND = 'fm_quiz_present';
const QCM_OPTIONS = { jwtKind: FM_QCM_JWT_KIND };
/** Permission de gestion du catalogue : voit les bonnes réponses, administre les questions. */
const QUIZ_MANAGE_PERMISSION = 'plants.manage';
/** Libellés de difficulté (étoile U+2B50, sans sélecteur de variante — octets des migrations). */
const DIFFICULTY_LABELS = new Map([
  [1, '\u2B50 Facile'],
  [2, '\u2B50\u2B50 Moyen'],
  [3, '\u2B50\u2B50\u2B50 Difficile'],
]);

/**
 * Erreur attendue du service : `body` est renvoyé tel quel par la route, avec `status`.
 * @param {number} status
 * @param {{ error: string } & Record<string, unknown>} body
 */
function quizError(status, body) {
  return httpError(status, body.error, { responseBody: body });
}

/** Vrai pour une erreur levée par `quizError` (à renvoyer telle quelle). */
function isQuizError(err) {
  return !!(err && err.responseBody);
}

/**
 * Libellé affiché de la difficulté d'une question, **dérivé** de `difficulte` au lieu d'être
 * lu en base (retrait de `quiz_questions.difficulte_label`, audit du 25/09/2026, § 3.5, T1).
 * Mêmes valeurs que celles semées par les migrations (128, 221, 226, 227). Hors 1 à 3 :
 * `null`, comme les questions sans libellé.
 *
 * Helper local provisoire : à brancher sur le référentiel partagé des ENUM (§ 3.2.5,
 * `lib/shared/…` / `src/shared/enums/…`) dès qu'il existe.
 *
 * @param {unknown} difficulte
 * @returns {string|null}
 */
function difficultyLabel(difficulte) {
  if (difficulte == null || difficulte === '') return null;
  return DIFFICULTY_LABELS.get(Number(difficulte)) || null;
}

// ---------------------------------------------------------------------------------------
// Filtres de requête (purs) — utilisés par les schémas `validate()` de la route
// ---------------------------------------------------------------------------------------

/**
 * Filtre « notion du programme » d'une requête de questions (migration 273).
 *
 * `niveau` est déjà pris : il désigne le niveau propre à la question (`college` / `lycee`).
 * Le niveau **scolaire** d'une notion (`cycle4`, `seconde`, `terminale_spe`…) est une autre
 * échelle, d'où le paramètre distinct `notionNiveau`. Il accepte aussi une étape (`college`,
 * `lycee`) ou une liste séparée par des virgules (lib/pedagoScales.js) : c'est ce qu'envoient
 * les séances lycée. Les deux graphies sont acceptées (`notionId` / `notion_id`) : la
 * première suit les autres filtres de cette route, la seconde le nommage des colonnes
 * renvoyées par l'API.
 *
 * @returns {{ error: string }|{ filter: { sql: string, params: unknown[] }|null }}
 */
function resolveNotionFilter(query, alias, build = buildQuizQuestionNotionFilter) {
  const notionId = normalizeOptionalString(query?.notionId ?? query?.notion_id);
  const notionNiveau = normalizeOptionalString(query?.notionNiveau ?? query?.notion_niveau);
  if (notionId && !normalizeNotionId(notionId)) return { error: 'notionId invalide' };
  const parsedNiveau = parseNotionNiveauFilter(notionNiveau);
  if (parsedNiveau?.error) return { error: parsedNiveau.error };
  return { filter: build({ notionId, niveau: parsedNiveau?.niveaux || null, alias }) };
}

/**
 * `GET /categories?theme=&niveau=&notionId=&notionNiveau=`
 * @returns {{ error: string }|{ filters: object }}
 */
function parseCategoriesQuery(query) {
  // Notion du programme choisie : seules les catégories qui la traitent sont proposées.
  // Sans ce filtre, le menu gardait ses 17 entrées dont la plupart ne tireraient rien.
  const categoryNotion = resolveNotionFilter(
    query,
    'quiz_categories',
    buildQuizCategoryNotionFilter,
  );
  if (categoryNotion.error) return { error: categoryNotion.error };
  return {
    filters: {
      theme: normalizeOptionalString(query?.theme),
      niveau: normalizeOptionalString(query?.niveau),
      categoryNotionFilter: categoryNotion.filter,
      // Même requête, même validité : seul l'alias change (compteurs de questions).
      questionNotionFilter: resolveNotionFilter(query, 'quiz_questions').filter || null,
    },
  };
}

/**
 * `GET /draw?categorieSlug=&niveau=&difficulte=&illustrated=&notionId=&notionNiveau=`.
 * La difficulté est contrôlée avant la notion (ordre des messages d'erreur).
 * @returns {{ error: string }|{ filters: object }}
 */
function parseDrawQuery(query) {
  const difficulteRaw = normalizeOptionalString(query?.difficulte);
  let difficulte = null;
  if (difficulteRaw != null) {
    difficulte = Number(difficulteRaw);
    if (!Number.isInteger(difficulte) || difficulte < 1) return { error: 'difficulte invalide' };
  }
  const illustrated = String(query?.illustrated || '');
  // Tirage « par notion du programme » : c'est ce qui permet à un professeur de lancer un
  // quiz sur « Biodiversité, résultat et étape de l'évolution » sans deviner quelles
  // catégories la traitent. L'héritage de catégorie est appliqué par le fragment.
  const notion = resolveNotionFilter(query, 'quiz_questions');
  if (notion.error) return { error: notion.error };
  return {
    filters: {
      categorieSlug: normalizeOptionalString(query?.categorieSlug),
      niveau: normalizeOptionalString(query?.niveau),
      difficulte,
      illustratedOnly: illustrated.trim() === '1' || illustrated.toLowerCase() === 'true',
      notionFilter: notion.filter,
    },
  };
}

/**
 * `GET /questions?theme=&categorieSlug=&niveau=&q=&notionId=&notionNiveau=`
 * @returns {{ error: string }|{ filters: object }}
 */
function parseCatalogQuery(query) {
  const notion = resolveNotionFilter(query, 'q');
  if (notion.error) return { error: notion.error };
  return {
    filters: {
      theme: normalizeOptionalString(query?.theme),
      categorieSlug: normalizeOptionalString(query?.categorieSlug),
      niveau: normalizeOptionalString(query?.niveau),
      q: normalizeOptionalString(query?.q),
      notionFilter: notion.filter,
    },
  };
}

// ---------------------------------------------------------------------------------------
// Glossaire
// ---------------------------------------------------------------------------------------

const glossaryLookupCache = getNamedMemoryTtlCache('fm-glossary-lookup', {
  ttlMs: 60_000,
  maxEntries: 4,
});

// Affichage des termes glossaire RECALCULÉ à la volée via le matcher (zéro lecture de la table de
// liens, iso-comportement avec l'écriture import/CRUD) — même patron que routes/gl/qcm.js.
async function loadGlossaryLookup(dbx = defaultDb) {
  const cached = glossaryLookupCache.get('actif');
  if (cached) return cached;
  const map = buildGlossaryLookupMap(await quizRepository.listActiveGlossaryTerms(dbx));
  glossaryLookupCache.set('actif', map);
  return map;
}

function glossaryTermsForQuestion(questionRow, glossaryByKey) {
  if (!questionRow) return [];
  return matchGlossaryTermsForSpecies(combineKeywords(questionRow), glossaryByKey);
}

// ---------------------------------------------------------------------------------------
// Catégories, tirage, catalogue public
// ---------------------------------------------------------------------------------------

/** Catégories, avec le compteur de questions actives du niveau demandé s'il y en a un. */
async function listCategories(filters, dbx = defaultDb) {
  const categories = await quizRepository.listCategories(
    { theme: filters.theme, notionFilter: filters.categoryNotionFilter },
    dbx,
  );
  if (!filters.niveau) return { categories };
  const counts = await quizRepository.countActiveQuestionsByCategory(
    { niveau: filters.niveau, notionFilter: filters.questionNotionFilter },
    dbx,
  );
  const countBySlug = new Map(counts.map((row) => [row.categorie_slug, Number(row.total || 0)]));
  return {
    categories: categories.map((cat) => ({
      ...cat,
      questionCount: countBySlug.get(cat.slug) || 0,
    })),
  };
}

/**
 * Tire une question active au hasard parmi les candidats filtrés.
 *
 * Questions réservées à la validation d'une fiche (sévérité `strict`) : jamais dans le
 * tirage libre, sinon l'élève y verrait la bonne réponse sans enjeu.
 *
 * Tirage uniforme SANS `ORDER BY RAND()` : celui-ci matérialise et trie la sélection entière
 * à chaque clic, et le coût croît avec le catalogue — une classe qui enchaîne les tirages
 * paie un tri complet par question (audit charge biodiversité 2026-09, P5). Deux requêtes
 * bornées à la place : le compte, puis un décalage aléatoire sur la clé primaire. La
 * distribution est la même.
 *
 * @param {object} filters sortie de `parseDrawQuery`
 * @param {{ dbx?: object, random?: () => number }} [options]
 * @returns {Promise<{ question_code: string }>}
 */
async function drawQuestionCode(filters, { dbx = defaultDb, random = Math.random } = {}) {
  const excludedCodes = await listStrictGatingQuestionCodes(
    { queryAll: dbx.queryAll, queryOne: dbx.queryOne },
    'fm',
  );
  const where = quizRepository.buildDrawWhere({ ...filters, excludedCodes });
  const total = await quizRepository.countDrawCandidates(where, dbx);
  if (total === 0) throw quizError(404, { error: 'Aucune question disponible' });
  const picked = await quizRepository.pickDrawCandidateAt(where, Math.floor(random() * total), dbx);
  if (!picked) throw quizError(404, { error: 'Aucune question disponible' });
  return { question_code: picked.question_code };
}

/**
 * La bonne réponse n'est exposée qu'à qui gère le catalogue. Le catalogue est **public** :
 * sans ce filtre, `GET /api/quiz/questions` livrait `reponse_correcte` pour toutes les
 * questions actives, à n'importe qui. Le mélange des choix et l'empreinte HMAC du jeton de
 * présentation ne protègent alors plus rien — la solution s'obtient sans même ouvrir le
 * QCM. Même règle que le catalogue GL (`routes/gl/qcm.js`, permission `gl.content.manage`).
 */
function canSeeCatalogAnswers(auth) {
  return hasPermission(auth, QUIZ_MANAGE_PERMISSION);
}

/** Catalogue public filtré (recherche plein texte sur l'énoncé et les tags). */
async function listCatalogQuestions(filters, { canSeeAnswers = false } = {}, dbx = defaultDb) {
  let rows = await quizRepository.listActiveCatalogQuestions(filters, dbx);
  if (filters.q) {
    const needle = filters.q.toLowerCase();
    rows = rows.filter((row) => `${row.question} ${row.tags || ''}`.toLowerCase().includes(needle));
  }
  return {
    items: rows.map((row) => ({
      question_code: row.question_code,
      theme: row.theme,
      categorie_slug: row.categorie_slug,
      numero_dans_categorie: row.numero_dans_categorie,
      question: row.question,
      niveau: row.niveau,
      difficulte: row.difficulte,
      difficulte_label: difficultyLabel(row.difficulte),
      ...(canSeeAnswers ? { reponse_correcte: row.reponse_correcte } : {}),
    })),
  };
}

// ---------------------------------------------------------------------------------------
// Présentation signée et réponse
// ---------------------------------------------------------------------------------------

/**
 * Présente une question : choix mélangés et jeton signé (la bonne réponse n'y figure qu'en
 * empreinte HMAC).
 *
 * Contexte de validation (`?resourceType=&resourceRef=`) : gravé dans le jeton. Sans
 * contexte, une question réservée (sévérité `strict`) est refusée. Dans le flux de
 * validation, une question verrouillée pour cet élève (portée ressource ou « question
 * seule ») n'est pas présentée : 403 + état du verrou.
 *
 * @param {{ code: string, query: object, getAuth: () => Promise<object|null> }} input
 *   `getAuth` n'est appelé que dans le flux de validation.
 */
async function presentQuizQuestion({ code, query, getAuth }, dbx = defaultDb) {
  const row = await quizRepository.findActiveQuestion(code, dbx);
  if (!row) throw quizError(404, { error: 'Question introuvable' });

  const db = { queryAll: dbx.queryAll, queryOne: dbx.queryOne };
  const context = await resolvePresentContext(db, { product: 'fm', query, questionCode: code });
  if (context.error) throw quizError(context.status || 400, { error: context.error });
  const allowed = await assertPresentAllowed(db, {
    product: 'fm',
    questionCode: code,
    resource: context.resource,
  });
  if (!allowed.ok) {
    throw quizError(allowed.status || 403, {
      error: allowed.error,
      reserved_for: allowed.reserved_for,
    });
  }
  if (context.resource) {
    const auth = await getAuth();
    const open = await assertQuestionOpen(db, {
      product: 'fm',
      userId: auth?.userId || null,
      resource: context.resource,
      questionCode: code,
    });
    if (!open.ok) throw quizError(open.status, { error: open.error, cooldown: open.cooldown });
  }

  const glossaryTerms = glossaryTermsForQuestion(row, await loadGlossaryLookup());
  try {
    return presentQuestion(row, glossaryTerms, { ...QCM_OPTIONS, resource: context.resource });
  } catch (err) {
    throw quizError(400, { error: err.message || 'Présentation impossible' });
  }
}

/**
 * Verrou de re-tentative ForetMap : ne s'active que dans le flux de validation « Marquer
 * comme acquis », c'est-à-dire avec un contexte ressource. Ce contexte vient du JETON de
 * présentation (gravé par `GET …/present?resourceType=&resourceRef=`) ; le corps de la
 * requête n'est honoré que si la sévérité effective de la ressource est `advisory`
 * (lib/learningGatingLockMode.js).
 */
async function maybeRegisterCooldown(dbx, { userId, questionCode, isCorrect, result, body }) {
  const db = { queryAll: dbx.queryAll, queryOne: dbx.queryOne, execute: dbx.execute };
  const context = await resolveAnswerContext(db, {
    product: 'fm',
    tokenResource: result?.resource || null,
    bodyResource: body || null,
  });
  if (!context) return null;
  return registerFmCooldownOnWrongIfGating(db, {
    userId,
    resourceType: context.type,
    resourceRef: context.ref,
    questionCode,
    isCorrect,
  });
}

/**
 * Vérifie la réponse, consomme le jeton et enregistre la tentative. Renvoie soit le corps
 * de la réponse, soit un refus attendu (`failure`) ; toute exception est traduite en 400
 * par l'appelant.
 */
async function checkAndRecordAnswer(row, { code, body, getAuth }, dbx) {
  const result = verifyPresentationAnswer(
    body?.presentationToken,
    code,
    body?.choiceId,
    QCM_OPTIONS,
  );
  const auth = await getAuth();
  // Question verrouillée entre-temps (autre onglet, tolérance épuisée) : refus AVANT de
  // consommer le jeton et d'enregistrer la tentative.
  if (result.resource && auth?.userId) {
    const open = await assertQuestionOpen(
      { queryAll: dbx.queryAll, queryOne: dbx.queryOne },
      { product: 'fm', userId: auth.userId, resource: result.resource, questionCode: code },
    );
    if (!open.ok) {
      return {
        failure: { status: open.status, body: { error: open.error, cooldown: open.cooldown } },
      };
    }
  }
  // Usage unique du jeton : sans cela, le même `presentationToken` permettait d'essayer tous
  // les `choiceId` jusqu'à trouver la bonne réponse — y compris pour débloquer un
  // conditionnement (fiche / tutoriel) sans l'avoir apprise.
  const consumption = await consumePresentationJti(
    { execute: dbx.execute },
    { jti: result.jti, gameId: null, teamId: null, questionCode: code },
  );
  if (consumption === 'already_used') {
    return { failure: { status: 409, body: { error: 'Présentation déjà utilisée' } } };
  }
  const glossaryTerms = glossaryTermsForQuestion(row, await loadGlossaryLookup());

  if (auth?.userId) {
    await quizRepository.insertAttempt(
      {
        userId: auth.userId,
        questionCode: code,
        categorieSlug: row.categorie_slug,
        isCorrect: result.correct,
      },
      dbx,
    );
  }

  // Contexte ressource (présent uniquement depuis le flux « Marquer comme acquis ») : sur une
  // mauvaise réponse à une question bloquante, pose le verrou de re-tentative (cf. cooldown).
  const cooldown = auth?.userId
    ? await maybeRegisterCooldown(dbx, {
        userId: auth.userId,
        questionCode: code,
        isCorrect: result.correct,
        result,
        body,
      })
    : null;

  return {
    body: {
      correct: result.correct,
      feedback: resolveQcmAnswerFeedback(row, result),
      correctChoiceId: result.correct ? result.correctChoiceId : undefined,
      glossaryTerms: result.correct ? glossaryTerms : undefined,
      cooldown: cooldown || undefined,
    },
  };
}

/**
 * Vérifie une réponse à une présentation signée.
 *
 * Contrat historique conservé : toute erreur survenue après le chargement de la question
 * (jeton invalide, choix invalide, mais aussi échec d'écriture) est renvoyée en 400 avec son
 * message.
 *
 * @param {{ code: string, body: object, getAuth: () => Promise<object|null> }} input
 *   `body` : corps de la requête (`presentationToken`, `choiceId`, contexte ressource
 *   éventuel pour la sévérité `advisory`)
 */
async function answerQuizQuestion({ code, body, getAuth }, dbx = defaultDb) {
  const row = await quizRepository.findActiveQuestion(code, dbx);
  if (!row) throw quizError(404, { error: 'Question introuvable' });
  let outcome;
  try {
    outcome = await checkAndRecordAnswer(row, { code, body, getAuth }, dbx);
  } catch (err) {
    throw quizError(400, { error: err.message || 'Réponse invalide' });
  }
  if (outcome.failure) throw quizError(outcome.failure.status, outcome.failure.body);
  return outcome.body;
}

// ---------------------------------------------------------------------------------------
// Statistiques
// ---------------------------------------------------------------------------------------

/** Progression d'un compte : totaux, par catégorie, vingt dernières tentatives. */
async function getLearnerProgress(userId, dbx = defaultDb) {
  const summary = await quizRepository.loadLearnerAttemptSummary(userId, dbx);
  const byCategory = await quizRepository.listLearnerAttemptsByCategory(userId, dbx);
  const recent = await quizRepository.listLearnerRecentAttempts(userId, dbx);
  return {
    attempts: Number(summary?.attempts || 0),
    correct: Number(summary?.correct || 0),
    byCategory,
    recent,
  };
}

/** Tentatives agrégées par élève et par catégorie (vue enseignant). */
async function getAttemptStats(dbx = defaultDb) {
  const byStudent = await quizRepository.listAttemptsByStudent(dbx);
  const byCategory = await quizRepository.listAttemptsByCategory(dbx);
  return { byStudent, byCategory };
}

/** Composition du catalogue actif (thèmes, catégories, difficultés, liens glossaire). */
async function getCatalogStats(dbx = defaultDb) {
  const total = await quizRepository.countActiveQuestions(dbx);
  const byTheme = await quizRepository.countActiveQuestionsByTheme(dbx);
  const byCategory = await quizRepository.countActiveQuestionsPerCategory(dbx);
  const byDifficulte = await quizRepository.countActiveQuestionsByDifficulty(dbx);
  const glossaryLinks = await quizRepository.countApprovedGlossaryLinks(dbx);
  return {
    total: Number(total?.total || 0),
    glossaryLinks: Number(glossaryLinks?.total || 0),
    byTheme,
    byCategory,
    byDifficulte,
  };
}

/**
 * Taux de réussite par question, les plus ratées d'abord. Une question que tout le monde
 * rate est plus souvent mal formulée que difficile — et si elle est bloquante, elle bloque
 * toute une classe sans raison.
 */
async function getQuestionSuccessStats({ onlyGating, minAttempts }, dbx = defaultDb) {
  const stats = await listFmQuestionStats({ queryAll: dbx.queryAll }, { onlyGating, minAttempts });
  return {
    stats,
    min_attempts_for_flag: MIN_ATTEMPTS_FOR_FLAG,
    suspect_success_rate: SUSPECT_SUCCESS_RATE,
  };
}

// ---------------------------------------------------------------------------------------
// Administration du catalogue
// ---------------------------------------------------------------------------------------

/** Liste complète (catalogue admin). */
async function listAdminQuestions(options, dbx = defaultDb) {
  const items = await listAdminQuestionsCrud({ queryAll: dbx.queryAll }, options);
  return { items, total: items.length };
}

/** Prochain code libre `QFnnnn`. */
async function allocateQuestionCode(dbx = defaultDb) {
  return { question_code: await allocateNextQuizQuestionCode({ queryOne: dbx.queryOne }) };
}

/** Fiche admin d'une question (toutes colonnes, thème et nom de catégorie). */
async function getAdminQuestion(code, dbx = defaultDb) {
  const question = await loadAdminQuestionDetail({ queryOne: dbx.queryOne }, code);
  if (!question) throw quizError(404, { error: 'Question introuvable' });
  return { question };
}

/**
 * Crée (`code` absent) ou met à jour une question, avec ses liens par mots-clés dans la
 * même transaction (service des liens). Les erreurs du socle (400 validation, 404, 409)
 * gardent leur statut ; toute autre erreur est renvoyée en 400 (contrat historique).
 *
 * @param {object} body corps de la requête
 * @param {{ code?: string|null, withTransaction?: Function }} [options]
 */
async function saveQuestion(
  body,
  { code = null, withTransaction = defaultDb.withTransaction } = {},
) {
  const options = code ? { question_code: code, requireExisting: true } : { requireNew: true };
  try {
    const result = await upsertQuizQuestionInTransaction(withTransaction, body || {}, options);
    return result.question;
  } catch (err) {
    const fallback = code ? 'Mise à jour impossible' : 'Création impossible';
    throw quizError(err.statusCode || 400, { error: err.message || fallback });
  }
}

/** Classeur modèle d'import. */
async function buildTemplateWorkbook() {
  return buildFmQuizTemplateWorkbook();
}

/**
 * Classeur d'export filtré. `statut` : `all`, sinon `actif` (toute autre valeur).
 * @param {object} query `statut`, `theme`, `categorieSlug`
 */
async function buildExportWorkbook(query, dbx = defaultDb) {
  const statutRaw = String(query?.statut || 'actif').toLowerCase();
  const data = await loadFmQuizExportRows(
    { queryAll: dbx.queryAll },
    {
      statut: statutRaw === 'all' ? 'all' : 'actif',
      theme: normalizeOptionalString(query?.theme),
      categorieSlug: normalizeOptionalString(query?.categorieSlug),
    },
  );
  return buildFmQuizExportWorkbook(data);
}

/**
 * Import d'un classeur (catégories + questions), en simulation si `body.dryRun`.
 *
 * G4 (audit 2026-09) : même garde que les imports GL. L'import vide d'abord ses liens par
 * mots-clés de `resource_question_links` (origin='keyword', service des liens) puis les
 * reconstruit. Sans transaction, une interruption (kill LVE, exception) laissait le
 * catalogue de questions à jour et ces rattachements glossaire effacés.
 */
async function importQuestions(body, { withTransaction = defaultDb.withTransaction } = {}) {
  const dryRun = !!body?.dryRun;
  let parsed;
  try {
    parsed = await resolveImportRows(body || {});
  } catch (err) {
    throw quizError(400, { error: err.message || 'Fichier import invalide' });
  }
  const { categoryRows, questionRows } = parsed;
  if (!Array.isArray(questionRows) || questionRows.length === 0) {
    throw quizError(400, { error: 'Feuille questions vide ou absente' });
  }
  if (questionRows.length > MAX_IMPORT_ROWS) {
    throw quizError(400, { error: `Trop de lignes (max ${MAX_IMPORT_ROWS})` });
  }
  try {
    return await withTransaction(async (tx) =>
      applyFmQuizImport(
        { queryAll: tx.queryAll, execute: tx.execute },
        categoryRows || [],
        questionRows,
        {
          dryRun,
        },
      ),
    );
  } catch (err) {
    throw quizError(400, { error: err.message || 'Import impossible' });
  }
}

module.exports = {
  FM_QCM_JWT_KIND,
  QUIZ_MANAGE_PERMISSION,
  difficultyLabel,
  quizError,
  isQuizError,
  resolveNotionFilter,
  parseCategoriesQuery,
  parseDrawQuery,
  parseCatalogQuery,
  loadGlossaryLookup,
  listCategories,
  drawQuestionCode,
  canSeeCatalogAnswers,
  listCatalogQuestions,
  presentQuizQuestion,
  answerQuizQuestion,
  getLearnerProgress,
  getAttemptStats,
  getCatalogStats,
  getQuestionSuccessStats,
  listAdminQuestions,
  allocateQuestionCode,
  getAdminQuestion,
  saveQuestion,
  buildTemplateWorkbook,
  buildExportWorkbook,
  importQuestions,
};
