/**
 * Helpers purs d'identification Pl@ntNet (formulaire de fiche plante) — extraits de
 * `foretmap-views.jsx` (O6).
 */

import { pickPlantnetVernacularName } from './biodivPlantForm.js';

/** Slots d'identification ayant une image (imageData non vide après trim). */
export function filterNonEmptyIdentifySlots(slots) {
  return (Array.isArray(slots) ? slots : []).filter(
    (r) => String(r?.imageData || '').trim().length > 0,
  );
}

/**
 * Construit la liste d'images `{ organ, imageData }` envoyée à `/api/plants/plantnet-identify`
 * à partir des slots : ne garde que ceux avec image, `organ` par défaut `'auto'`.
 */
export function buildPlantnetIdentifyImages(slots) {
  return filterNonEmptyIdentifySlots(slots).map((r) => ({
    organ: r.organ || 'auto',
    imageData: r.imageData,
  }));
}

/**
 * Dérive la mise à jour `{ scientific_name, name }` du formulaire à partir d'une prédiction
 * Pl@ntNet : nom scientifique (tronqué à 200) et nom usuel « à consonance française » si dispo
 * (sinon nom scientifique sans auteur). Conserve la valeur courante du formulaire si la
 * prédiction est vide. Retourne `{}` (no-op) pour une prédiction invalide.
 */
export function derivePlantnetNameUpdate(pred, form = {}) {
  if (!pred || typeof pred !== 'object') return {};
  const sci = String(pred.scientificName || pred.scientificNameWithoutAuthor || '').trim();
  const vern = pickPlantnetVernacularName(pred.commonNames);
  const nameGuess = vern || String(pred.scientificNameWithoutAuthor || '').trim();
  return {
    scientific_name: sci.slice(0, 200) || form.scientific_name,
    name: (nameGuess && nameGuess.slice(0, 200)) || form.name,
  };
}
