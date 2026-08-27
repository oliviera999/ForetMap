/**
 * Portée des cartes selon le contexte de session (prof / élève affilié / visite publique),
 * extraite de `src/App.jsx` : la même dérivation était écrite deux fois (mémo `visibleMaps`
 * du rendu et résolution de carte à l'intérieur de `fetchAll`).
 */
import { allowedMapIdsFromAffiliation, mapsForAffiliationScope } from './mapAffiliation';

/**
 * Ids de cartes autorisés pour le contexte courant : `null` = aucune restriction
 * (prof ou visite publique), sinon la restriction issue de l'affiliation élève.
 * @param {{ isTeacher?: boolean, isPublicVisit?: boolean, affiliation?: string|null }} scope
 * @returns {string[]|null}
 */
export function allowedMapIdsForScope({ isTeacher, isPublicVisit, affiliation } = {}) {
  if (isTeacher || isPublicVisit) return null;
  return allowedMapIdsFromAffiliation(affiliation);
}

/**
 * Cartes visibles pour le contexte courant (actives d'abord, repliées sur la portée
 * d'affiliation quand elle existe).
 * @param {Array} maps
 * @param {{ isTeacher?: boolean, isPublicVisit?: boolean, affiliation?: string|null }} scope
 */
export function visibleMapsForScope(maps, scope) {
  return mapsForAffiliationScope(maps, allowedMapIdsForScope(scope));
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
 * Une restriction d'affiliation qui exclut la carte courante réoriente d'abord la demande.
 * @param {{ visibleMaps?: Array, allowedMapIds?: string[]|null, currentMapId?: string,
 *           defaultMapId?: string }} params
 * @returns {string}
 */
export function resolveScopedMapId({
  visibleMaps,
  allowedMapIds,
  currentMapId,
  defaultMapId,
} = {}) {
  const scopedMaps = Array.isArray(visibleMaps) ? visibleMaps : [];
  const requestedMapId =
    Array.isArray(allowedMapIds) && !allowedMapIds.includes(currentMapId)
      ? allowedMapIds[0]
      : currentMapId;
  if (scopedMaps.some((mp) => mp?.id === requestedMapId)) return requestedMapId;
  return (
    scopedMaps.find((mp) => mp?.id === defaultMapId)?.id ||
    scopedMaps[0]?.id ||
    requestedMapId ||
    ''
  );
}
