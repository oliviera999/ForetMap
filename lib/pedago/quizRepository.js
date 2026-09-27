'use strict';

/**
 * Accès aux données du quiz ForetMap — SQL seulement, aucune règle métier (étape B2 de la
 * piste B, audit du 25/09/2026, § 3.1). Les règles (filtres, tirage, présentation signée,
 * statistiques) vivent dans `lib/pedago/quizService.js`.
 *
 * Tables propriétaires : `quiz_questions`, `quiz_categories`, `user_quiz_attempts`. Le CRUD
 * admin et l'import restent dans `lib/fmQuizCrud.js` / `lib/fmQuizImport.js` (socle partagé
 * avec les QCM G&L).
 *
 * Chaque fonction prend un exécuteur `dbx` en dernier argument : la base par défaut, ou un
 * `tx` fourni par `withTransaction` — patron de `lib/tasks/taskQueries.js`.
 */

const { queryAll, queryOne, execute, withTransaction } = require('../../database');

/** Exécuteur par défaut : le pool (avec `withTransaction` disponible). */
const defaultDb = { queryAll, queryOne, execute, withTransaction };

/**
 * Colonnes d'une question servie à l'élève (présentation, réponse, feedback).
 * `difficulte_label` n'est plus lu (audit du 25/09/2026, § 3.5, T1) : le libellé se dérive
 * de `difficulte` (`difficultyLabel`, lib/pedago/quizService.js).
 */
const QUESTION_SELECT = `
  SELECT question_code, categorie_slug, numero_dans_categorie, question,
         choix_a, choix_b, choix_c, choix_d, choix_e,
         reponse_correcte, reponse_texte, niveau, difficulte,
         tags,
         feedback_correct, feedback_a, feedback_b, feedback_c, feedback_d, feedback_e,
         photo_url, photo_credit, photo_licence, photo_legende, statut
    FROM quiz_questions
`;

/** Ajoute un fragment `{ sql, params }` (filtre de notion) à une requête en construction. */
function appendFragment(query, fragment) {
  if (!fragment) return;
  query.sql += fragment.sql;
  query.params.push(...fragment.params);
}

/** Question active par code (`null` si absente ou inactive). */
async function findActiveQuestion(code, dbx = defaultDb) {
  return dbx.queryOne(`${QUESTION_SELECT} WHERE question_code = ? AND statut = 'actif' LIMIT 1`, [
    code,
  ]);
}

/** Termes de glossaire actifs, pour le rapprochement par mots-clés. */
async function listActiveGlossaryTerms(dbx = defaultDb) {
  return dbx.queryAll(
    `SELECT glossary_code, terme, variantes, categorie, definition_courte
       FROM glossary_terms WHERE statut = 'actif'`,
  );
}

/**
 * Catégories de quiz, éventuellement filtrées par thème et par notion du programme.
 * @param {{ theme?: string|null, notionFilter?: { sql: string, params: unknown[] }|null }} filters
 */
async function listCategories({ theme = null, notionFilter = null } = {}, dbx = defaultDb) {
  const query = {
    sql: `SELECT slug, nom, emoji, theme, description, order_index
                 FROM quiz_categories
                WHERE 1=1`,
    params: [],
  };
  if (theme) {
    query.sql += ' AND theme = ?';
    query.params.push(theme);
  }
  appendFragment(query, notionFilter);
  query.sql += ' ORDER BY order_index ASC, nom ASC';
  return dbx.queryAll(query.sql, query.params);
}

/** Nombre de questions actives d'un niveau, par catégorie (notion optionnelle). */
async function countActiveQuestionsByCategory({ niveau, notionFilter = null }, dbx = defaultDb) {
  const query = {
    sql: `SELECT categorie_slug, COUNT(*) AS total
                        FROM quiz_questions
                       WHERE statut = 'actif' AND niveau = ?`,
    params: [niveau],
  };
  appendFragment(query, notionFilter);
  query.sql += ' GROUP BY categorie_slug';
  return dbx.queryAll(query.sql, query.params);
}

/**
 * Clause `WHERE` du tirage, construite une fois et partagée par le compte et la sélection.
 * @param {{ categorieSlug?: string|null, niveau?: string|null, difficulte?: number|null,
 *   illustratedOnly?: boolean, notionFilter?: object|null, excludedCodes?: string[] }} filters
 * @returns {{ sql: string, params: unknown[] }}
 */
function buildDrawWhere({
  categorieSlug = null,
  niveau = null,
  difficulte = null,
  illustratedOnly = false,
  notionFilter = null,
  excludedCodes = [],
} = {}) {
  const where = { sql: `WHERE statut = 'actif'`, params: [] };
  if (categorieSlug) {
    where.sql += ' AND categorie_slug = ?';
    where.params.push(categorieSlug);
  }
  if (niveau) {
    where.sql += ' AND niveau = ?';
    where.params.push(niveau);
  }
  if (difficulte != null) {
    where.sql += ' AND difficulte = ?';
    where.params.push(difficulte);
  }
  if (illustratedOnly) {
    where.sql += " AND photo_url IS NOT NULL AND TRIM(photo_url) <> ''";
  }
  appendFragment(where, notionFilter);
  if (excludedCodes.length > 0) {
    where.sql += ` AND question_code NOT IN (${excludedCodes.map(() => '?').join(', ')})`;
    where.params.push(...excludedCodes);
  }
  return where;
}

/** Nombre de candidats au tirage. */
async function countDrawCandidates(where, dbx = defaultDb) {
  const row = await dbx.queryOne(
    `SELECT COUNT(*) AS c FROM quiz_questions ${where.sql}`,
    where.params,
  );
  return Number(row?.c) || 0;
}

/**
 * Candidat au rang `offset` dans l'ordre de la clé primaire (accès indexé, ordre stable).
 * Valeurs LIMIT/OFFSET en chaîne : mysql2 encoderait un nombre JS en DOUBLE.
 */
async function pickDrawCandidateAt(where, offset, dbx = defaultDb) {
  return dbx.queryOne(
    `SELECT question_code FROM quiz_questions ${where.sql} ORDER BY question_code ASC LIMIT ? OFFSET ?`,
    [...where.params, '1', String(offset)],
  );
}

/**
 * Questions actives du catalogue public, avec le thème de leur catégorie (sans
 * `difficulte_label`, dérivé par le service).
 * @param {{ theme?: string|null, categorieSlug?: string|null, niveau?: string|null,
 *   notionFilter?: object|null }} filters
 */
async function listActiveCatalogQuestions(
  { theme = null, categorieSlug = null, niveau = null, notionFilter = null } = {},
  dbx = defaultDb,
) {
  const query = {
    sql: `
      SELECT q.question_code, q.categorie_slug, q.numero_dans_categorie, q.question,
             q.niveau, q.difficulte, q.reponse_correcte, q.tags,
             c.theme
        FROM quiz_questions q
        JOIN quiz_categories c ON c.slug = q.categorie_slug
       WHERE q.statut = 'actif'`,
    params: [],
  };
  if (theme) {
    query.sql += ' AND c.theme = ?';
    query.params.push(theme);
  }
  if (categorieSlug) {
    query.sql += ' AND q.categorie_slug = ?';
    query.params.push(categorieSlug);
  }
  if (niveau) {
    query.sql += ' AND q.niveau = ?';
    query.params.push(niveau);
  }
  appendFragment(query, notionFilter);
  query.sql += ' ORDER BY c.theme ASC, q.categorie_slug ASC, q.numero_dans_categorie ASC';
  return dbx.queryAll(query.sql, query.params);
}

/** Enregistre une tentative d'un compte connecté. */
async function insertAttempt({ userId, questionCode, categorieSlug, isCorrect }, dbx = defaultDb) {
  return dbx.execute(
    `INSERT INTO user_quiz_attempts (user_id, question_code, categorie_slug, is_correct)
           VALUES (?, ?, ?, ?)`,
    [userId, questionCode, categorieSlug || null, isCorrect ? 1 : 0],
  );
}

/** Total des tentatives et bonnes réponses d'un compte. */
async function loadLearnerAttemptSummary(userId, dbx = defaultDb) {
  return dbx.queryOne(
    `SELECT COUNT(*) AS attempts,
              SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS correct
         FROM user_quiz_attempts
        WHERE user_id = ?`,
    [userId],
  );
}

/** Tentatives d'un compte par catégorie. */
async function listLearnerAttemptsByCategory(userId, dbx = defaultDb) {
  return dbx.queryAll(
    `SELECT categorie_slug,
              COUNT(*) AS attempts,
              SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS correct
         FROM user_quiz_attempts
        WHERE user_id = ?
        GROUP BY categorie_slug
        ORDER BY categorie_slug ASC`,
    [userId],
  );
}

/** Vingt dernières tentatives d'un compte. */
async function listLearnerRecentAttempts(userId, dbx = defaultDb) {
  return dbx.queryAll(
    `SELECT question_code, categorie_slug, is_correct, answered_at
         FROM user_quiz_attempts
        WHERE user_id = ?
        ORDER BY answered_at DESC
        LIMIT 20`,
    [userId],
  );
}

/** Tentatives agrégées par élève (vue enseignant). */
async function listAttemptsByStudent(dbx = defaultDb) {
  return dbx.queryAll(
    `SELECT u.id AS user_id, u.first_name, u.last_name, u.pseudo,
              COUNT(*) AS attempts,
              SUM(CASE WHEN uqa.is_correct = 1 THEN 1 ELSE 0 END) AS correct
         FROM user_quiz_attempts uqa
         JOIN users u ON u.id = uqa.user_id
        GROUP BY u.id, u.first_name, u.last_name, u.pseudo
        ORDER BY attempts DESC, u.last_name ASC`,
  );
}

/** Tentatives agrégées par catégorie (vue enseignant). */
async function listAttemptsByCategory(dbx = defaultDb) {
  return dbx.queryAll(
    `SELECT categorie_slug,
              COUNT(*) AS attempts,
              SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS correct
         FROM user_quiz_attempts
        WHERE categorie_slug IS NOT NULL AND categorie_slug <> ''
        GROUP BY categorie_slug
        ORDER BY categorie_slug ASC`,
  );
}

/** Nombre de questions actives. */
async function countActiveQuestions(dbx = defaultDb) {
  return dbx.queryOne(`SELECT COUNT(*) AS total FROM quiz_questions WHERE statut = 'actif'`);
}

/** Questions actives par thème de catégorie. */
async function countActiveQuestionsByTheme(dbx = defaultDb) {
  return dbx.queryAll(
    `SELECT c.theme, COUNT(*) AS effectif
         FROM quiz_questions q
         JOIN quiz_categories c ON c.slug = q.categorie_slug
        WHERE q.statut = 'actif'
        GROUP BY c.theme
        ORDER BY effectif DESC`,
  );
}

/** Questions actives par catégorie (effectif décroissant). */
async function countActiveQuestionsPerCategory(dbx = defaultDb) {
  return dbx.queryAll(
    `SELECT categorie_slug, COUNT(*) AS effectif
         FROM quiz_questions WHERE statut = 'actif'
        GROUP BY categorie_slug ORDER BY effectif DESC`,
  );
}

/** Questions actives par difficulté (croissante). */
async function countActiveQuestionsByDifficulty(dbx = defaultDb) {
  return dbx.queryAll(
    `SELECT difficulte, COUNT(*) AS effectif
         FROM quiz_questions WHERE statut = 'actif'
        GROUP BY difficulte ORDER BY difficulte ASC`,
  );
}

/**
 * Liens glossaire ↔ question approuvés. Lecture seule d'une table du service des liens
 * (`lib/pedago/learningLinks.js`), qui n'expose pas encore de compteur.
 */
async function countApprovedGlossaryLinks(dbx = defaultDb) {
  return dbx.queryOne(
    `SELECT COUNT(*) AS total FROM resource_question_links
        WHERE resource_type = 'glossary' AND status = 'approved'`,
  );
}

module.exports = {
  defaultDb,
  QUESTION_SELECT,
  findActiveQuestion,
  listActiveGlossaryTerms,
  listCategories,
  countActiveQuestionsByCategory,
  buildDrawWhere,
  countDrawCandidates,
  pickDrawCandidateAt,
  listActiveCatalogQuestions,
  insertAttempt,
  loadLearnerAttemptSummary,
  listLearnerAttemptsByCategory,
  listLearnerRecentAttempts,
  listAttemptsByStudent,
  listAttemptsByCategory,
  countActiveQuestions,
  countActiveQuestionsByTheme,
  countActiveQuestionsPerCategory,
  countActiveQuestionsByDifficulty,
  countApprovedGlossaryLinks,
};
