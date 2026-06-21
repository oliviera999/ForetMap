'use strict';
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const { initDatabase, pool } = require('../database');

const DUMP = path.join(__dirname, '..', 'sql', 'foretmap_bdd_complete.sql');
const TABLES = [
  'plant_name_aliases','zone_species','marker_species','task_species','species_interactions',
  'glossary_terms','glossary_term_relations','glossary_term_species','glossary_term_tutorials','glossary_term_interactions',
];

function extractInsert(sql, table) {
  const marker = 'INSERT INTO `' + table + '` VALUES';
  const start = sql.indexOf(marker);
  if (start < 0) return null;
  let i = start;
  let inString = false;
  let escape = false;
  while (i < sql.length) {
    const c = sql[i];
    if (escape) { escape = false; i++; continue; }
    if (inString && c === '\\') { escape = true; i++; continue; }
    if (c === "'") { inString = !inString; i++; continue; }
    if (!inString && c === ';') {
      return sql.slice(start, i + 1).replace(/^INSERT INTO/i, 'INSERT IGNORE INTO');
    }
    i++;
  }
  return null;
}

async function run() {
  console.log('Import biodiv (junction, interactions, glossaire)…');
  await initDatabase();
  const sql = fs.readFileSync(DUMP, 'utf8');
  const conn = await pool.getConnection();
  try {
    await conn.query('SET NAMES utf8mb4');
    await conn.query('SET FOREIGN_KEY_CHECKS=0');
    for (const table of TABLES) {
      const stmt = extractInsert(sql, table);
      if (!stmt) { console.warn('Pas de INSERT pour', table); continue; }
      await conn.query('DELETE FROM `' + table + '`').catch(() => {});
      await conn.query(stmt);
      const [[{ c }]] = await conn.query('SELECT COUNT(*) AS c FROM `' + table + '`');
      console.log(table + ': ' + c + ' lignes');
    }
    await conn.query('SET FOREIGN_KEY_CHECKS=1');
  } finally { conn.release(); }
  await pool.end();
  console.log('Import terminé.');
}
run().catch((e) => { console.error(e); process.exit(1); });
