'use strict';

/**
 * Corpus des textes montrés aux **visiteurs** (visite publique, fiche espèce ouverte depuis la
 * visite), et exceptions arbitrées. Partagé par le test de contenu
 * (`tests/content/visitor-texts.test.js`) et le script d'audit de la base de production
 * (`scripts/audit-visitor-texts.js`).
 */

const { scanVisitorText } = require('./visitorTextGuard');

/** Colonnes texte lues, par table. `pack_json` : dialogues des mascottes. */
const VISITOR_TEXT_SOURCES = Object.freeze([
  {
    table: 'visit_zones',
    idColumn: 'id',
    columns: [
      'name',
      'subtitle',
      'short_description',
      'details_title',
      'details_text',
      'body_json',
    ],
  },
  {
    table: 'visit_markers',
    idColumn: 'id',
    columns: [
      'label',
      'subtitle',
      'short_description',
      'details_title',
      'details_text',
      'body_json',
    ],
  },
  { table: 'visit_media', idColumn: 'id', columns: ['caption'] },
  { table: 'visit_mascot_packs', idColumn: 'id', columns: ['pack_json'] },
  {
    table: 'plants',
    idColumn: 'id',
    columns: [
      'description',
      'habitat',
      'ecosystem_role',
      'human_utility',
      'harvest_part',
      'planting_recommendations',
      'hazard_notes',
      'health_notes',
      'remark_1',
      'remark_2',
      'remark_3',
    ],
  },
  { table: 'map_species', idColumn: 'plant_id', columns: ['site_notes'] },
]);

/**
 * Exceptions arbitrées : incitations apparentes que le mainteneur a décidé de garder
 * (décision Q8 du 25/09/2026). Chaque entrée vise un extrait précis, jamais une table entière.
 */
const VISITOR_TEXT_EXCEPTIONS = Object.freeze([
  {
    // Consigne d'activité sur le **sol** (pas un être vivant), adressée à un groupe encadré.
    contains: 'prélevez une carotte de sol',
    reason: 'décision du 25/09/2026 (Q8) : texte conservé, le sol n’est pas un être vivant',
  },
]);

function isException(hit) {
  const text = String(hit.extract || '').toLowerCase();
  return VISITOR_TEXT_EXCEPTIONS.some((ex) => text.includes(ex.contains.toLowerCase()));
}

/**
 * Parcourt le corpus en base.
 * @param {{ queryAll: Function }} db
 * @returns {Promise<Array<{ table: string, id: string, column: string, rule: string, match: string, cls: string, extract: string, excepted: boolean }>>}
 */
async function scanVisitorTextCorpus(db) {
  const out = [];
  for (const source of VISITOR_TEXT_SOURCES) {
    let rows;
    try {
      rows = await db.queryAll(
        `SELECT ${source.idColumn} AS row_id, ${source.columns.join(', ')} FROM ${source.table}`,
      );
    } catch (err) {
      if (err && (err.errno === 1146 || err.errno === 1054)) continue; // table/colonne absente
      throw err;
    }
    for (const row of rows) {
      for (const column of source.columns) {
        for (const hit of scanVisitorText(row[column])) {
          out.push({
            table: source.table,
            id: String(row.row_id),
            column,
            ...hit,
            excepted: isException(hit),
          });
        }
      }
    }
  }
  return out;
}

module.exports = { VISITOR_TEXT_SOURCES, VISITOR_TEXT_EXCEPTIONS, scanVisitorTextCorpus };
