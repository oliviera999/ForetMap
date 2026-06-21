'use strict';
require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const { initDatabase, pool } = require('../database');

const DUMP = path.join(__dirname, '..', 'sql', 'foretmap_bdd_complete.sql');

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
    if (!inString && c === ';') return sql.slice(start, i + 1);
    i++;
  }
  return null;
}

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

async function run() {
  console.log('Mise à jour plants enrichies depuis dump…');
  await initDatabase();
  const sql = fs.readFileSync(DUMP, 'utf8');
  const insert = extractInsert(sql, 'plants');
  if (!insert) throw new Error('INSERT plants introuvable');
  const rows = parseInsertRows(insert);
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
      const vals = Object.keys(ENRICH_IDX).map((k) => row[ENRICH_IDX[k]] ?? null);
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
run().catch((e) => {
  console.error(e);
  process.exit(1);
});
