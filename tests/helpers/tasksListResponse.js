'use strict';

/** Plafond API (`TASKS_LIST_MAX_LIMIT`) — à passer en `?limit=` dans les tests de liste. */
const TASKS_LIST_TEST_LIMIT = 500;

/**
 * Extrait les tâches d'une réponse `GET /api/tasks` (enveloppe paginée ou tableau legacy).
 * @param {unknown} body
 * @returns {object[]}
 */
function tasksListItems(body) {
  if (Array.isArray(body)) return body;
  if (body && typeof body === 'object' && Array.isArray(body.items)) return body.items;
  return [];
}

module.exports = { tasksListItems, TASKS_LIST_TEST_LIMIT };
