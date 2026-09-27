'use strict';

/**
 * Journal des écritures SQL **effectives**, dans l'ordre, pour les tests de caractérisation
 * (« même ordre d'effets » d'une refactorisation — piste B de
 * `docs/AUDIT_ETAT_DES_LIEUX_2026-09-25.md`).
 *
 * Le pool `mysql2` de `database.js` est enveloppé le temps d'une mesure : `pool.execute`
 * (requêtes hors transaction) et l'`execute` des connexions rendues par `pool.getConnection`
 * (transactions `withTransaction`). Seules les écritures `INSERT` / `UPDATE` / `DELETE` /
 * `REPLACE` sont retenues, et une mise à jour ou une suppression qui ne touche **aucune**
 * ligne est ignorée : le journal décrit ce qui a changé en base, pas le code qui a tourné.
 *
 * Le texte SQL est compacté (espaces) et les paramètres passent par `alias` (identifiants de
 * fixture → noms stables). Les tables retenues se choisissent par `tables` (liste blanche),
 * pour écarter les écritures de fond sans rapport avec le scénario.
 */

const WRITE_RE = /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i;
const TABLE_RE =
  /^\s*(?:INSERT\s+(?:IGNORE\s+)?INTO\s+|UPDATE\s+(?:IGNORE\s+)?|DELETE\s+FROM\s+|REPLACE\s+INTO\s+)`?([A-Za-z0-9_]+)`?/i;

function compactSql(sql) {
  return String(sql).replace(/\s+/g, ' ').trim();
}

function tableOf(sql) {
  const m = TABLE_RE.exec(String(sql));
  return m ? m[1] : null;
}

/**
 * @param {object} pool pool `mysql2/promise` exporté par `database.js`
 * @param {{ tables?: string[] }} [options]
 */
function startSqlJournal(pool, { tables } = {}) {
  const keep = tables ? new Set(tables) : null;
  const entries = [];
  let active = true;
  const record = (sql, params, tx, result) => {
    if (!active || !WRITE_RE.test(String(sql))) return;
    const table = tableOf(sql);
    if (keep && !keep.has(table)) return;
    const header = Array.isArray(result) ? result[0] : result;
    const affected = Number(header?.affectedRows ?? 0);
    if (!/^\s*INSERT/i.test(String(sql)) && affected === 0) return;
    entries.push({ table, sql: compactSql(sql), params: params || [], tx, affected });
  };
  const origExecute = pool.execute;
  const origGetConnection = pool.getConnection;
  pool.execute = async function journaledExecute(sql, params) {
    const result = await origExecute.call(this, sql, params);
    record(sql, params, false, result);
    return result;
  };
  pool.getConnection = async function journaledGetConnection(...args) {
    const conn = await origGetConnection.apply(this, args);
    const connExecute = conn.execute;
    conn.execute = async function journaledConnExecute(sql, params) {
      const result = await connExecute.call(this, sql, params);
      record(sql, params, true, result);
      return result;
    };
    return conn;
  };
  return {
    entries,
    stop() {
      active = false;
      pool.execute = origExecute;
      pool.getConnection = origGetConnection;
      return entries;
    },
  };
}

/**
 * Remplace, dans une valeur quelconque, chaque identifiant connu par son alias, et les
 * horodatages par `<date>`.
 * @param {unknown} value
 * @param {Map<string, string>} aliases valeur exacte → alias
 */
function aliasValue(value, aliases) {
  if (value instanceof Date) return '<date>';
  if (value == null) return value;
  if (typeof value === 'number' || typeof value === 'bigint') {
    const key = String(value);
    return aliases.has(key) ? aliases.get(key) : value;
  }
  if (typeof value === 'string') {
    if (aliases.has(value)) return aliases.get(value);
    let out = value;
    for (const [raw, alias] of aliases) {
      if (raw.length >= 8 && out.includes(raw)) out = out.split(raw).join(alias);
    }
    return out
      .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g, '<date>')
      .replace(/"(runId|run_id)":\d+/g, '"$1":"<run>"');
  }
  if (Array.isArray(value)) return value.map((v) => aliasValue(v, aliases));
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = aliasValue(v, aliases);
    return out;
  }
  return value;
}

/** Journal normalisé : `[table, sql, params]`, prêt à comparer à une référence. */
function normalizeJournal(entries, aliases) {
  return entries.map((e) => ({
    table: e.table,
    tx: e.tx,
    affected: e.affected,
    sql: e.sql,
    params: aliasValue(e.params, aliases),
  }));
}

module.exports = { startSqlJournal, normalizeJournal, aliasValue, compactSql };
