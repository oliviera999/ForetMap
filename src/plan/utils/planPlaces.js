/**
 * Logique pure du Plan Lyautey (lot 4) : unification zones + repères en « lieux », filtres
 * par catégorie, et lecture du lien profond `?lieu=`. Testée sans rendu (`tests-ui/plan/`).
 */
import { detectLeadingEmojiPrefix, stripLeadingEmojiPrefix } from '../../shared/emojiPrefixCore.js';
import { mapPlaceDisplayParts } from '../../shared/map-guide/mapGuidePlace.js';

/**
 * Emoji et nom d'un libellé saisi : en production, les noms portent presque tous leur emoji
 * en tête (« 📚 CDI ») alors que la colonne `emoji` le porte aussi — sans séparation, l'emoji
 * est affiché deux fois (`docs/AUDIT_PLAN_AFFICHAGE_2026-09.md` B3).
 * @param {string} rawName
 * @returns {{ emoji: string, name: string }}
 */
export function splitNameEmoji(rawName) {
  return {
    emoji: detectLeadingEmojiPrefix(rawName) || '',
    name: stripLeadingEmojiPrefix(rawName),
  };
}

/**
 * Emoji et nom **à afficher** pour un lieu : la colonne `emoji` prime, sinon le préfixe du
 * nom, sinon l'emoji par défaut du type de lieu.
 * @param {object} place
 * @returns {{ emoji: string, name: string }}
 */
export function placeDisplayParts(place) {
  return mapPlaceDisplayParts(place);
}

/**
 * Zones et repères d'une charge `/api/plan/content` → liste unique de lieux, triée par nom
 * (comparaison française, insensible à la casse et aux accents).
 *
 * Chaque lieu porte `kind` (`'zone'` | `'marker'`), `name` (nom affiché) et conserve ses
 * champs d'origine (`points` pour une zone, `x_pct`/`y_pct` pour un repère).
 *
 * @param {{ zones?: Array<object>, markers?: Array<object> }} content
 * @returns {Array<object>}
 */
export function planPlacesFromContent(content) {
  const zones = (content?.zones || []).map((zone) => ({
    ...zone,
    kind: 'zone',
    name: String(zone.name || '').trim(),
  }));
  const markers = (content?.markers || []).map((marker) => ({
    ...marker,
    kind: 'marker',
    name: String(marker.label || '').trim(),
  }));
  const collator = new Intl.Collator('fr-FR', { sensitivity: 'base' });
  return [...zones, ...markers].sort((a, b) => collator.compare(a.name, b.name));
}

/**
 * Filtre par catégories sélectionnées : aucune sélection = tout, sinon un lieu est gardé dès
 * qu'il porte **au moins une** des catégories retenues.
 *
 * `keepUncategorized` garde en plus les lieux **sans aucune catégorie**. Un tel lieu
 * n'appartient à aucune case à cocher : sans cette option, aucune combinaison de puces ne
 * peut le faire apparaître, seul « Tout » le ramène. En production, ce sont quatre entrées du
 * lycée et la loge des visiteurs qui disparaissaient ainsi dès le premier lancement, filtre
 * d'établissement appliqué (`docs/AUDIT_PLAN_NAVIGATION_UX_2026-09-16.md` N3).
 *
 * Le défaut reste l'ancien comportement : la Visite, qui partage cet utilitaire, n'est pas
 * modifiée par ce lot.
 *
 * @param {Array<object>} places
 * @param {Array<string>|Set<string>} selectedCategoryIds
 * @param {{ keepUncategorized?: boolean }} [options]
 */
export function filterPlacesByCategories(places, selectedCategoryIds, options = {}) {
  const { keepUncategorized = false } = options;
  const selected =
    selectedCategoryIds instanceof Set ? selectedCategoryIds : new Set(selectedCategoryIds || []);
  if (selected.size === 0) return places || [];
  return (places || []).filter((place) => {
    const ids = place.category_ids || [];
    if (ids.length === 0) return keepUncategorized;
    return ids.some((id) => selected.has(String(id)));
  });
}

/** Compte des lieux par catégorie (pastilles des puces de filtre). */
export function countPlacesByCategory(places) {
  const counts = new Map();
  for (const place of places || []) {
    for (const id of place.category_ids || []) {
      const key = String(id);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return counts;
}

/** Identifiant de lieu porté par l'URL (`?lieu=`), ou `''`. */
export function readPlaceIdFromLocation(search) {
  try {
    const params = new URLSearchParams(String(search || ''));
    return String(params.get('lieu') || '').trim();
  } catch (_) {
    return '';
  }
}

/**
 * URL de partage d'un lieu : conserve le chemin courant et remplace le seul paramètre `lieu`
 * (vide = paramètre retiré).
 * @param {{ pathname?: string, search?: string }} location
 * @param {string} placeId
 */
export function buildPlaceUrl(location, placeId) {
  const params = new URLSearchParams(String(location?.search || ''));
  if (placeId) params.set('lieu', placeId);
  else params.delete('lieu');
  const query = params.toString();
  return `${location?.pathname || '/'}${query ? `?${query}` : ''}`;
}

/**
 * Point à centrer pour un lieu : le repère lui-même, ou le centre du polygone d'une zone.
 * @param {object} place
 * @param {(raw: string) => Array<{ xp: number, yp: number }>} parsePoints
 * @returns {{ xp: number, yp: number }|null} coordonnées attendues par `focusOnPct`.
 */
export function planPlaceFocusPct(place, parsePoints) {
  if (!place) return null;
  if (place.kind === 'marker') {
    const xp = Number(place.x_pct);
    const yp = Number(place.y_pct);
    return Number.isFinite(xp) && Number.isFinite(yp) ? { xp, yp } : null;
  }
  const points = parsePoints(place.points);
  if (!points || points.length === 0) return null;
  return {
    xp: points.reduce((sum, p) => sum + p.xp, 0) / points.length,
    yp: points.reduce((sum, p) => sum + p.yp, 0) / points.length,
  };
}
