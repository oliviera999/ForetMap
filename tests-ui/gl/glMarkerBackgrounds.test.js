import { describe, test, expect } from 'vitest';
import {
  markerBackgroundStyleFromSettings,
  readMarkerBackgroundsFromGameplaySettings,
} from '../../src/gl/utils/glMarkerBackgrounds.js';

describe('glMarkerBackgrounds', () => {
  test('défaut transparent sans réglage', () => {
    expect(readMarkerBackgroundsFromGameplaySettings({})).toEqual({
      label: 'transparent',
      emoji: 'transparent',
      icon: 'transparent',
    });
    expect(markerBackgroundStyleFromSettings({})['--gl-marker-bg-label']).toBe('transparent');
  });

  test('lit markerBackgrounds camelCase depuis gameplay-settings', () => {
    const style = markerBackgroundStyleFromSettings({
      markerBackgrounds: { label: 'classic', emoji: 'transparent', icon: 'transparent' },
    });
    expect(style['--gl-marker-bg-label']).toBe('#fb923c');
    expect(style['--gl-marker-label-text-shadow']).toBe('none');
  });

  test('lit clé plateforme gameplay.marker_backgrounds', () => {
    const backgrounds = readMarkerBackgroundsFromGameplaySettings({
      'gameplay.marker_backgrounds': { label: '#aabbcc', emoji: 'transparent', icon: 'transparent' },
    });
    expect(backgrounds.label).toBe('#aabbcc');
  });
});
