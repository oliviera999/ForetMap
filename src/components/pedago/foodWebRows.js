/**
 * Réseau trophique — helpers purs de la vue liste et des formulaires de gestion (sortis de
 * `FoodWebView.jsx`, chantier collège, flux C3).
 */

import { readElsewhere, readInScope } from './foodWebGraphModel.js';
import {
  DEFAULT_EVIDENCE_LEVEL,
  INTERACTION_TYPES,
  POLLINATION_TYPE,
  orientInteraction,
} from '../../shared/foodWebTypes.js';

/** Formulaire vide d'ajout d'une interaction. */
export const EMPTY_INTERACTION_FORM = Object.freeze({
  fromId: '',
  toId: '',
  type: INTERACTION_TYPES[0],
  description: '',
  evidenceLevel: DEFAULT_EVIDENCE_LEVEL,
  pollinationEfficacy: '',
  sourceRef: '',
});

/**
 * Corps de requête commun à la création et à la modification.
 *
 * L'efficacité de pollinisation n'est envoyée que pour une pollinisation : le serveur refuse
 * la combinaison (une « efficacité » sur une prédation ne veut rien dire), et un champ resté
 * rempli après un changement de type ferait échouer l'enregistrement sans que rien à l'écran
 * ne l'explique.
 */
export function interactionPayload(form) {
  return {
    to_id: form.toId ? Number(form.toId) : null,
    interaction_type: form.type,
    description: form.description.trim() || null,
    evidence_level: form.evidenceLevel || DEFAULT_EVIDENCE_LEVEL,
    pollination_efficacy:
      form.type === POLLINATION_TYPE && form.pollinationEfficacy ? form.pollinationEfficacy : null,
    source_ref: form.sourceRef.trim() || null,
  };
}

/** Formulaire de modification pré-rempli à partir d'une ligne de `/api/food-web`. */
export function editFormFromRow(row) {
  return {
    id: row.id,
    fromId: row.from_id,
    toId: row.to_id == null ? '' : String(row.to_id),
    type: row.interaction_type,
    description: row.description || '',
    evidenceLevel: row.evidence_level || DEFAULT_EVIDENCE_LEVEL,
    pollinationEfficacy: row.pollination_efficacy || '',
    sourceRef: row.source_ref || '',
  };
}

/**
 * Extrémités orientées d'une interaction, prêtes à l'affichage. Chaque extrémité porte
 * `outOfScope` (hors de la carte ou de la zone) et `elsewhere` (cartes où elle vit, `null`
 * sans information) pour la mention « vit ailleurs : … » de la liste.
 */
export function describeRow(row) {
  if (!row) return null;
  const oriented = orientInteraction(row.from_id, row.to_id, row.interaction_type);
  const endpoint = (id) => {
    if (id == null) return { id: null, name: 'Environnement', emoji: '🌍', outOfScope: false };
    const isFrom = Number(id) === Number(row.from_id);
    const outOfScope = !readInScope(isFrom ? row.from_in_scope : row.to_in_scope);
    return {
      id: isFrom ? row.from_id : row.to_id,
      name: isFrom ? row.from_name : row.to_name,
      emoji: isFrom ? row.from_emoji : row.to_emoji,
      outOfScope,
      elsewhere: outOfScope ? readElsewhere(isFrom ? row.from_elsewhere : row.to_elsewhere) : null,
    };
  };
  return {
    tail: endpoint(oriented.tailId),
    head: endpoint(oriented.headId),
    relation: oriented.relation,
    symmetric: oriented.symmetric,
  };
}

/** Lignes regroupées par type d'interaction, types triés (liste). */
export function groupRowsByType(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const key = row.interaction_type || 'autre';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'fr'));
}

/** Options d'espèces triées par nom (formulaires de gestion). */
export function speciesOptionsFromPlants(plants) {
  return (Array.isArray(plants) ? plants : [])
    .map((p) => ({ id: Number(p.id), name: p.name, emoji: p.emoji || '' }))
    .filter((p) => Number.isFinite(p.id) && p.id > 0)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'fr'));
}
