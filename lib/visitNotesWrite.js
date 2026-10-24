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
 *
 * **Droits.** Les routes de la Visite sont sous `visit.manage`, qui gère la couche Visite
 * (textes, ordre, photos) — pas les compléments réservés. Les lire en entier ou les réécrire
 * exige la permission qui gère le lieu sur la carte (`zones.manage` pour une zone,
 * `map.manage_markers` pour un repère, `canManageLocationNotes`) : sans elle, `notes` dans le
 * corps est refusé (**403**), et la réponse ne porte que les compléments que l'audience
 * ouvre à ce lecteur.
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
const { canManageLocationNotes, projectLocationNotesForViewer } = require('./locationAudience');

const db = { queryAll, queryOne, execute, withTransaction };

/** Table « carte » homologue, pour savoir si un identifiant de visite a un jumeau. */
const MAP_TABLE_BY_KIND = Object.freeze({ zone: 'zones', marker: 'map_markers' });

/** Refus d'écriture des compléments, par type de lieu. */
const NOTES_FORBIDDEN_MESSAGE = Object.freeze({
  zone: 'Compléments réservés d’une zone : permission zones.manage requise',
  marker: 'Compléments réservés d’un repère : permission map.manage_markers requise',
});

/**
 * Valide `req.body.notes`. Répond 403 si le lecteur ne gère pas les compléments de ce type de
 * lieu, 400 si l'entrée est invalide, et rend alors `null` ; sinon rend `{ value }` où `null`
 * signifie « champ non fourni, compléments inchangés ».
 * @param {'zone'|'marker'} kind type du lieu écrit
 */
async function readVisitNotesInput(req, res, kind, { field = 'notes' } = {}) {
  if (req.body?.notes !== undefined && !canManageLocationNotes(req.auth, kind)) {
    res.status(403).json({ error: NOTES_FORBIDDEN_MESSAGE[kind] || 'Permission insuffisante' });
    return null;
  }
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

/**
 * Charge les compléments d'un lieu et les pose sur la charge utile de réponse, **projetés pour
 * le lecteur** : tous (audiences comprises) pour qui gère ce type de lieu, sinon ceux que
 * l'audience lui ouvre, sans la cartographie des audiences.
 */
async function withVisitNotes(kind, locationId, payload, auth) {
  const map = await loadLocationNotesMap(db, kind, [locationId]);
  const notes = projectLocationNotesForViewer(map.get(String(locationId)) || [], auth, { kind });
  return attachNotesToEntity(payload, notes);
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
