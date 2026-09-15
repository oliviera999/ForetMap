'use strict';

/**
 * Erreur porteuse d'un statut HTTP, à lever depuis un helper métier et à traduire en réponse
 * par la route. Neuf copies locales coexistaient sous deux formes — `err.status` (Moodle, LTI,
 * marché G&L) et `err.statusCode` (`questionCrudCore`) — chaque famille de routes ne lisant
 * que la sienne (audit du 13/09/2026, §3.2). Celle-ci pose **les deux** propriétés : un
 * gestionnaire écrit pour l'une comme pour l'autre la comprend.
 *
 * @param {number} status
 * @param {string} message
 * @param {object} [extra] champs supplémentaires (`code`, `details`…)
 */
function httpError(status, message, extra = {}) {
  const err = new Error(message);
  err.status = status;
  err.statusCode = status;
  Object.assign(err, extra);
  return err;
}

/** Statut HTTP d'une erreur (l'une ou l'autre convention), sinon `fallback`. */
function httpErrorStatus(err, fallback = 500) {
  const raw = err?.statusCode ?? err?.status;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 400 && n <= 599 ? n : fallback;
}

module.exports = { httpError, httpErrorStatus };
