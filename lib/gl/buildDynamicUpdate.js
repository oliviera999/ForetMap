'use strict';

/**
 * Builder déclaratif d'UPDATE partiel (O-audit §4) : remplace les chaînes de
 * `if (Object.prototype.hasOwnProperty.call(req.body, 'x')) { updates.push(...); params.push(...); }`
 * des routes chapters/games par une table de specs.
 *
 * Sémantique préservée champ par champ :
 * - un champ n'est traité QUE s'il est présent dans le body (hasOwnProperty sur la clé
 *   ou l'un de ses alias) — « présent mais null » reste distinct de « absent » ;
 * - la valeur brute est lue avec la précédence historique `body.clé ?? body.alias`
 *   (le premier non nullish gagne) ;
 * - `parse` (sync ou async) reçoit la valeur brute et retourne `{ value }` (poussé tel
 *   quel, y compris null) ou `{ error }` (la construction s'arrête au premier échec,
 *   dans l'ordre des specs = ordre historique des if).
 *
 * @param {object|null|undefined} body corps de requête (req.body)
 * @param {Array<{ key: string, aliases?: string[], column: string,
 *                 parse?: (raw: any, body: object) => ({ value: any } | { error: string } | Promise<any>) }>} fieldSpecs
 * @returns {Promise<{ updates: string[], params: any[], error: string | null }>}
 */
async function buildDynamicUpdate(body, fieldSpecs) {
  const src = body && typeof body === 'object' ? body : {};
  const updates = [];
  const params = [];
  for (const spec of fieldSpecs) {
    const keys = [spec.key, ...(spec.aliases || [])];
    if (!keys.some((k) => Object.prototype.hasOwnProperty.call(src, k))) continue;
    let raw;
    for (const k of keys) raw = raw ?? src[k];
    const result = spec.parse ? await spec.parse(raw, src) : { value: raw };
    if (result && result.error) {
      return { updates: [], params: [], error: result.error };
    }
    updates.push(`${spec.column} = ?`);
    params.push(result ? result.value : raw);
  }
  return { updates, params, error: null };
}

/** Vrai si au moins un champ des specs est présent dans le body (sans le parser). */
function hasAnyDynamicField(body, fieldSpecs) {
  const src = body && typeof body === 'object' ? body : {};
  return fieldSpecs.some((spec) =>
    [spec.key, ...(spec.aliases || [])].some((k) => Object.prototype.hasOwnProperty.call(src, k)),
  );
}

module.exports = { buildDynamicUpdate, hasAnyDynamicField };
