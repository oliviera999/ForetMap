/**
 * Visibilité d'un lieu sur une surface, côté client.
 *
 * Miroir exact de `isVisibleOnSurface()` dans `lib/locationSurfaces.js` : un lieu est visible
 * sur une surface s'il n'y est pas masqué (`hidden_surfaces`) et si, lorsqu'il porte des
 * catégories, au moins l'une d'elles y apparaît (`categories[].surfaces`). Un lieu sans
 * catégorie est visible partout où il n'est pas masqué. Les **catégories-labels**
 * (`is_distinction`, label e-nov, migration 313) sont transparentes là où elles n'apparaissent
 * pas : un lieu qui ne porte que des labels s'y comporte comme un lieu sans catégorie.
 *
 * Les deux implémentations doivent rester alignées — `tests-ui/locationSurfaceVisibility.test.js`
 * rejoue les mêmes cas que `tests/location-surfaces.test.js`. La règle est dupliquée plutôt que
 * demandée au serveur parce que la console doit pouvoir afficher, pour des centaines de lieux
 * déjà chargés, sur quelles surfaces chacun sort — sans un appel par ligne.
 */

import { ALL_SURFACES, normalizeSurfaceList } from '../shared/ui/SurfaceVisibilityField.jsx';

/**
 * @param {{ hidden_surfaces?: unknown, categories?: Array<{ surfaces?: unknown }> }} item
 * @param {string} surface
 * @returns {boolean}
 */
export function isLocationVisibleOnSurface(item, surface) {
  const target = String(surface || '')
    .trim()
    .toLowerCase();
  if (!ALL_SURFACES.includes(target)) return false;
  if (normalizeSurfaceList(item?.hidden_surfaces).includes(target)) return false;
  const categories = Array.isArray(item?.categories) ? item.categories : [];
  if (categories.length === 0) return true;
  if (categories.some((c) => normalizeSurfaceList(c?.surfaces).includes(target))) return true;
  return categories.every((c) => {
    const flag = c?.is_distinction;
    return flag === true || flag === 1 || flag === '1';
  });
}

/** Surfaces sur lesquelles ce lieu sort réellement, dans l'ordre canonique. */
export function visibleSurfacesOfLocation(item) {
  return ALL_SURFACES.filter((surface) => isLocationVisibleOnSurface(item, surface));
}

/**
 * Compte, par surface, les lieux qui y sortent. Sert au bandeau de la revue des surfaces :
 * « combien de lieux le public voit-il aujourd'hui ? » est la question à laquelle un
 * administrateur doit pouvoir répondre avant de publier quoi que ce soit.
 * @param {object[]} items
 * @returns {Record<string, number>}
 */
export function countLocationsBySurface(items = []) {
  const counts = Object.fromEntries(ALL_SURFACES.map((surface) => [surface, 0]));
  for (const item of items) {
    for (const surface of ALL_SURFACES) {
      if (isLocationVisibleOnSurface(item, surface)) counts[surface] += 1;
    }
  }
  return counts;
}
