'use strict';

/**
 * Vérification des **droits réels** du compte MySQL `DB_MCP_USER` (contre-vérification de la
 * PR #616, B1.2).
 *
 * `foretmap_sql_select` n'est sûr que si le compte qui l'exécute ne peut **rien lire d'autre**
 * que les tables de contenu : c'est la barrière qui tient même quand l'analyse syntaxique se
 * trompe (cas des commentaires exécutables `/*! … *\/`). On ne se fie donc pas à la
 * documentation : on lit `SHOW GRANTS FOR CURRENT_USER()` sur le pool dédié, au premier usage
 * puis toutes les `CHECK_TTL_MS`, et l'outil est indisponible (absent de `tools/list`,
 * refusé à l'appel, raison journalisée) si une ligne n'est pas **exactement** admise.
 *
 * Lignes admises (tout le reste est refusé — y compris une forme inconnue) :
 * - `GRANT USAGE ON *.* TO …` (éventuellement suivi de `IDENTIFIED BY PASSWORD …`, de
 *   `REQUIRE …`, de `WITH MAX_…`) ;
 * - `GRANT SELECT ON \`base\`.\`table\` TO …` avec `base` = la base de l'application et
 *   `table` ∈ `CONTENT_TABLES` ;
 * - `GRANT SELECT (\`col\`, …) ON \`base\`.\`table\` TO …` (droit de colonnes, plus étroit),
 *   même condition.
 *
 * Refusés notamment : tout droit global autre que `USAGE`, tout droit au niveau base
 * (`ON \`base\`.*`), tout privilège autre que `SELECT`, `WITH GRANT OPTION`, une table hors
 * liste blanche ou d'une autre base, un rôle (`GRANT \`role\` TO …`), `PROXY`, une
 * procédure ou fonction (`ON PROCEDURE` / `ON FUNCTION`).
 */

const { CONTENT_TABLES } = require('./sqlGuard');

const CHECK_TTL_MS = 5 * 60 * 1000;

const USAGE_RE =
  /^GRANT USAGE ON \*\.\* TO [`'][^`']+[`']@[`'][^`']+[`'](?: IDENTIFIED (?:BY PASSWORD '[^']*'|VIA [\s\S]*))?(?: REQUIRE [A-Z0-9 ]+)?(?: WITH (?:MAX_[A-Z_]+ \d+ ?)+)?$/;
const SELECT_TABLE_RE =
  /^GRANT SELECT(?: \((?:`[A-Za-z0-9_]+`(?:, )?)+\))? ON `([A-Za-z0-9_$]+)`\.`([A-Za-z0-9_$]+)` TO [`'][^`']+[`']@[`'][^`']+[`']$/;

/**
 * Analyse les lignes de `SHOW GRANTS`.
 * @param {string[]} lines
 * @param {string} dbName base de l'application
 * @returns {{ ok: true, tables: string[] } | { ok: false, reason: string }}
 */
function evaluateGrants(lines, dbName) {
  if (!Array.isArray(lines) || lines.length === 0) {
    return { ok: false, reason: 'aucun droit lisible' };
  }
  const tables = new Set();
  for (const raw of lines) {
    const line = String(raw || '').trim();
    if (/\bWITH GRANT OPTION\b/i.test(line)) {
      return { ok: false, reason: 'droit de transmission (WITH GRANT OPTION)' };
    }
    if (USAGE_RE.test(line)) continue;
    const m = SELECT_TABLE_RE.exec(line);
    if (!m) {
      if (/^GRANT PROXY\b/i.test(line)) return { ok: false, reason: 'droit PROXY' };
      if (/^GRANT `[^`]+`(?:@`[^`]*`)? TO /i.test(line))
        return { ok: false, reason: 'rôle attribué' };
      if (/ ON \*\.\* /i.test(line)) return { ok: false, reason: 'droit global autre que USAGE' };
      if (/ ON `[^`]+`\.\* /i.test(line))
        return { ok: false, reason: 'droit au niveau de la base' };
      return { ok: false, reason: 'droit non reconnu (refusé par défaut)' };
    }
    const [, db, table] = m;
    if (db !== dbName) return { ok: false, reason: `droit sur une autre base (${db})` };
    if (!CONTENT_TABLES.has(table.toLowerCase())) {
      return { ok: false, reason: `table hors liste blanche (${table})` };
    }
    tables.add(table.toLowerCase());
  }
  if (tables.size === 0) return { ok: false, reason: 'aucune table de contenu lisible' };
  return { ok: true, tables: [...tables].sort() };
}

let cache = null;

/**
 * Lit et évalue les droits du pool dédié (mis en cache `CHECK_TTL_MS`).
 * @param {() => import('mysql2/promise').Pool} getPool
 * @param {{ log?: (entry: object) => void, force?: boolean }} [opts]
 */
async function checkReadOnlyGrants(getPool, { log = () => {}, force = false } = {}) {
  const now = Date.now();
  if (!force && cache && cache.expiresAt > now) return cache.result;
  let result;
  try {
    const pool = getPool();
    const [rows] = await pool.query('SHOW GRANTS FOR CURRENT_USER()');
    const lines = rows.map((r) => String(Object.values(r)[0] ?? ''));
    let currentRole = null;
    try {
      const [roleRows] = await pool.query('SELECT CURRENT_ROLE() AS r');
      currentRole = roleRows?.[0]?.r ?? null;
    } catch {
      currentRole = null; // MySQL sans CURRENT_ROLE() : les rôles apparaissent dans SHOW GRANTS
    }
    result =
      currentRole && currentRole !== 'NONE'
        ? { ok: false, reason: 'rôle actif' }
        : evaluateGrants(lines, String(process.env.DB_NAME || ''));
  } catch (err) {
    result = { ok: false, reason: `droits illisibles (${err?.code || 'erreur'})` };
  }
  if (!result.ok && (!cache || cache.result.reason !== result.reason)) {
    log({ event: 'mcp_sql_grants_refused', reason: result.reason });
  }
  cache = { result, expiresAt: now + CHECK_TTL_MS };
  return result;
}

/** Dernier résultat connu (synchrone, pour `tools/list`) ; `null` si jamais vérifié. */
function lastGrantsCheck() {
  if (!cache || cache.expiresAt <= Date.now()) return null;
  return cache.result;
}

function resetGrantsCacheForTests() {
  cache = null;
}

module.exports = {
  CHECK_TTL_MS,
  checkReadOnlyGrants,
  evaluateGrants,
  lastGrantsCheck,
  resetGrantsCacheForTests,
};
