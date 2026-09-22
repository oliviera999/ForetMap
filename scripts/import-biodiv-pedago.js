'use strict';
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const { initDatabase, pool } = require('../database');

// Jeu de données de contenu, sans données personnelles (voir
// scripts/extract-biodiv-pedago-seed.js pour le régénérer depuis un export local).
const DUMP = path.join(__dirname, '..', 'sql', 'biodiv_pedago_seed.sql');
const TABLES = [
  'plant_name_aliases',
  'zone_species',
  'marker_species',
  'task_species',
  'species_interactions',
  'glossary_terms',
  'glossary_term_relations',
  'glossary_term_species',
  'glossary_term_tutorials',
  'glossary_term_interactions',
];

/**
 * Colonnes explicites pour les tables dont le schéma a grossi depuis l'extraction du jeu de
 * contenu. `sql/biodiv_pedago_seed.sql` porte des `INSERT … VALUES` sans liste de colonnes :
 * dès qu'une migration en ajoute une (272 : `evidence_level`, `pollination_efficacy`,
 * `source_ref`), le nombre de valeurs ne correspond plus et l'import échoue en bloc. Nommer
 * les colonnes du dump laisse les nouvelles prendre leur valeur par défaut.
 */
const EXPLICIT_COLUMNS = {
  species_interactions: '(id, from_plant_id, to_plant_id, interaction_type, description)',
};

function extractInsert(sql, table) {
  const marker = 'INSERT INTO `' + table + '` VALUES';
  const start = sql.indexOf(marker);
  if (start < 0) return null;
  let i = start;
  let inString = false;
  let escape = false;
  while (i < sql.length) {
    const c = sql[i];
    if (escape) {
      escape = false;
      i++;
      continue;
    }
    if (inString && c === '\\') {
      escape = true;
      i++;
      continue;
    }
    if (c === "'") {
      inString = !inString;
      i++;
      continue;
    }
    if (!inString && c === ';') {
      const stmt = sql.slice(start, i + 1).replace(/^INSERT INTO/i, 'INSERT IGNORE INTO');
      const columns = EXPLICIT_COLUMNS[table];
      return columns ? stmt.replace(/`\s+VALUES/, '` ' + columns + ' VALUES') : stmt;
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
      if (!stmt) {
        console.warn('Pas de INSERT pour', table);
        continue;
      }
      await conn.query('DELETE FROM `' + table + '`').catch(() => {});
      await conn.query(stmt);
      const [[{ c }]] = await conn.query('SELECT COUNT(*) AS c FROM `' + table + '`');
      console.log(table + ': ' + c + ' lignes');
    }
    await conn.query('SET FOREIGN_KEY_CHECKS=1');
  } finally {
    conn.release();
  }
  await pool.end();
  console.log('Import terminé.');
}
run().catch((e) => {
  console.error(e);
  process.exit(1);
});
