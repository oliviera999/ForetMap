'use strict';

function normalizeOptionalString(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

function parsePageQuery(query, options = {}) {
  const defaultPageSize = parsePositiveInt(options.defaultPageSize, 20);
  const maxPageSize = parsePositiveInt(options.maxPageSize, 50);
  const page = parsePositiveInt(query?.page, 1);
  const pageSize = Math.min(maxPageSize, parsePositiveInt(query?.page_size, defaultPageSize));
  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset };
}

function buildInClauseParams(values = []) {
  if (!Array.isArray(values) || values.length === 0) {
    return { clause: '(NULL)', params: [] };
  }
  return {
    clause: `(${values.map(() => '?').join(',')})`,
    params: values,
  };
}

/**
 * Convertit un identifiant (paramètre d'URL ou de corps) en nombre, ou `null` si non numérique.
 * Coercition permissive volontaire (`Number(value)`) : accepte entiers, décimaux et chaînes
 * numériques ; seul `NaN`/`Infinity` donne `null`.
 *
 * Source unique partagée : cette implémentation était auparavant recopiée à l'identique dans
 * les 9 sous-routeurs `routes/gl/games/*.js`.
 *
 * @param {*} value
 * @returns {number|null}
 */
function parseId(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

module.exports = {
  normalizeOptionalString,
  parsePositiveInt,
  parsePageQuery,
  buildInClauseParams,
  parseId,
};
