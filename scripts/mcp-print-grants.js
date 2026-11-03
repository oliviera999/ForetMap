#!/usr/bin/env node
'use strict';

/**
 * Imprime les droits MySQL du compte **lecture seule** du connecteur MCP (`DB_MCP_USER`) :
 * un `GRANT SELECT` **par table de contenu** (`CONTENT_TABLES`, `lib/mcp/sqlGuard.js`), rien
 * d'autre. C'est la barrière indépendante du code qui conditionne l'outil `foretmap_sql_select`.
 *
 * Usage :
 *   node scripts/mcp-print-grants.js --db <base> --user <compte> [--host <hôte>] [--check-db]
 *   node scripts/mcp-print-grants.js --db <base> --user <compte> --privacy-bypass [--check-db]
 *     → GRANT élargis hors tables secrètes (mode productivité / bypass RGPD) ; pour `users`,
 *       SELECT sur colonnes non secrètes seulement.
 *
 * N'imprime aucun mot de passe : le compte se crée à part (cPanel ou `CREATE USER`).
 */

const { CONTENT_TABLES } = require('../lib/mcp/sqlGuard');
const { isSecretTable } = require('../lib/mcp/secretGuard');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const IDENT_RE = /^[A-Za-z0-9_$-]{1,64}$/;

/** Colonnes non secrètes de `users` pour le mode bypass. */
const USERS_SAFE_COLS = [
  'id',
  'user_type',
  'assigned_role_id',
  'legacy_user_id',
  'email',
  'pseudo',
  'first_name',
  'last_name',
  'display_name',
  'description',
  'avatar_path',
  'affiliation',
  'auth_provider',
  'is_active',
  'deactivated_at',
  'sync_exempt',
  'last_seen',
  'discovery_tour_seen_json',
  'biodiv_pedago_level',
  'created_at',
  'updated_at',
];

/**
 * @param {{ db: string, user: string, host?: string, existingTables?: Set<string>|null, privacyBypass?: boolean, extraTables?: string[] }} opts
 */
function buildGrants({
  db,
  user,
  host = 'localhost',
  existingTables = null,
  privacyBypass = false,
  extraTables = [],
}) {
  for (const [k, v] of Object.entries({ db, user, host })) {
    if (!v || !/^[A-Za-z0-9_$.%-]{1,64}$/.test(v)) throw new Error(`--${k} invalide`);
  }
  const tables = new Set(CONTENT_TABLES);
  if (privacyBypass) {
    for (const t of extraTables) {
      if (!isSecretTable(t)) tables.add(t);
    }
    // Tables nominatives courantes hors secrets.
    for (const t of [
      'users',
      'group_members',
      'groups',
      'task_assignments',
      'species_observations',
      'user_quiz_attempts',
      'user_tutorial_reads',
      'gl_qcm_attempts',
      'usage_counters',
    ]) {
      if (!isSecretTable(t)) tables.add(t);
    }
  }
  const lines = [
    privacyBypass
      ? `-- Droits élargis (bypass RGPD) du compte MCP sur \`${db}\` — hors tables secrètes.`
      : `-- Droits du compte lecture seule du connecteur MCP sur \`${db}\` (${CONTENT_TABLES.size} tables).`,
    `-- Révoquer d'abord tout droit plus large : REVOKE ALL PRIVILEGES, GRANT OPTION FROM '${user}'@'${host}';`,
  ];
  for (const table of [...tables].sort()) {
    if (!IDENT_RE.test(table)) throw new Error(`Nom de table inattendu : ${table}`);
    if (existingTables && !existingTables.has(table)) {
      lines.push(`-- (absente de la base, ignorée) ${table}`);
      continue;
    }
    if (isSecretTable(table)) {
      lines.push(`-- (table secrète, refusée) ${table}`);
      continue;
    }
    if (privacyBypass && table === 'users') {
      const cols = USERS_SAFE_COLS.map((c) => `\`${c}\``).join(', ');
      lines.push(`GRANT SELECT (${cols}) ON \`${db}\`.\`users\` TO '${user}'@'${host}';`);
      continue;
    }
    lines.push(`GRANT SELECT ON \`${db}\`.\`${table}\` TO '${user}'@'${host}';`);
  }
  return `${lines.join('\n')}\n`;
}

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
      buildGrants({
        db,
        user: arg('user'),
        host: arg('host', 'localhost'),
        existingTables,
        privacyBypass: process.argv.includes('--privacy-bypass'),
      }),
    );
  })().catch((err) => {
    process.stderr.write(
      `${err.message}\nUsage : node scripts/mcp-print-grants.js --db <base> --user <compte> [--host <hôte>] [--privacy-bypass]\n`,
    );
    process.exit(2);
  });
}

module.exports = { buildGrants, USERS_SAFE_COLS };
