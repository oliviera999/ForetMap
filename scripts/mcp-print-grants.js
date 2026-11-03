#!/usr/bin/env node
'use strict';

/**
 * Imprime les droits MySQL du compte **lecture seule** du connecteur MCP (`DB_MCP_USER`) :
 * un `GRANT SELECT` **par table de contenu** (`CONTENT_TABLES`, `lib/mcp/sqlGuard.js`), rien
 * d'autre. C'est la barrière indépendante du code qui conditionne l'outil `foretmap_sql_select`.
 *
 * Usage :
 *   node scripts/mcp-print-grants.js --db <base> --user <compte> [--host <hôte>] [--check-db]
 *   (`--check-db` : lit la base avec la configuration `.env` et ignore les tables absentes)
 *   (puis exécuter la sortie avec un compte administrateur MySQL)
 *
 * Hébergement mutualisé (cPanel / o2switch) : l'interface « Bases de données MySQL » n'accorde
 * souvent les privilèges que **pour une base entière**. Si les GRANT par table ne peuvent pas
 * être exécutés (pas d'accès administrateur MySQL), NE PAS donner `SELECT` sur toute la base à
 * ce compte : laisser `foretmap_sql_select` désactivé (voir docs/MCP.md § 8).
 *
 * N'imprime aucun mot de passe : le compte se crée à part (cPanel ou `CREATE USER`).
 */

const { CONTENT_TABLES } = require('../lib/mcp/sqlGuard');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const IDENT_RE = /^[A-Za-z0-9_$-]{1,64}$/;

/**
 * @param {{ db: string, user: string, host?: string, existingTables?: Set<string>|null }} opts
 *   `existingTables` : tables présentes dans la base (une table de la liste blanche absente —
 *   ex. `gl_qcm_question_glossary`, supprimée par la migration 186 — ferait échouer le GRANT).
 */
function buildGrants({ db, user, host = 'localhost', existingTables = null }) {
  for (const [k, v] of Object.entries({ db, user, host })) {
    if (!v || !/^[A-Za-z0-9_$.%-]{1,64}$/.test(v)) throw new Error(`--${k} invalide`);
  }
  const lines = [
    `-- Droits du compte lecture seule du connecteur MCP sur \`${db}\` (${CONTENT_TABLES.size} tables).`,
    `-- Révoquer d'abord tout droit plus large : REVOKE ALL PRIVILEGES, GRANT OPTION FROM '${user}'@'${host}';`,
  ];
  for (const table of [...CONTENT_TABLES].sort()) {
    if (!IDENT_RE.test(table)) throw new Error(`Nom de table inattendu : ${table}`);
    if (existingTables && !existingTables.has(table)) {
      lines.push(`-- (absente de la base, ignorée) ${table}`);
      continue;
    }
    lines.push(`GRANT SELECT ON \`${db}\`.\`${table}\` TO '${user}'@'${host}';`);
  }
  return `${lines.join('\n')}\n`;
}

/** Tables présentes, lues avec la configuration `.env` (option `--check-db`). */
async function readExistingTables(db) {
  require('dotenv').config({ quiet: true });
  const mysql = require('mysql2/promise');
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number.parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
  });
  try {
    const [rows] = await conn.query(
      'SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?',
      [db],
    );
    return new Set(rows.map((r) => String(r.t)));
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  (async () => {
    const db = arg('db');
    const existingTables = process.argv.includes('--check-db')
      ? await readExistingTables(db)
      : null;
    process.stdout.write(
      buildGrants({ db, user: arg('user'), host: arg('host', 'localhost'), existingTables }),
    );
  })().catch((err) => {
    process.stderr.write(
      `${err.message}\nUsage : node scripts/mcp-print-grants.js --db <base> --user <compte> [--host <hôte>]\n`,
    );
    process.exit(2);
  });
}

module.exports = { buildGrants };
