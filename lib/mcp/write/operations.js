'use strict';

/**
 * Opérations d'écriture de contenu admises par le connecteur MCP — **liste blanche fermée**.
 *
 * Trois familles, et rien d'autre :
 * - `set_field` : remplacer la valeur d'un champ TEXTE d'une ligne de contenu, identifiée par
 *   sa clé primaire. Tables et colonnes autorisées : `EDITABLE_FIELDS` ci-dessous ;
 * - `link` / `unlink` : rattacher ou détacher une espèce d'une zone, d'un repère, du registre
 *   d'une carte ou d'un terme de glossaire (`LINK_TABLES`).
 *
 * Aucune table de données personnelles n'y figure ; `assertTableReadable` est en plus rejoué
 * sur chaque table cible (la liste noire prime toujours). Les colonnes nominatives
 * (`*_by`, `*_user_id`…) sont refusées par `DENIED_COLUMN_RE` même si quelqu'un les ajoutait ici.
 */

const { assertTableReadable, DENIED_COLUMN_RE, McpDataAccessError } = require('../sqlGuard');

/** Table → { pk: [colonnes], fields: { colonne: longueur max } }. */
const EDITABLE_FIELDS = Object.freeze({
  plants: {
    pk: ['id'],
    fields: {
      name: 255,
      second_name: 255,
      scientific_name: 255,
      description: 20000,
      habitat: 255,
      ecosystem_role: 20000,
      human_utility: 20000,
      identification_criteria: 20000,
      lookalike_species: 20000,
      remarks: 20000,
      hazard_notes: 20000,
      health_notes: 20000,
      sources: 20000,
      photo_credit: 255,
      photo_licence: 64,
    },
  },
  plant_photos: { pk: ['id'], fields: { credit: 255, licence: 64, source_url: 1024 } },
  zones: { pk: ['id'], fields: { name: 255, description: 20000 } },
  map_markers: { pk: ['id'], fields: { label: 255, note: 20000 } },
  glossary_terms: {
    pk: ['glossary_code'],
    fields: { definition_courte: 255, definition_complete: 20000, exemple: 20000, etymologie: 255 },
  },
  gl_glossary_terms: {
    pk: ['glossary_code'],
    fields: { definition_courte: 255, definition_complete: 20000, exemple: 20000, etymologie: 255 },
  },
  gl_species: {
    pk: ['species_code'],
    fields: {
      description_courte: 20000,
      role_ecologique: 20000,
      adaptations_cles: 20000,
      anecdote: 20000,
      photo_credit: 512,
      photo_licence: 120,
      photo_licence_url: 512,
    },
  },
  quiz_questions: {
    pk: ['question_code'],
    fields: {
      feedback_correct: 20000,
      feedback_a: 20000,
      feedback_b: 20000,
      feedback_c: 20000,
      feedback_d: 20000,
      feedback_e: 20000,
      photo_credit: 20000,
      photo_licence: 160,
    },
  },
  gl_qcm_questions: {
    pk: ['question_code'],
    fields: {
      niveau: 64,
      feedback_correct: 20000,
      feedback_a: 20000,
      feedback_b: 20000,
      feedback_c: 20000,
      feedback_d: 20000,
      feedback_e: 20000,
      photo_credit: 20000,
      photo_licence: 120,
    },
  },
});

/** Liaisons espèce ↔ lieu / terme (tables de jonction à clé composite). */
const LINK_TABLES = Object.freeze({
  zone_species: { cols: ['zone_id', 'plant_id'], parents: { zone_id: ['zones', 'id'] } },
  marker_species: {
    cols: ['marker_id', 'plant_id'],
    parents: { marker_id: ['map_markers', 'id'] },
  },
  map_species: { cols: ['map_id', 'plant_id'], parents: { map_id: ['maps', 'id'] } },
  glossary_term_species: {
    cols: ['glossary_code', 'plant_id'],
    parents: { glossary_code: ['glossary_terms', 'glossary_code'] },
  },
});

const MAX_OPERATIONS = 50;

function fail(message) {
  throw new McpDataAccessError(message, 'MCP_WRITE_REJECTED');
}

/** Valeur propre d'une clé (jamais héritée du prototype : `constructor`, `__proto__`…). */
function ownKey(obj, k) {
  return obj && typeof obj === 'object' && Object.hasOwn(obj, k) ? obj[k] : undefined;
}

function asKey(value) {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string' && value.trim() && value.length <= 64) return value.trim();
  return fail('Identifiant invalide');
}

/**
 * Normalise et valide une opération. Lève `McpDataAccessError` si elle sort de la liste.
 * @returns {object} opération normalisée
 */
function normalizeOperation(op) {
  if (!op || typeof op !== 'object') fail('Opération invalide');
  if (op.op === 'set_field') {
    const def = Object.hasOwn(EDITABLE_FIELDS, op.table) ? EDITABLE_FIELDS[op.table] : null;
    if (!def) fail(`Table « ${op.table} » non modifiable par le connecteur`);
    assertTableReadable(op.table);
    const max = Object.hasOwn(def.fields, op.column) ? def.fields[op.column] : null;
    if (!max || DENIED_COLUMN_RE.test(String(op.column))) {
      fail(`Colonne « ${op.table}.${op.column} » non modifiable par le connecteur`);
    }
    if (op.value !== null && typeof op.value !== 'string') fail('Valeur texte ou null attendue');
    if (typeof op.value === 'string' && op.value.length > max) {
      fail(`Valeur trop longue pour ${op.table}.${op.column} (max ${max})`);
    }
    const key = {};
    for (const col of def.pk) key[col] = asKey(ownKey(op.key, col));
    return { op: 'set_field', table: op.table, column: op.column, key, value: op.value };
  }
  if (op.op === 'link' || op.op === 'unlink') {
    const def = Object.hasOwn(LINK_TABLES, op.table) ? LINK_TABLES[op.table] : null;
    if (!def) fail(`Liaison « ${op.table} » non admise`);
    assertTableReadable(op.table);
    const key = {};
    for (const col of def.cols) key[col] = asKey(ownKey(op.key, col));
    key.plant_id = Number(key.plant_id);
    if (!Number.isInteger(key.plant_id) || key.plant_id <= 0) fail('plant_id entier attendu');
    return { op: op.op, table: op.table, key };
  }
  return fail(`Type d’opération inconnu : ${op.op}`);
}

function normalizeOperations(ops) {
  if (!Array.isArray(ops) || ops.length === 0) fail('Au moins une opération attendue');
  if (ops.length > MAX_OPERATIONS) fail(`Au plus ${MAX_OPERATIONS} opérations par plan`);
  return ops.map(normalizeOperation);
}

module.exports = {
  EDITABLE_FIELDS,
  LINK_TABLES,
  MAX_OPERATIONS,
  normalizeOperation,
  normalizeOperations,
};
