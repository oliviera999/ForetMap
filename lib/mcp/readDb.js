'use strict';

/**
 * Accès base **en lecture seule** pour les outils MCP.
 *
 * Chaque appel d'outil s'exécute dans `withReadOnly(work)` :
 * - une connexion dédiée (pool applicatif, ou pool `DB_MCP_USER` lecture seule s'il est
 *   configuré — recommandé en production : un compte MySQL qui n'a que `SELECT` est la
 *   seule garantie qui ne dépende pas de ce code) ;
 * - `START TRANSACTION READ ONLY` : toute écriture échoue côté serveur SQL (erreur 1792) ;
 * - délai maximal **par requête** : `SET STATEMENT max_statement_time = N FOR …` en MariaDB,
 *   indice `MAX_EXECUTION_TIME` en MySQL 8, plus un plafond global par appel côté Node ;
 * - `LIMIT` forcé : `select()` ajoute `LIMIT n OFFSET m` (entiers validés, plafond 500) ;
 * - liste blanche : chaque texte SQL passe par `assertSqlReadable` avant d'être envoyé.
 *
 * Les requêtes sont paramétrées (`?`) : `conn.query(sql, params)` de mysql2 échappe côté
 * client, ce qui reste compatible avec le préfixe `SET STATEMENT … FOR` que le protocole
 * préparé n'accepte pas sur toutes les versions de MariaDB.
 */

const mysql = require('mysql2/promise');
const { pool: appPool } = require('../../database');
const logger = require('../logger');
const { assertSqlReadable, McpDataAccessError } = require('./sqlGuard');
const { getMcpConfig } = require('./config');

const MAX_ROWS = 500;

let mcpPool = null;
let engineKind = null;

/** Vrai si un compte MySQL dédié au connecteur (`DB_MCP_USER`) est configuré. */
function isReadOnlyPoolConfigured() {
  return String(process.env.DB_MCP_USER || '').trim() !== '';
}

/**
 * Pool de lecture : compte dédié `DB_MCP_USER` / `DB_MCP_PASS` s'il est configuré (tous les
 * outils de lecture l'utilisent alors), sinon pool applicatif — sauf `requireDedicated`, qui
 * refuse le repli (outil SQL libre).
 */
function getReadPool({ requireDedicated = false } = {}) {
  const user = String(process.env.DB_MCP_USER || '').trim();
  if (!user) {
    if (requireDedicated) {
      throw new McpDataAccessError(
        'Outil indisponible : compte MySQL en lecture seule DB_MCP_USER non configuré',
        'MCP_READONLY_POOL_REQUIRED',
      );
    }
    return appPool;
  }
  if (!mcpPool) {
    mcpPool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: Number.parseInt(process.env.DB_PORT, 10) || 3306,
      user,
      password: process.env.DB_MCP_PASS,
      database: process.env.DB_NAME,
      connectionLimit: 4,
      waitForConnections: true,
      queueLimit: 20,
      charset: 'utf8mb4',
      timezone: 'Z',
      dateStrings: ['DATE'],
    });
    mcpPool.on('error', (err) => logger.warn({ err }, 'Pool MCP lecture seule : erreur'));
  }
  return mcpPool;
}

async function endReadPool() {
  // Nouveau pool = peut-être un autre compte : les droits vérifiés ne valent plus.
  require('./readOnlyGrants').resetGrantsCacheForTests();
  if (mcpPool) {
    const p = mcpPool;
    mcpPool = null;
    await p.end();
  }
}

async function detectEngine(conn) {
  if (engineKind) return engineKind;
  const [rows] = await conn.query('SELECT VERSION() AS v');
  engineKind = /mariadb/i.test(String(rows?.[0]?.v || '')) ? 'mariadb' : 'mysql';
  return engineKind;
}

/** Préfixe la requête du délai maximal propre au moteur. */
function withStatementTimeout(sql, engine, timeoutMs) {
  const text = String(sql).trim();
  if (engine === 'mariadb') {
    const seconds = Math.max(0.5, timeoutMs / 1000).toFixed(1);
    return `SET STATEMENT max_statement_time=${seconds} FOR ${text}`;
  }
  return text.replace(/^SELECT\b/i, `SELECT /*+ MAX_EXECUTION_TIME(${Math.round(timeoutMs)}) */`);
}

function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * @template T
 * @param {(db: { select: Function, aggregate: Function, one: Function, engine: string }) => Promise<T>} work
 * @param {{ timeoutMs?: number, requireReadOnlyPool?: boolean, appPool?: boolean }} [opts]
 * @returns {Promise<T>}
 */
async function withReadOnly(work, opts = {}) {
  const cfg = getMcpConfig();
  const timeoutMs = opts.timeoutMs || cfg.statementTimeoutMs;
  // `appPool` : lectures agrégées des outils de domaine (SQL écrit par le connecteur, tables
  // hors contenu que le compte dédié ne lit pas) — pool principal, toujours en READ ONLY.
  const pool = opts.appPool
    ? appPool
    : getReadPool({ requireDedicated: !!opts.requireReadOnlyPool });
  const conn = await pool.getConnection();
  let txOpen = false;
  try {
    const engine = await detectEngine(conn);
    await conn.query('START TRANSACTION READ ONLY');
    txOpen = true;

    const run = async (sql, params, mode, guardOpts = {}) => {
      // Garde par expressions régulières pour le SQL **écrit par ce code** (outils). Le SQL
      // libre de `foretmap_sql_select` est validé en amont par l'analyse syntaxique
      // (`lib/mcp/sqlAst.js`), plus précise (noms de CTE), et exécuté par le compte restreint.
      if (!guardOpts.astValidated) assertSqlReadable(sql, { mode, ...guardOpts });
      const [rows] = await conn.query(withStatementTimeout(sql, engine, timeoutMs), params || []);
      return Array.isArray(rows) ? rows : [];
    };

    const db = {
      engine,
      /**
       * Lecture paginée d'une table de contenu. `sql` ne doit PAS porter de LIMIT : il est
       * ajouté ici (plafond 500).
       */
      select: (sql, params = [], { limit = 200, offset = 0 } = {}) => {
        const lim = clampInt(limit, 200, 1, Math.max(MAX_ROWS, cfg.maxRows || MAX_ROWS));
        const off = clampInt(offset, 0, 0, 1_000_000);
        if (/\bLIMIT\b/i.test(String(sql).replace(/\([^()]*\)/g, ''))) {
          throw new McpDataAccessError('LIMIT géré par le connecteur', 'MCP_SQL_LIMIT');
        }
        // Entiers bornés ci-dessus : pas de chaîne utilisateur interpolée.
        return run(`${sql} LIMIT ${lim} OFFSET ${off}`, params, 'content');
      },
      /**
       * Lecture **interne** d'un jeu complet (audits) : pages de 500 jusqu'à épuisement,
       * plafond dur `maxRows` (20 000). Jamais exposée aux arguments d'un outil.
       */
      selectAll: async (sql, params = [], { maxRows = 20000 } = {}) => {
        const out = [];
        for (let offset = 0; offset < maxRows; offset += MAX_ROWS) {
          const rows = await db.select(sql, params, { limit: MAX_ROWS, offset });
          out.push(...rows);
          if (rows.length < MAX_ROWS) break;
        }
        return out;
      },
      /** Ligne unique d'une table de contenu (ajoute `LIMIT 1`). */
      one: async (sql, params = []) => {
        const rows = await run(`${sql} LIMIT 1`, params, 'content');
        return rows[0];
      },
      /**
       * Agrégat sur une table de traces (observations, réponses…) : le texte SQL doit
       * contenir `COUNT(` et `GROUP BY` ou un agrégat global ; le seuil n ≥ 5 est appliqué
       * par l'appelant (`lib/mcp/tools/usage.js`).
       */
      aggregate: (sql, params = []) => {
        if (!/\b(?:COUNT|SUM|AVG)\s*\(/i.test(sql)) {
          throw new McpDataAccessError('Requête d’agrégat attendue', 'MCP_AGGREGATE_ONLY');
        }
        return run(`${sql} LIMIT ${MAX_ROWS}`, params, 'aggregate');
      },
      /** Requête complète déjà bornée (SQL libre validé par `foretmap_sql_select`). */
      raw: (sql, params = [], guardOpts = {}) => run(sql, params, 'content', guardOpts),
    };

    let timer = null;
    const budget = new Promise((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            Object.assign(new Error('Délai maximal de l’outil dépassé'), {
              code: 'MCP_TOOL_TIMEOUT',
            }),
          ),
        timeoutMs * 4,
      );
      if (typeof timer.unref === 'function') timer.unref();
    });
    try {
      return await Promise.race([work(db), budget]);
    } finally {
      clearTimeout(timer);
    }
  } finally {
    if (txOpen) {
      try {
        await conn.query('COMMIT');
      } catch (_) {
        /* transaction en lecture seule : rien à valider */
      }
    }
    conn.release();
  }
}

/** Réservé aux tests : force la redétection du moteur. */
function resetEngineDetectionForTests() {
  engineKind = null;
}

module.exports = {
  MAX_ROWS,
  getReadPool,
  isReadOnlyPoolConfigured,
  endReadPool,
  resetEngineDetectionForTests,
  withReadOnly,
  withStatementTimeout,
};
