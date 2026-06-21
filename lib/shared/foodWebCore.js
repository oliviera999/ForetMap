'use strict';

/**
 * Noyau partagé « réseau trophique » (interactions biotiques).
 *
 * Source de vérité unique des types d'interaction + logique CRUD générique,
 * réutilisable par ForetMap (`species_interactions` ↔ `plants`) ET par
 * Gnomes & Licornes (`gl_species_interactions` ↔ `gl_species`). Seule la
 * configuration de table change ; la validation et les règles métier restent
 * communes (cf. `docs/GL_ARCHITECTURE.md`, couche « Noyaux »).
 */

const INTERACTION_TYPES = Object.freeze([
  'pollinisation',
  'herbivorie',
  'predation',
  'plante_hote',
  'decomposition',
  'nitrification',
  'symbiose',
  'competition',
]);

const INTERACTION_TYPE_LABELS = Object.freeze({
  pollinisation: 'Pollinisation',
  herbivorie: 'Herbivorie',
  predation: 'Prédation',
  plante_hote: 'Plante hôte',
  decomposition: 'Décomposition',
  nitrification: 'Nitrification',
  symbiose: 'Symbiose',
  competition: 'Compétition',
});

const INTERACTION_TYPE_SET = new Set(INTERACTION_TYPES);

const MAX_DESCRIPTION_LEN = 255;

/** Libellé FR d'un type, avec repli sur la valeur brute. */
function interactionTypeLabel(type) {
  const key = String(type || '')
    .trim()
    .toLowerCase();
  return INTERACTION_TYPE_LABELS[key] || type || 'Interaction';
}

function isInteractionType(type) {
  return INTERACTION_TYPE_SET.has(
    String(type || '')
      .trim()
      .toLowerCase(),
  );
}

/**
 * Normalise + valide une saisie d'interaction (indifférent au produit).
 * Accepte les clés snake_case (`from_id`) ou camelCase (`fromId`).
 * @returns {{ value: { fromId: number, toId: number|null, type: string, description: string|null }, errors: string[] }}
 */
function normalizeInteractionInput(raw = {}) {
  const errors = [];
  const fromId = Number(raw.from_id ?? raw.fromId);
  const toRaw = raw.to_id ?? raw.toId;
  const type = String(raw.interaction_type ?? raw.interactionType ?? '')
    .trim()
    .toLowerCase();

  if (!Number.isInteger(fromId) || fromId <= 0) {
    errors.push('Espèce source invalide');
  }

  let toId = null;
  if (toRaw != null && String(toRaw).trim() !== '') {
    toId = Number(toRaw);
    if (!Number.isInteger(toId) || toId <= 0) errors.push('Espèce cible invalide');
  }

  if (Number.isInteger(fromId) && fromId > 0 && toId != null && toId === fromId) {
    errors.push('Une espèce ne peut pas interagir avec elle-même');
  }

  if (!isInteractionType(type)) {
    errors.push('Type d’interaction invalide');
  }

  let description = raw.description == null ? null : String(raw.description).trim();
  if (description === '') description = null;
  if (description && description.length > MAX_DESCRIPTION_LEN) {
    description = description.slice(0, MAX_DESCRIPTION_LEN);
  }

  return { value: { fromId, toId, type, description }, errors };
}

/**
 * Fabrique un magasin CRUD pour une table d'interactions donnée.
 *
 * Les noms de table/colonnes proviennent d'une configuration interne (jamais
 * d'une entrée utilisateur) : l'interpolation SQL est donc sûre.
 *
 * @param {{ queryOne: Function, execute: Function }} db helpers base de données
 * @param {{ table: string, fromCol: string, toCol: string, refTable: string, refIdCol?: string }} config
 */
function makeFoodWebStore(db, config) {
  const { queryOne, execute } = db || {};
  if (typeof queryOne !== 'function' || typeof execute !== 'function') {
    throw new Error('makeFoodWebStore: db.queryOne et db.execute requis');
  }
  const { table, fromCol, toCol, refTable } = config || {};
  const refIdCol = config?.refIdCol || 'id';
  if (!table || !fromCol || !toCol || !refTable) {
    throw new Error('makeFoodWebStore: configuration de table incomplète');
  }

  async function refExists(id) {
    if (!Number.isInteger(id) || id <= 0) return false;
    const row = await queryOne(
      `SELECT ${refIdCol} AS id FROM ${refTable} WHERE ${refIdCol} = ? LIMIT 1`,
      [id],
    );
    return !!row;
  }

  async function getById(id) {
    return queryOne(
      `SELECT id, ${fromCol} AS from_id, ${toCol} AS to_id, interaction_type, description
         FROM ${table} WHERE id = ? LIMIT 1`,
      [id],
    );
  }

  /** @returns {Promise<{ id:number }|null>} l'éventuel doublon (from/to/type), to NULL inclus. */
  async function findDuplicate(fromId, toId, type, excludeId = null) {
    return queryOne(
      `SELECT id FROM ${table}
        WHERE ${fromCol} = ? AND ${toCol} <=> ? AND interaction_type = ?
          AND (? IS NULL OR id <> ?)
        LIMIT 1`,
      [fromId, toId, type, excludeId, excludeId],
    );
  }

  async function create(rawInput) {
    const { value, errors } = normalizeInteractionInput(rawInput);
    if (errors.length) return { ok: false, status: 400, error: errors[0], errors };
    if (!(await refExists(value.fromId))) {
      return { ok: false, status: 400, error: 'Espèce source introuvable' };
    }
    if (value.toId != null && !(await refExists(value.toId))) {
      return { ok: false, status: 400, error: 'Espèce cible introuvable' };
    }
    if (await findDuplicate(value.fromId, value.toId, value.type)) {
      return { ok: false, status: 409, error: 'Interaction déjà existante' };
    }
    const result = await execute(
      `INSERT INTO ${table} (${fromCol}, ${toCol}, interaction_type, description)
       VALUES (?, ?, ?, ?)`,
      [value.fromId, value.toId, value.type, value.description],
    );
    return { ok: true, status: 201, row: await getById(result.insertId) };
  }

  async function update(id, rawInput) {
    if (!Number.isInteger(id) || id <= 0) {
      return { ok: false, status: 400, error: 'Identifiant invalide' };
    }
    const existing = await getById(id);
    if (!existing) return { ok: false, status: 404, error: 'Interaction introuvable' };
    const { value, errors } = normalizeInteractionInput(rawInput);
    if (errors.length) return { ok: false, status: 400, error: errors[0], errors };
    if (!(await refExists(value.fromId))) {
      return { ok: false, status: 400, error: 'Espèce source introuvable' };
    }
    if (value.toId != null && !(await refExists(value.toId))) {
      return { ok: false, status: 400, error: 'Espèce cible introuvable' };
    }
    if (await findDuplicate(value.fromId, value.toId, value.type, id)) {
      return { ok: false, status: 409, error: 'Interaction déjà existante' };
    }
    await execute(
      `UPDATE ${table}
          SET ${fromCol} = ?, ${toCol} = ?, interaction_type = ?, description = ?
        WHERE id = ?`,
      [value.fromId, value.toId, value.type, value.description, id],
    );
    return { ok: true, status: 200, row: await getById(id) };
  }

  async function remove(id) {
    if (!Number.isInteger(id) || id <= 0) {
      return { ok: false, status: 400, error: 'Identifiant invalide' };
    }
    const existing = await getById(id);
    if (!existing) return { ok: false, status: 404, error: 'Interaction introuvable' };
    await execute(`DELETE FROM ${table} WHERE id = ?`, [id]);
    return { ok: true, status: 200, row: existing };
  }

  return { getById, create, update, remove, refExists };
}

module.exports = {
  INTERACTION_TYPES,
  INTERACTION_TYPE_LABELS,
  MAX_DESCRIPTION_LEN,
  interactionTypeLabel,
  isInteractionType,
  normalizeInteractionInput,
  makeFoodWebStore,
};
