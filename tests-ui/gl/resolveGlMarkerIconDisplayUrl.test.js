import { describe, test, expect, vi, beforeEach } from 'vitest';
import { resolveGlMarkerIconDisplayUrl } from '../../src/gl/utils/resolveGlMarkerIconDisplayUrl.js';

describe('resolveGlMarkerIconDisplayUrl', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test('résout une clé stable via resolveStableKey', () => {
    const url = resolveGlMarkerIconDisplayUrl('biome_sahara', {
      assetsReady: true,
      resolveStableKey: (key) =>
        key === 'biome_sahara' ? '/uploads/media-library/image/biome_sahara.png' : null,
    });
    expect(url).toBe('/uploads/media-library/image/biome_sahara.png');
  });

  test('réécrit une URL legacy gl-*', () => {
    const legacy = '/uploads/media-library/image/gl-plateau-1-tropiques-africains.png';
    const url = resolveGlMarkerIconDisplayUrl(legacy, {
      assetsReady: true,
      resolveStableKey: () => '/uploads/media-library/image/plateau-1_tropiques-africains.png',
    });
    expect(url).toBe('/uploads/media-library/image/plateau-1_tropiques-africains.png');
  });

  test('local:/ renvoie le chemin statique', () => {
    expect(resolveGlMarkerIconDisplayUrl('local:/assets/gl/icon.svg')).toBe('/assets/gl/icon.svg');
  });

  test('conserve /uploads/ tant que les assets ne sont pas prêts', () => {
    const raw = '/uploads/media-library/image/test.png';
    expect(
      resolveGlMarkerIconDisplayUrl(raw, {
        assetsReady: false,
        resolveStableKey: () => '/uploads/other.png',
      }),
    ).toBe(raw);
  });

  test('tente une clé stable même si les assets ne sont pas prêts', () => {
    const url = resolveGlMarkerIconDisplayUrl('biome_sahara', {
      assetsReady: false,
      resolveStableKey: (key) =>
        key === 'biome_sahara' ? '/uploads/media-library/image/biome_sahara.png' : null,
    });
    expect(url).toBe('/uploads/media-library/image/biome_sahara.png');
  });
});
