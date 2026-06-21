import { describe, test, expect } from 'vitest';
import {
  DEFAULT_PLATEAU_MAP_VISIBILITY,
  parseChapterMapVisibilityOverride,
  readPlatformPlateauMarkersVisible,
  readPlatformPlateauZonesVisible,
  resolvePlateauMapVisibility,
} from '../../src/gl/utils/glPlateauMapVisibility.js';

describe('glPlateauMapVisibility', () => {
  test('défauts plateforme : repères visibles, zones masquées', () => {
    expect(DEFAULT_PLATEAU_MAP_VISIBILITY).toEqual({
      markersVisible: true,
      zonesVisible: false,
    });
    expect(resolvePlateauMapVisibility()).toEqual({
      markersVisible: true,
      zonesVisible: false,
    });
  });

  test('réglages plateforme explicites', () => {
    expect(
      resolvePlateauMapVisibility({
        gameplaySettings: { plateauMarkersVisible: false, plateauZonesVisible: true },
      }),
    ).toEqual({ markersVisible: false, zonesVisible: true });
  });

  test('override chapitre prioritaire sur la plateforme', () => {
    expect(
      resolvePlateauMapVisibility({
        gameplaySettings: { plateauMarkersVisible: true, plateauZonesVisible: false },
        chapter: { map_markers_visible: false, map_zones_visible: true },
      }),
    ).toEqual({ markersVisible: false, zonesVisible: true });
  });

  test('chapitre null hérite de la plateforme', () => {
    expect(
      resolvePlateauMapVisibility({
        gameplaySettings: { plateauMarkersVisible: false },
        chapter: { map_markers_visible: null, map_zones_visible: null },
      }),
    ).toEqual({ markersVisible: false, zonesVisible: false });
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

  test('readPlatformPlateauZonesVisible retombe sur false si absent', () => {
    expect(readPlatformPlateauZonesVisible({})).toBe(false);
    expect(readPlatformPlateauZonesVisible({ plateauZonesVisible: true })).toBe(true);
  });
});
