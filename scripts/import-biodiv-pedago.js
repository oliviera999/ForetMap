'use strict';
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const { initDatabase, pool } = require('../database');
const { findInsertStatements } = require('./lib/sqlDumpInserts');

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

/**
 * Instructions d'insertion de la table, prêtes à exécuter (`INSERT IGNORE`). La graine régénérée
 * nomme ses colonnes ; une graine ancienne (sans liste) reçoit `EXPLICIT_COLUMNS` si défini.
 * @returns {string[]}
 */
function insertStatementsFor(sql, table) {
  return findInsertStatements(sql, table).map((stmt) => {
    const text = stmt.text.replace(/^INSERT INTO/i, 'INSERT IGNORE INTO');
    const columns = EXPLICIT_COLUMNS[table];
    return !stmt.columns && columns ? text.replace(/`\s+VALUES/, '` ' + columns + ' VALUES') : text;
  });
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
      const statements = insertStatementsFor(sql, table);
      if (!statements.length) {
        console.warn('Pas de INSERT pour', table);
        continue;
      }
      await conn.query('DELETE FROM `' + table + '`').catch(() => {});
      for (const stmt of statements) await conn.query(stmt);
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
if (require.main === module) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { TABLES, EXPLICIT_COLUMNS, insertStatementsFor };
