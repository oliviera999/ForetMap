/**
 * Visibilité repères et zones feuillets sur la carte plateau en partie.
 * Défaut plateforme : repères visibles, zones masquées ; le chapitre peut surcharger (NULL = hériter).
 */

export const DEFAULT_PLATEAU_MAP_VISIBILITY = Object.freeze({
  markersVisible: true,
  zonesVisible: false,
  markerNumbersVisible: false,
});

/** Normalise un override chapitre (null = hériter du défaut plateforme). */
export function parseChapterMapVisibilityOverride(value) {
  if (value == null || value === '') return null;
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 0 || value === '0') return false;
  return null;
}

export function readPlatformPlateauMarkersVisible(gameplaySettings = {}) {
  const raw =
    gameplaySettings.plateauMarkersVisible ?? gameplaySettings['gameplay.plateau_markers_visible'];
  if (raw == null) return DEFAULT_PLATEAU_MAP_VISIBILITY.markersVisible;
  return raw === true || raw === 'true';
}

export function readPlatformPlateauZonesVisible(gameplaySettings = {}) {
  const raw =
    gameplaySettings.plateauZonesVisible ?? gameplaySettings['gameplay.plateau_zones_visible'];
  if (raw == null) return DEFAULT_PLATEAU_MAP_VISIBILITY.zonesVisible;
  return raw === true || raw === 'true';
}

export function readPlatformPlateauMarkerNumbersVisible(gameplaySettings = {}) {
  const raw =
    gameplaySettings.plateauMarkerNumbersVisible ??
    gameplaySettings['gameplay.plateau_marker_numbers_visible'];
  if (raw == null) return DEFAULT_PLATEAU_MAP_VISIBILITY.markerNumbersVisible;
  return raw === true || raw === 'true';
}

/**
 * @param {{ gameplaySettings?: object, chapter?: object }} options
 * @returns {{ markersVisible: boolean, zonesVisible: boolean, markerNumbersVisible: boolean }}
 */
export function resolvePlateauMapVisibility({ gameplaySettings = {}, chapter = {} } = {}) {
  const platformMarkers = readPlatformPlateauMarkersVisible(gameplaySettings);
  const platformZones = readPlatformPlateauZonesVisible(gameplaySettings);
  const markerNumbersVisible = readPlatformPlateauMarkerNumbersVisible(gameplaySettings);

  const chapterMarkers = parseChapterMapVisibilityOverride(
    chapter.map_markers_visible ?? chapter.mapMarkersVisible,
  );
  const chapterZones = parseChapterMapVisibilityOverride(
    chapter.map_zones_visible ?? chapter.mapZonesVisible,
  );

  return {
    markersVisible: chapterMarkers ?? platformMarkers,
    zonesVisible: chapterZones ?? platformZones,
    markerNumbersVisible,
  };
}
