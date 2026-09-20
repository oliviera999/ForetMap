/**
 * Portée des cartes selon le contexte de session (prof / élève / visite publique), extraite
 * de `src/App.jsx` : la même dérivation était écrite deux fois (mémo `visibleMaps` du rendu
 * et résolution de carte à l'intérieur de `fetchAll`).
 *
 * Depuis la suppression de l'affiliation (politique de profils « le plus élevé l'emporte »),
 * le périmètre cartes d'un compte connecté ne vient plus que de ses groupes, et c'est le
 * **serveur** qui filtre `GET /api/maps` : le front n'applique plus aucune restriction
 * d'identifiants, il se contente de préférer les cartes actives.
 */

/**
 * Cartes visibles pour le contexte courant : les cartes actives, ou toutes si aucune n'est
 * active (liste telle que renvoyée par le serveur, déjà bornée au périmètre du compte).
 * @param {Array} maps
 */
export function visibleMapsForScope(maps) {
  const safeMaps = Array.isArray(maps) ? maps : [];
  const activeMaps = safeMaps.filter((mp) => mp?.is_active !== false);
  return activeMaps.length > 0 ? activeMaps : safeMaps;
}

/**
 * Carte par défaut configurée pour le contexte (réglages publics `map.default_map_*`).
 * @param {{ isTeacher?: boolean, isPublicVisit?: boolean,
 *           defaults?: { student?: string, teacher?: string, visit?: string } }} params
 */
export function pickDefaultMapId({ isTeacher, isPublicVisit, defaults = {} } = {}) {
  if (isPublicVisit) return defaults.visit;
  return isTeacher ? defaults.teacher : defaults.student;
}

/**
 * Carte active effective : on garde la carte demandée si elle est visible, sinon on
 * retombe sur la carte par défaut, puis sur la première visible, puis sur la demande brute.
 * @param {{ visibleMaps?: Array, currentMapId?: string, defaultMapId?: string }} params
 * @returns {string}
 */
export function resolveScopedMapId({ visibleMaps, currentMapId, defaultMapId } = {}) {
  const scopedMaps = Array.isArray(visibleMaps) ? visibleMaps : [];
  if (scopedMaps.some((mp) => mp?.id === currentMapId)) return currentMapId;
  return (
    scopedMaps.find((mp) => mp?.id === defaultMapId)?.id || scopedMaps[0]?.id || currentMapId || ''
  );
}
