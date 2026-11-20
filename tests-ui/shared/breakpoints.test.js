import { describe, test, expect } from 'vitest';
import { BREAKPOINTS, MEDIA, mediaDown, mediaUp } from '../../src/shared/breakpoints.js';
import { COMPACT_PANEL_QUERY } from '../../src/shared/hooks/useCompactPanelState.js';

describe('breakpoints (échelle partagée)', () => {
  test('échelle confirmée à la reconnaissance R0', () => {
    expect(BREAKPOINTS).toEqual({ xs: 480, sm: 640, md: 768, lg: 1024 });
  });

  test('mediaUp inclut le seuil, mediaDown l’exclut (aucun pixel des deux côtés)', () => {
    expect(mediaUp('md')).toBe('(min-width: 768px)');
    expect(mediaDown('md')).toBe('(max-width: 767px)');
    expect(MEDIA.phone).toBe('(max-width: 639px)');
  });

  test('le panneau compactable suit la bascule ordinateur de l’échelle', () => {
    expect(COMPACT_PANEL_QUERY).toBe(MEDIA.belowDesktop);
    expect(COMPACT_PANEL_QUERY).toBe('(max-width: 1023px)');
  });
});
