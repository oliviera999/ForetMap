'use strict';
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const { initDatabase, pool } = require('../database');
const { findInsertStatements } = require('./lib/sqlDumpInserts');

// Jeu de données de contenu, sans données personnelles (voir
// scripts/extract-biodiv-pedago-seed.js pour le régénérer depuis un export local).
const DUMP = path.join(__dirname, '..', 'sql', 'biodiv_pedago_seed.sql');

function parseInsertRows(insertSql) {
  const valuesIdx = insertSql.indexOf('VALUES');
  if (valuesIdx < 0) return [];
  let i = valuesIdx + 6;
  const rows = [];
  while (i < insertSql.length) {
    while (i < insertSql.length && /\s/.test(insertSql[i])) i++;
    if (insertSql[i] === ';') break;
    if (insertSql[i] !== '(') break;
    i++;
    const row = [];
    while (i < insertSql.length) {
      while (i < insertSql.length && /\s/.test(insertSql[i])) i++;
      if (insertSql[i] === ')') {
        i++;
        break;
      }
      if (insertSql[i] === ',') {
        i++;
        continue;
      }
      if (insertSql[i] === "'") {
        i++;
        let s = '';
        while (i < insertSql.length) {
          if (insertSql[i] === '\\') {
            s += insertSql[i + 1];
            i += 2;
            continue;
          }
          if (insertSql[i] === "'") {
            if (insertSql[i + 1] === "'") {
              s += "'";
              i += 2;
              continue;
            }
            i++;
            break;
          }
          s += insertSql[i++];
        }
        row.push(s);
        continue;
      }
      if (insertSql.substring(i, i + 4) === 'NULL') {
        row.push(null);
        i += 4;
        continue;
      }
      let n = '';
      while (i < insertSql.length && insertSql[i] !== ',' && insertSql[i] !== ')')
        n += insertSql[i++];
      const t = n.trim();
      if (t === '') row.push(null);
      else if (/^-?\d+$/.test(t)) row.push(Number(t));
      else if (/^-?\d+\.\d+$/.test(t)) row.push(Number(t));
      else row.push(t);
    }
    rows.push(row);
    while (i < insertSql.length && /\s/.test(insertSql[i])) i++;
    if (insertSql[i] === ',') i++;
  }
  return rows;
}

/**
 * Position des colonnes enrichies dans une graine **ancienne**, sans liste de colonnes. La graine
 * régénérée par scripts/extract-biodiv-pedago-seed.js nomme ses colonnes : on s'y fie alors, ce
 * qui rend l'import indépendant de l'ordre des colonnes de l'export.
 */
const ENRICH_IDX = {
  taxon_kingdom: 6,
  taxon_group: 7,
  taxon_family: 8,
  taxon_genus: 9,
  gbif_key: 10,
  habitat_type: 15,
  trophic_role: 19,
  is_ornamental: 20,
  life_cycle: 22,
  temp_min_c: 30,
  temp_max_c: 31,
  ph_min: 33,
  ph_max: 34,
  is_edible: 38,
};

/**
 * Index de chaque colonne enrichie (et de `id`) : d'après la liste de colonnes de la graine si
 * elle en a une, sinon `ENRICH_IDX`. Une colonne attendue absente de la liste est une erreur.
 * @param {string[] | null} columns
 */
function resolveEnrichIndex(columns) {
  if (!columns) return { ...ENRICH_IDX };
  const index = {};
  for (const name of Object.keys(ENRICH_IDX)) {
    const at = columns.indexOf(name);
    if (at < 0) throw new Error(`Colonne ${name} absente de l'INSERT plants de la graine.`);
    index[name] = at;
  }
  if (columns.indexOf('id') !== 0) throw new Error('La colonne id doit être la première.');
  return index;
}

async function run() {
  console.log('Mise à jour plants enrichies depuis dump…');
  await initDatabase();
  const sql = fs.readFileSync(DUMP, 'utf8');
  const statements = findInsertStatements(sql, 'plants');
  if (!statements.length) throw new Error('INSERT plants introuvable');
  const enrichIndex = resolveEnrichIndex(statements[0].columns);
  const rows = statements.flatMap((stmt) => parseInsertRows(stmt.text));
  const conn = await pool.getConnection();
  let updated = 0;
  try {
    const setClause = Object.keys(ENRICH_IDX)
      .map((c) => c + '=?')
      .join(', ');
    const sqlUpd = 'UPDATE plants SET ' + setClause + ' WHERE id=?';
    for (const row of rows) {
      const id = row[0];
      if (!id) continue;
      const vals = Object.keys(ENRICH_IDX).map((k) => row[enrichIndex[k]] ?? null);
      vals.push(id);
      const [res] = await conn.query(sqlUpd, vals);
      if (res.affectedRows) updated += res.affectedRows;
    }
    const [[{ c }]] = await conn.query(
      'SELECT COUNT(*) c FROM plants WHERE taxon_kingdom IS NOT NULL',
    );
    console.log('Lignes mises à jour:', updated, '| plants enrichies:', c);
  } finally {
    conn.release();
  }
  await pool.end();
}
if (require.main === module) {
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { ENRICH_IDX, parseInsertRows, resolveEnrichIndex };
