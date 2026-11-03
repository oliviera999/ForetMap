'use strict';

/**
 * Vérification des **droits réels** du compte MySQL `DB_MCP_USER` (contre-vérification de la
 * PR #616, B1.2).
 *
 * Mode normal : `SELECT` sur les seules tables de contenu (`CONTENT_TABLES`).
 * Mode bypass RGPD (`privacyBypass: true`) : `SELECT` par table hors `SECRET_TABLES`, et
 * `SELECT (colonnes)` sans colonnes secrètes sur les tables qui en ont. Restent refusés :
 * droits au niveau base, écriture, GRANT OPTION, PUBLIC élargi, rôles.
 */

const { CONTENT_TABLES } = require('./sqlGuard');
const { isSecretColumn, isSecretTable } = require('./secretGuard');

// Contrôle à chaque appel de l'outil (rare) ; ce cache court ne sert qu'à `tools/list`.
const CHECK_TTL_MS = 60 * 1000;
const PUBLIC_USAGE_RE = /^GRANT USAGE ON \*\.\* TO PUBLIC$/i;

function evaluatePublicGrants(lines) {
  for (const raw of lines || []) {
    const line = String(raw || '').trim();
    if (!line || PUBLIC_USAGE_RE.test(line)) continue;
    return { ok: false, reason: 'droit accordé à PUBLIC' };
  }
  return { ok: true };
}

const USAGE_RE =
  /^GRANT USAGE ON \*\.\* TO [`'][^`']+[`']@[`'][^`']+[`'](?: IDENTIFIED (?:BY PASSWORD '[^']*'|VIA [\s\S]*))?(?: REQUIRE [A-Z0-9 ]+)?(?: WITH (?:MAX_[A-Z_]+ \d+ ?)+)?$/;
const SELECT_TABLE_RE =
  /^GRANT SELECT(?: \((?:`[A-Za-z0-9_]+`(?:, )?)+\))? ON `([A-Za-z0-9_$]+)`\.`([A-Za-z0-9_$]+)` TO [`'][^`']+[`']@[`'][^`']+[`']$/;
const SELECT_COLS_RE =
  /^GRANT SELECT \(((?:`[A-Za-z0-9_]+`(?:, )?)+)\) ON `([A-Za-z0-9_$]+)`\.`([A-Za-z0-9_$]+)` TO [`'][^`']+[`']@[`'][^`']+[`']$/;

/**
 * @param {string[]} lines
 * @param {string} dbName
 * @param {{ privacyBypass?: boolean }} [opts]
 */
function evaluateGrants(lines, dbName, opts = {}) {
  const privacyBypass = !!opts.privacyBypass;
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
    if (/^GRANT PROXY\b/i.test(line)) return { ok: false, reason: 'droit PROXY' };
    if (/^GRANT `[^`]+`(?:@`[^`]*`)? TO /i.test(line))
      return { ok: false, reason: 'rôle attribué' };
    if (/ ON \*\.\* /i.test(line)) return { ok: false, reason: 'droit global autre que USAGE' };
    if (/ ON `[^`]+`\.\* /i.test(line)) return { ok: false, reason: 'droit au niveau de la base' };

    const colsMatch = SELECT_COLS_RE.exec(line);
    if (colsMatch) {
      const [, colsRaw, db, table] = colsMatch;
      if (db !== dbName) return { ok: false, reason: `droit sur une autre base (${db})` };
      const t = table.toLowerCase();
      if (isSecretTable(t)) {
        return { ok: false, reason: `table secrète (${table})` };
      }
      const cols = colsRaw.split(',').map((c) => c.replace(/`/g, '').trim());
      for (const col of cols) {
        if (isSecretColumn(col)) {
          return { ok: false, reason: `colonne secrète accordée (${table}.${col})` };
        }
      }
      if (!privacyBypass && !CONTENT_TABLES.has(t)) {
        return { ok: false, reason: `table hors liste blanche (${table})` };
      }
      tables.add(t);
      continue;
    }

    const m = SELECT_TABLE_RE.exec(line);
    if (!m) {
      return { ok: false, reason: 'droit non reconnu (refusé par défaut)' };
    }
    const [, db, table] = m;
    if (db !== dbName) return { ok: false, reason: `droit sur une autre base (${db})` };
    const t = table.toLowerCase();
    if (isSecretTable(t)) {
      return { ok: false, reason: `table secrète (${table})` };
    }
    if (!privacyBypass && !CONTENT_TABLES.has(t)) {
      return { ok: false, reason: `table hors liste blanche (${table})` };
    }
    // En bypass, un GRANT SELECT * sur une table avec colonnes secrètes (ex. users) est
    // refusé : il faut un GRANT SELECT (colonnes non secrètes).
    if (privacyBypass && t === 'users') {
      return {
        ok: false,
        reason: 'users exige GRANT SELECT (colonnes) sans password_hash (mode bypass)',
      };
    }
    tables.add(t);
  }
  if (tables.size === 0) {
    return {
      ok: false,
      reason: privacyBypass ? 'aucune table lisible' : 'aucune table de contenu lisible',
    };
  }
  const out = { ok: true, tables: [...tables].sort() };
  if (privacyBypass) out.privacyBypass = true;
  return out;
}

let cache = null;
let cacheMode = null;

/**
 * @param {() => import('mysql2/promise').Pool} getPool
 * @param {{ log?: (entry: object) => void, force?: boolean, privacyBypass?: boolean }} [opts]
 */
async function checkReadOnlyGrants(
  getPool,
  { log = () => {}, force = false, privacyBypass = false } = {},
) {
  const now = Date.now();
  const mode = privacyBypass ? 'bypass' : 'content';
  if (!force && cache && cache.expiresAt > now && cacheMode === mode) return cache.result;
  let result;
  try {
    const pool = getPool();
    const [rows] = await pool.query('SHOW GRANTS FOR CURRENT_USER()');
    const lines = rows.map((r) => String(Object.values(r)[0] ?? ''));
    let publicLines = [];
    try {
      const [pub] = await pool.query('SHOW GRANTS FOR PUBLIC');
      publicLines = pub.map((r) => String(Object.values(r)[0] ?? ''));
    } catch (err) {
      if (err?.errno !== 1141 && err?.errno !== 1064) throw err;
    }
    let currentRole = null;
    try {
      const [roleRows] = await pool.query('SELECT CURRENT_ROLE() AS r');
      currentRole = roleRows?.[0]?.r ?? null;
    } catch {
      currentRole = null;
    }
    const pub = evaluatePublicGrants(publicLines);
    result =
      currentRole && currentRole !== 'NONE'
        ? { ok: false, reason: 'rôle actif' }
        : !pub.ok
          ? pub
          : evaluateGrants(lines, String(process.env.DB_NAME || ''), { privacyBypass });
  } catch (err) {
    result = { ok: false, reason: `droits illisibles (${err?.code || 'erreur'})` };
  }
  if (!result.ok && (!cache || cache.result.reason !== result.reason || cacheMode !== mode)) {
    log({ event: 'mcp_sql_grants_refused', reason: result.reason, privacyBypass });
  }
  cache = { result, expiresAt: now + CHECK_TTL_MS };
  cacheMode = mode;
  return result;
}

function lastGrantsCheck() {
  if (!cache || cache.expiresAt <= Date.now()) return null;
  return cache.result;
}

function resetGrantsCacheForTests() {
  cache = null;
  cacheMode = null;
}

module.exports = {
  CHECK_TTL_MS,
  checkReadOnlyGrants,
  evaluateGrants,
  evaluatePublicGrants,
  lastGrantsCheck,
  resetGrantsCacheForTests,
};
