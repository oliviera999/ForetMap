/**
 * Helpers purs de pré-saisie biodiversité (Pl@ntNet / sources externes) — extraits de
 * `foretmap-views.jsx` (O6).
 */

import { prefillPhotoSlotKey } from './biodivPlantForm.js';

/**
 * Groupe les photos de pré-saisie par champ cible (`field`), dans l'ordre de rencontre.
 * Les photos sans `field` (vide/espaces) sont ignorées. Retourne un objet `{ field: photo[] }`.
 */
export function groupPrefillPhotosByField(photos) {
  const groups = {};
  for (const photo of photos || []) {
    const field = String(photo?.field || '').trim();
    if (!field) continue;
    if (!groups[field]) groups[field] = [];
    groups[field].push(photo);
  }
  return groups;
}

/**
 * Sélection initiale des champs texte après une pré-saisie : pour chaque champ proposé non vide,
 * coché par défaut si le formulaire courant est vide sur ce champ (ou systématiquement si
 * `overwriteFilled`). Les champs sans proposition ne figurent pas dans le résultat.
 *
 * @param {object} data réponse `GET /api/plants/autofill` (`data.fields`)
 * @param {object} latestForm formulaire courant (valeurs déjà saisies)
 * @param {{ overwriteFilled?: boolean, speciesPrefillFields?: string[] }} opts
 * @returns {Record<string, boolean>} `{ champ: coché }`
 */
export function buildPrefillFieldSelection(data, latestForm, opts = {}) {
  const { overwriteFilled = false, speciesPrefillFields = [] } = opts;
  const nextFields = {};
  for (const key of speciesPrefillFields) {
    const value = String(data?.fields?.[key] || '').trim();
    if (!value) continue;
    const hasCurrentValue = String(latestForm?.[key] || '').trim().length > 0;
    nextFields[key] = overwriteFilled ? true : !hasCurrentValue;
  }
  return nextFields;
}

/**
 * Sélections initiales des photos proposées : un emplacement `champ:index` par photo, décoché
 * par défaut (l'utilisateur coche pour ajouter), avec champ cible = champ source s'il appartient
 * à `photoFieldKeys`, sinon repli sur `photo_species`.
 *
 * @param {Array<object>} photos photos de la réponse autofill (`data.photos`)
 * @param {Set<string>} photoFieldKeys champs photo valides du formulaire
 * @returns {Record<string, { checked: boolean, assignTo: string }>}
 */
export function buildInitialPrefillPhotoSelections(photos, photoFieldKeys) {
  const keys = photoFieldKeys instanceof Set ? photoFieldKeys : new Set(photoFieldKeys || []);
  const photosByField = groupPrefillPhotosByField(photos);
  const nextPhotoSel = {};
  for (const [field, list] of Object.entries(photosByField)) {
    (list || []).forEach((_, idx) => {
      const slot = prefillPhotoSlotKey(field, idx);
      const defaultTarget = keys.has(field) ? field : 'photo_species';
      // Propositions visibles par défaut ; l’utilisateur coche pour ajouter sans remplacer les photos déjà présentes.
      nextPhotoSel[slot] = { checked: false, assignTo: defaultTarget };
    });
  }
  return nextPhotoSel;
}
