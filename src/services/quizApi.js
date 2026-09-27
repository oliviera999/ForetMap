import { api } from './api';

/**
 * Client API du domaine quiz (`/api/quiz`), étape B2 de la piste B de l'audit du
 * 25/09/2026 : fines enveloppes autour du transport `api()`, pour que les composants ne
 * connaissent plus les URL (patron de `moodleAdminApi.js` et `biodivApi.js`).
 *
 * Les URL produites sont exactement celles qu'écrivaient les composants : même ordre des
 * paramètres, paramètres vides omis, et `?` toujours présent sur le tirage.
 */

const BASE = '/api/quiz';

/**
 * Chaîne de requête dans l'ordre des clés reçues ; valeurs vides (`''`, `null`,
 * `undefined`, `false`) omises.
 * @param {Record<string, unknown>} [params]
 */
function toQueryString(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value === '' || value == null || value === false) continue;
    search.set(key, String(value));
  }
  return search.toString();
}

/**
 * Chemins de l'API quiz, pour les composants partagés (catalogue, éditeur) qui reçoivent
 * des chemins plutôt qu'un client.
 */
export const quizApiPaths = {
  categories: () => `${BASE}/categories`,
  adminBase: `${BASE}/admin`,
  adminQuestions: `${BASE}/admin/questions`,
  present: (code) => `${BASE}/questions/${encodeURIComponent(code)}/present`,
  answer: (code) => `${BASE}/questions/${encodeURIComponent(code)}/answer`,
};

/**
 * Catégories de quiz (`?theme=&niveau=&notionId=|notionNiveau=`), avec `questionCount`
 * quand un niveau est demandé.
 * @param {{ theme?: string, niveau?: string, notionId?: string, notionNiveau?: string }} [params]
 * @returns {Promise<{ categories: Array<object> }>}
 */
export function fetchQuizCategories(params = {}) {
  const qs = toQueryString(params);
  return api(`${quizApiPaths.categories()}${qs ? `?${qs}` : ''}`);
}

/**
 * Tire une question au hasard parmi les filtres.
 * @param {{ categorieSlug?: string, niveau?: string, difficulte?: string|number,
 *   illustrated?: string, notionId?: string, notionNiveau?: string }} [params]
 * @returns {Promise<{ question_code: string }>}
 */
export function drawQuizQuestion(params = {}) {
  return api(`${BASE}/draw?${toQueryString(params)}`);
}

/**
 * Présentation signée d'une question (choix mélangés, jeton de présentation).
 * @param {string} code
 */
export function presentQuizQuestion(code) {
  return api(quizApiPaths.present(code));
}

/**
 * Réponse à une présentation.
 * @param {string} code
 * @param {{ presentationToken: string, choiceId: number }} answer
 * @returns {Promise<{ correct: boolean, feedback: string, correctChoiceId?: number,
 *   glossaryTerms?: Array<object>, cooldown?: object }>}
 */
export function answerQuizQuestion(code, { presentationToken, choiceId }) {
  return api(quizApiPaths.answer(code), 'POST', { presentationToken, choiceId });
}

/** Progression du compte connecté (totaux, par catégorie, tentatives récentes). */
export function fetchQuizProgress() {
  return api(`${BASE}/me/progress`);
}

/** Tentatives agrégées par élève et par catégorie (permission `stats.read.all`). */
export function fetchQuizAttemptStats() {
  return api(`${BASE}/stats`);
}

export const quizApi = {
  paths: quizApiPaths,
  categories: fetchQuizCategories,
  draw: drawQuizQuestion,
  present: presentQuizQuestion,
  answer: answerQuizQuestion,
  progress: fetchQuizProgress,
  attemptStats: fetchQuizAttemptStats,
};
