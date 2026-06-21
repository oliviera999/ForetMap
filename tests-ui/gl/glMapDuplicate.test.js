import { describe, test, expect } from 'vitest';
import {
  clampPct,
  duplicateMapLabel,
  offsetPctCoordinate,
  offsetPctPoints,
  DUPLICATE_MAP_OFFSET_PCT,
} from '../../src/gl/utils/glMapDuplicate.js';
import { zoneDuplicateCreatePayloadFromZone } from '../../src/gl/hooks/useGLKingdomZoneEditor.js';
import { markerDuplicatePayloadFromMarker } from '../../src/gl/utils/glChapterMapStudioForm.js';

describe('glMapDuplicate', () => {
  test('clampPct borne entre 0 et 100', () => {
    expect(clampPct(-5)).toBe(0);
    expect(clampPct(150)).toBe(100);
    expect(clampPct(42.5)).toBe(42.5);
  });

  test('offsetPctCoordinate applique le décalage par défaut', () => {
    expect(offsetPctCoordinate(10)).toBe(10 + DUPLICATE_MAP_OFFSET_PCT);
    expect(offsetPctCoordinate(99)).toBe(100);
  });

  test('duplicateMapLabel ajoute le suffixe copie', () => {
    expect(duplicateMapLabel('Forêt')).toBe('Forêt (copie)');
    expect(duplicateMapLabel('')).toBe('Élément (copie)');
  });

  test('offsetPctPoints décale chaque sommet', () => {
    expect(
      offsetPctPoints([
        { x: 10, y: 20 },
        { x: 30, y: 40 },
      ]),
    ).toEqual([
      { x: 13, y: 23 },
      { x: 33, y: 43 },
    ]);
  });
});

describe('markerDuplicatePayloadFromMarker', () => {
  test('copie label, position et eventConfig', () => {
    const payload = markerDuplicatePayloadFromMarker({
      label: 'Départ',
      x_pct: 12,
      y_pct: 34,
      event_type: 'question',
      event_config: { version: 1, question: { mode: 'random' } },
      display_mode: 'emoji',
      emoji: '❓',
    });
    expect(payload.label).toBe('Départ (copie)');
    expect(payload.xPct).toBe(15);
    expect(payload.yPct).toBe(37);
    expect(payload.eventType).toBe('question');
    expect(payload.eventConfig).toEqual({ version: 1, question: { mode: 'random' } });
    expect(payload.displayMode).toBe('emoji');
    expect(payload.emoji).toBe('❓');
  });
});

describe('zoneDuplicateCreatePayloadFromZone', () => {
  test('copie métadonnées et décale le polygone', () => {
    const payload = zoneDuplicateCreatePayloadFromZone({
      label: 'Clairière',
      color: '#ff0000',
      points: [
        { x: 5, y: 5 },
        { x: 15, y: 5 },
        { x: 10, y: 15 },
      ],
      popover_markdown: 'Texte',
      popover_images: [{ url: '/img.png', caption: 'Vue' }],
      music_url: '/audio.mp3',
      music_volume: 0.5,
    });
    expect(payload.label).toBe('Clairière (copie)');
    expect(payload.color).toBe('#ff0000');
    expect(payload.points[0]).toEqual({ x: 8, y: 8 });
    expect(payload.popoverMarkdown).toBe('Texte');
    expect(payload.popoverImages).toHaveLength(1);
    expect(payload.musicUrls).toEqual(['/audio.mp3']);
    expect(payload.musicVolume).toBe(0.5);
  });
});
