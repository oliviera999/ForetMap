'use strict';

/**
 * Écriture des compléments réservés depuis les routes de la **Visite** (migration 263).
 *
 * `visit_zones.id` vaut `zones.id` : les deux surfaces adressent les mêmes lignes de
 * `location_notes`. Éditer un complément depuis la Visite, c'est donc éditer celui de la
 * carte — c'est voulu, un lieu n'a qu'un jeu de compléments, et c'est précisément ce qui
 * remplace la recopie de colonnes que la synchronisation traînait depuis la migration 240.
 *
 * Conséquence sur la suppression : retirer une cible de visite ne doit effacer les
 * compléments que si le lieu n'existe **que** côté visite, sinon on viderait ceux de la zone
 * de carte restée en place.
 */

const { queryAll, queryOne, execute, withTransaction } = require('../database');
const {
  assertLocationNotesGroupsExist,
  normalizeLocationNotesInput,
  loadLocationNotesMap,
  attachNotesToEntity,
  replaceLocationNotes,
  deleteLocationNotes,
} = require('./locationNotes');

const db = { queryAll, queryOne, execute, withTransaction };

/** Table « carte » homologue, pour savoir si un identifiant de visite a un jumeau. */
const MAP_TABLE_BY_KIND = Object.freeze({ zone: 'zones', marker: 'map_markers' });

/**
 * Valide `req.body.notes`. Répond 400 et rend `null` si l'entrée est invalide ; sinon rend
 * `{ value }` où `null` signifie « champ non fourni, compléments inchangés ».
 */
async function readVisitNotesInput(req, res, { field = 'notes' } = {}) {
  const parsed = normalizeLocationNotesInput(req.body?.notes, { field });
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return null;
  }
  if (parsed.value !== null) {
    const groupsCheck = await assertLocationNotesGroupsExist(db, parsed.value, { field });
    if (!groupsCheck.ok) {
      res.status(400).json({ error: groupsCheck.error });
      return null;
    }
  }
  return parsed;
}

/** Applique une entrée normalisée (no-op si le champ n'était pas fourni). */
async function applyVisitNotes(kind, locationId, notesInput) {
  if (!notesInput || notesInput.value === null) return;
  await replaceLocationNotes(db, kind, locationId, notesInput.value);
}

/** Charge les compléments d'un lieu et les pose sur la charge utile de réponse. */
async function withVisitNotes(kind, locationId, payload) {
  const map = await loadLocationNotesMap(db, kind, [locationId]);
  return attachNotesToEntity(payload, map.get(String(locationId)) || []);
}

/**
 * Nettoyage à la suppression d'une cible de visite : uniquement si aucun lieu de carte ne
 * partage l'identifiant (voir l'en-tête du module).
 */
async function deleteVisitOnlyNotes(tx, kind, locationId) {
  const table = MAP_TABLE_BY_KIND[kind];
  if (!table) return;
  // `table` vient d'une table de correspondance fermée : sûr à interpoler comme identifiant
  // SQL (un identifiant ne peut pas être paramétré par `?`).
  const twin = await tx.queryAll(`SELECT id FROM ${table} WHERE id = ? LIMIT 1`, [
    String(locationId),
  ]);
  if (twin.length) return;
  await deleteLocationNotes(tx, kind, locationId);
}

module.exports = {
  readVisitNotesInput,
  applyVisitNotes,
  withVisitNotes,
  deleteVisitOnlyNotes,
};
