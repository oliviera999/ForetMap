import { describe, expect, it } from 'vitest';
import {
  isLegacyGlMediaUrl,
  resolveGlBoardImageUrl,
  migrateStoryHeroToSceneRef,
} from '../../src/gl/utils/glLegacyMediaUrl.js';

describe('glLegacyMediaUrl', () => {
  it('priorise la convention plateau sur map_image_url legacy', () => {
    const url = resolveGlBoardImageUrl({
      mapImageUrl: '/uploads/media-library/image/gl-plateau-2-sahara-mediterranee.jpg',
      conventionBoard: '/board-resolved.jpg',
      placeholderUrl: '/ph.svg',
    });
    expect(url).toBe('/board-resolved.jpg');
  });

  it('conserve map_image_url non legacy', () => {
    const custom = '/uploads/custom-map.png';
    const url = resolveGlBoardImageUrl({
      mapImageUrl: custom,
      conventionBoard: '/board-resolved.jpg',
      placeholderUrl: '/ph.svg',
    });
    expect(url).toBe(custom);
  });

  it('détecte les chemins gl-*', () => {
    expect(isLegacyGlMediaUrl('/uploads/media-library/image/gl-scene-ch1-x.png')).toBe(true);
    expect(isLegacyGlMediaUrl('/uploads/media-library/image/2026/06/x.png')).toBe(false);
  });

  it('convertit le hero story legacy en scene:1', () => {
    const out = migrateStoryHeroToSceneRef(
      '![Titre](/uploads/media-library/image/gl-scene-ch1-point-eau-tari.png)',
    );
    expect(out).toBe('![Titre](scene:1)');
  });
});
