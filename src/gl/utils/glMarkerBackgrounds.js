import {
  DEFAULT_MARKER_BACKGROUNDS,
  normalizeMarkerBackgrounds,
  resolveMarkerBackgroundCssVars,
} from '../../shared/glMarkerBackgroundsCore.js';

export {
  DEFAULT_MARKER_BACKGROUNDS,
  normalizeMarkerBackgrounds,
  resolveMarkerBackgroundCssVars,
} from '../../shared/glMarkerBackgroundsCore.js';

/**
 * Lit les fonds de repères depuis l'objet gameplay settings (camelCase ou clé plateforme).
 */
export function readMarkerBackgroundsFromGameplaySettings(gameplaySettings = {}) {
  const raw = gameplaySettings.markerBackgrounds ?? gameplaySettings['gameplay.marker_backgrounds'];
  return normalizeMarkerBackgrounds(raw ?? DEFAULT_MARKER_BACKGROUNDS);
}

/**
 * Objet style React (variables CSS) pour le conteneur `.gl-app`.
 */
export function markerBackgroundStyleFromSettings(gameplaySettings = {}) {
  return resolveMarkerBackgroundCssVars(
    readMarkerBackgroundsFromGameplaySettings(gameplaySettings),
  );
}
