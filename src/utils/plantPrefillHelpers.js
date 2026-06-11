/**
 * Helpers purs de pré-saisie biodiversité (Pl@ntNet / sources externes) — extraits de
 * `foretmap-views.jsx` (O6).
 */

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
