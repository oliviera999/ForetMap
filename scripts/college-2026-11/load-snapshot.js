#!/usr/bin/env node
'use strict';

/**
 * Charge l'instantané de contenu du chantier collège (docs/coordination/college-2026-11/snapshot)
 * dans une base de TEST, à la place du contenu de démonstration.
 *
 *   node scripts/college-2026-11/load-snapshot.js            # base = DB_NAME du .env
 *   DB_NAME=foretmap_test_d1_snap node scripts/college-2026-11/load-snapshot.js
 *
 * Préalable : la base existe et porte le schéma à jour (`npm run db:init` ou `db:migrate`).
 *
 * Garde-fous :
 *   - refuse toute base dont le nom ne contient ni `test` ni `sim` (jamais la prod, jamais
 *     `foretmap_local`) ;
 *   - ne touche qu'aux tables de contenu listées dans TABLES : chacune est vidée puis rechargée
 *     (contrôles de clés étrangères suspendus le temps du chargement, dans une seule connexion) ;
 *   - les colonnes absentes de l'instantané gardent leur valeur par défaut ; les colonnes de
 *     l'instantané absentes de la base sont ignorées (et signalées).
 *
 * Utiliser une base dédiée (`foretmap_test_<flux>_snap`) : vider les zones ou les cartes d'une
 * base de tests ordinaire casserait les tests qui comptent sur les données de démonstration.
 * Outil de chantier : supprimé par SI avec le dossier de coordination.
 */

require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');

const SNAPSHOT_DIR = path.join(
  __dirname,
  '..',
  '..',
  'docs',
  'coordination',
  'college-2026-11',
  'snapshot',
);

// Ordre de chargement : parents avant enfants (indicatif, les contrôles FK sont suspendus).
const TABLES = [
  'maps',
  'clades',
  'plants',
  'map_species',
  'zones',
  'zone_species',
  'species_interactions',
  'curriculum_notions',
  'glossary_terms',
  'glossary_category_notions',
  'quiz_categories',
  'quiz_category_notions',
  'quiz_questions',
  'quiz_question_notions',
  'id_keys',
  'id_key_couplets',
  'id_key_leads',
  'id_key_lead_plants',
  'pedago_sessions',
];

function assertTestDatabase(name) {
  const n = String(name || '');
  if (!/test|sim/i.test(n)) {
    throw new Error(`Base « ${n} » refusée : le nom doit contenir « test » ou « sim ».`);
  }
}

async function loadTable(conn, dbName, table) {
  const file = path.join(SNAPSHOT_DIR, `${table}.json`);
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  const [cols] = await conn.query(
    'SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?',
    [dbName, table],
  );
  const known = new Set(cols.map((c) => c.COLUMN_NAME));
  // Dérive de schéma prod ↔ dépôt : une valeur d'ENUM / de SET inconnue de la base est retirée
  // (ENUM → NULL ; SET → membres connus seulement), et signalée.
  const enumAllowed = new Map();
  for (const c of cols) {
    const m = /^(enum|set)\((.*)\)$/i.exec(c.COLUMN_TYPE);
    if (m && c.IS_NULLABLE === 'YES') {
      enumAllowed.set(c.COLUMN_NAME, {
        isSet: m[1].toLowerCase() === 'set',
        values: new Set(
          m[2].split(',').map((v) => v.trim().replace(/^'|'$/g, '').replace(/''/g, "'")),
        ),
      });
    }
  }
  const nulled = {};
  if (known.size === 0) throw new Error(`Table absente de la base : ${table}`);
  const snapCols = rows.length ? Object.keys(rows[0]) : [];
  const usable = snapCols.filter((c) => known.has(c));
  const ignored = snapCols.filter((c) => !known.has(c));
  await conn.query(`DELETE FROM \`${table}\``);
  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const values = chunk.map((r) =>
      usable.map((c) => {
        const v = r[c] && typeof r[c] === 'object' ? JSON.stringify(r[c]) : r[c];
        const spec = enumAllowed.get(c);
        if (!spec || v == null || v === '') return v;
        const parts = spec.isSet ? String(v).split(',') : [String(v)];
        const kept = parts.filter((part) => spec.values.has(part));
        for (const part of parts.filter((x) => !spec.values.has(x))) {
          nulled[`${c}=${part}`] = (nulled[`${c}=${part}`] || 0) + 1;
        }
        if (kept.length === parts.length) return v;
        return kept.length ? kept.join(',') : null;
      }),
    );
    await conn.query(
      `INSERT INTO \`${table}\` (${usable.map((c) => `\`${c}\``).join(', ')}) VALUES ?`,
      [values],
    );
  }
  return { table, rows: rows.length, ignored, nulled };
}

async function main() {
  const dbName = process.env.DB_NAME;
  assertTestDatabase(dbName);
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: dbName,
    charset: 'utf8mb4',
    dateStrings: true,
  });
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const table of TABLES) {
      const res = await loadTable(conn, dbName, table);
      const nulledList = Object.entries(res.nulled).map(([k, n]) => `${k} ×${n}`);
      const note =
        (res.ignored.length ? ` (colonnes ignorées : ${res.ignored.join(', ')})` : '') +
        (nulledList.length
          ? ` (valeurs d'ENUM ou de SET inconnues de la base, retirées : ${nulledList.join(', ')})`
          : '');
      process.stdout.write(`[snapshot] ${table} : ${res.rows} ligne(s)${note}\n`);
    }
  } finally {
    await conn.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => {});
    await conn.end();
  }
  process.stdout.write(`[snapshot] base ${dbName} chargée.\n`);
}

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(`[snapshot] échec : ${err.message}\n`);
    process.exit(1);
  });
}

module.exports = { TABLES, assertTestDatabase };
