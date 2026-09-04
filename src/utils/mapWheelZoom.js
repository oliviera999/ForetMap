/**
 * Shim de compatibilité : la normalisation de la molette vit dans le noyau carte partagé
 * (`src/shared/pct-map/pctMapWheelZoom.js`, lot 2). Importer le module partagé de préférence.
 */
export {
  normalizeWheelDeltaYPixels,
  wheelZoomScaleFactor,
} from '../shared/pct-map/pctMapWheelZoom.js';
