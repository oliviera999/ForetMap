import { describe, test, expect } from 'vitest';
import {
  DEFAULT_PLATEAU_MAP_VISIBILITY,
  parseChapterMapVisibilityOverride,
  readPlatformPlateauMarkerNumbersVisible,
  readPlatformPlateauMarkersVisible,
  readPlatformPlateauZonesVisible,
  resolvePlateauMapVisibility,
} from '../../src/gl/utils/glPlateauMapVisibility.js';

describe('glPlateauMapVisibility', () => {
  test('défauts plateforme : repères visibles, zones masquées, numéros masqués', () => {
    expect(DEFAULT_PLATEAU_MAP_VISIBILITY).toEqual({
      markersVisible: true,
      zonesVisible: false,
      markerNumbersVisible: false,
    });
    expect(resolvePlateauMapVisibility()).toEqual({
      markersVisible: true,
      zonesVisible: false,
      markerNumbersVisible: false,
    });
  });

  test('réglages plateforme explicites', () => {
    expect(
      resolvePlateauMapVisibility({
        gameplaySettings: {
          plateauMarkersVisible: false,
          plateauZonesVisible: true,
          plateauMarkerNumbersVisible: true,
        },
      }),
    ).toEqual({ markersVisible: false, zonesVisible: true, markerNumbersVisible: true });
  });

  test('override chapitre prioritaire sur la plateforme', () => {
    expect(
      resolvePlateauMapVisibility({
        gameplaySettings: { plateauMarkersVisible: true, plateauZonesVisible: false },
        chapter: { map_markers_visible: false, map_zones_visible: true },
      }),
    ).toEqual({ markersVisible: false, zonesVisible: true, markerNumbersVisible: false });
  });

  test('chapitre null hérite de la plateforme', () => {
    expect(
      resolvePlateauMapVisibility({
        gameplaySettings: { plateauMarkersVisible: false },
        chapter: { map_markers_visible: null, map_zones_visible: null },
      }),
    ).toEqual({ markersVisible: false, zonesVisible: false, markerNumbersVisible: false });
  });

  test('parseChapterMapVisibilityOverride', () => {
    expect(parseChapterMapVisibilityOverride(null)).toBeNull();
    expect(parseChapterMapVisibilityOverride('')).toBeNull();
    expect(parseChapterMapVisibilityOverride(true)).toBe(true);
    expect(parseChapterMapVisibilityOverride('false')).toBe(false);
  });

  test('readPlatformPlateauMarkersVisible retombe sur true si absent', () => {
    expect(readPlatformPlateauMarkersVisible({})).toBe(true);
    expect(readPlatformPlateauMarkersVisible({ plateauMarkersVisible: false })).toBe(false);
  });

  test('readPlatformPlateauMarkerNumbersVisible retombe sur false si absent', () => {
    expect(readPlatformPlateauMarkerNumbersVisible({})).toBe(false);
    expect(readPlatformPlateauMarkerNumbersVisible({ plateauMarkerNumbersVisible: true })).toBe(
      true,
    );
  });

  test('readPlatformPlateauZonesVisible retombe sur false si absent', () => {
    expect(readPlatformPlateauZonesVisible({})).toBe(false);
    expect(readPlatformPlateauZonesVisible({ plateauZonesVisible: true })).toBe(true);
  });
});
