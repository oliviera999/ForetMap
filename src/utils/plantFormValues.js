/**
 * Helpers purs de valeurs de formulaire « fiche plante » — extraits de `foretmap-views.jsx` (O6).
 *
 * Normalisation de valeurs (`-`/vides → ''), détection du libellé générique « Potager »,
 * découpe de liens multi-valeurs (retours ligne / virgules) et fusion d'une URL uploadée avec
 * les liens existants (dédup + position). Logique non triviale isolée ici pour être testée.
 */

/** Valeur de champ nettoyée : `null`/`'-'`/vide → '' ; sinon la chaîne trimée. */
export function normalizedPlantValue(value) {
  if (value == null) return '';
  const s = String(value).trim();
  if (!s || s === '-') return '';
  return s;
}

/** Libellé « Potager » souvent identique sur toutes les fiches — masqué en pastille (pas le lien carte). */
export function isGenericPotagerLabel(value) {
  return normalizedPlantValue(value).toLowerCase() === 'potager';
}

/** Découpe une valeur multi-liens (retours ligne ou virgules) en liste trimée sans vides. */
export function parseLinkCandidates(value) {
  return normalizedPlantValue(value)
    .split(/\n|,\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Fusionne une URL uploadée avec les liens déjà présents (évite les doublons). */
export function mergePlantPhotoFieldValue(prevValue, newUrl, position) {
  const url = String(newUrl || '').trim();
  if (!url) return normalizedPlantValue(prevValue);
  const existing = parseLinkCandidates(prevValue);
  if (existing.includes(url)) return existing.join('\n');
  if (existing.length === 0) return url;
  if (position === 'prepend') return [url, ...existing].join('\n');
  return [...existing, url].join('\n');
}
