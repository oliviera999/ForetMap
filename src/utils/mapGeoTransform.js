/**
 * Transformation affine plan ↔ GPS — **alias historique**.
 *
 * L'implémentation vit désormais dans le noyau carte partagé
 * (`src/shared/pct-map/pctGeoTransform.js`, lot 6 du plan de convergence) : le Plan Lyautey
 * en a besoin pour poser le point de position, et `src/shared` ne peut pas importer de code
 * produit. Aucun nom public ne change ici.
 */
export {
  GEO_SCALE_RATIO_MAX,
  GEO_FLATNESS_MIN,
  isValidAnchors,
  solveAffineFromAnchors,
  applyGeoTransform,
  geoToPct,
  pctToGeo,
  assessAnchorsGeoPlausibility,
  planSizeMeters,
  isPctWithinMap,
} from '../shared/pct-map/pctGeoTransform.js';
