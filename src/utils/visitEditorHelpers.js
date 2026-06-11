/**
 * Helpers purs du panneau d'édition visite — extraits de `visit-views.jsx` (O6).
 *
 * Fonctions sans dépendance React/DOM :
 * - construction de la liste des photos associées à un lieu (pour import dans l'éditeur visite),
 * - normalisation de la liste des ids mascotte autorisés depuis les publicSettings.
 */

/**
 * Construit la liste des photos carte déjà associées à un lieu visite (zone ou repère)
 * pour les proposer à l'import dans l'éditeur. Ne contient que les photos dont `image_url` est présent.
 *
 * Source : `selected.map_lead_photo` (photo principale) + `selected.map_extra_photos` (photos extra).
 * Les ids sont des strings préfixées `map-lead-*` / `map-extra-*` pour éviter toute collision avec
 * les ids numériques de médias visite.
 *
 * @param {object|null} selected — zone ou repère visite sélectionné
 * @returns {Array<{id: string, image_url: string, thumb_url?: string, caption: string}>}
 */
export function buildMapAssociatedPhotos(selected) {
  if (!selected) return [];
  const list = [];
  if (selected?.map_lead_photo?.image_url) {
    list.push({
      id: `map-lead-${selected.map_lead_photo.id || 'x'}`,
      image_url: selected.map_lead_photo.image_url,
      thumb_url: selected.map_lead_photo.thumb_url,
      caption: selected.map_lead_photo.caption || '',
    });
  }
  for (const ph of selected?.map_extra_photos || []) {
    if (!ph?.image_url) continue;
    list.push({
      id: `map-extra-${ph.id || Math.random()}`,
      image_url: ph.image_url,
      thumb_url: ph.thumb_url,
      caption: ph.caption || '',
    });
  }
  return list;
}

/**
 * Normalise la valeur brute de `publicSettings.visit.mascot.allowed_ids` (chaîne CSV, tableau,
 * ou absent) en tableau de strings non vides et sans espaces parasites.
 *
 * @param {string|string[]|null|undefined} raw — valeur brute des settings
 * @returns {string[]}
 */
export function parseVisitMascotAllowedIds(raw) {
  if (Array.isArray(raw)) {
    return raw.map((id) => String(id || '').trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw
      .split(/[,\n;]+/g)
      .map((id) => String(id || '').trim())
      .filter(Boolean);
  }
  return [];
}
