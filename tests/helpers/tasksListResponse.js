'use strict';

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

module.exports = { tasksListItems };
