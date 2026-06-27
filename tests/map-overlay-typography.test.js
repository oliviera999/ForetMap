import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP_OVERLAY_REFERENCE_BOARD_HEIGHT_PX } from '../src/shared/mapOverlayScale.js';
import { resolveMapOverlayTypography } from '../src/utils/mapOverlayTypography.js';

describe('mapOverlayTypography', () => {
  test('à hauteur de référence sans worldScale → tailles de référence (px-écran)', () => {
    const t = resolveMapOverlayTypography({}, MAP_OVERLAY_REFERENCE_BOARD_HEIGHT_PX);
    assert.strictEqual(t.mapEmojiFontPx, 17);
    assert.strictEqual(t.mapLabelFontPx, 12);
  });

  test('worldScale contre-échelonne sans gonfler : taille apparente constante', () => {
    const t = resolveMapOverlayTypography({}, MAP_OVERLAY_REFERENCE_BOARD_HEIGHT_PX, {
      worldScale: 2,
    });
    assert.strictEqual(t.mapEmojiFontPx, 8.5);
    assert.strictEqual(t.mapLabelFontPx, 6);
    // Taille apparente (px-écran) = fontPx × worldScale → identique à worldScale = 1.
    assert.strictEqual(t.mapEmojiFontPx * 2, 17);
    assert.strictEqual(t.mapLabelFontPx * 2, 12);
  });

  test('zoom fort : la taille apparente reste constante (pas de « gonflement »)', () => {
    const ref = resolveMapOverlayTypography({}, MAP_OVERLAY_REFERENCE_BOARD_HEIGHT_PX);
    for (const worldScale of [3, 6, 8]) {
      const t = resolveMapOverlayTypography({}, MAP_OVERLAY_REFERENCE_BOARD_HEIGHT_PX, {
        worldScale,
      });
      assert.ok(Math.abs(t.mapEmojiFontPx * worldScale - ref.mapEmojiFontPx) < 1e-9);
      assert.ok(Math.abs(t.mapLabelFontPx * worldScale - ref.mapLabelFontPx) < 1e-9);
    }
  });

  test('fitHeightPx moitié → tailles réduites', () => {
    const t = resolveMapOverlayTypography({}, MAP_OVERLAY_REFERENCE_BOARD_HEIGHT_PX / 2);
    assert.strictEqual(t.mapEmojiFontPx, 9);
    assert.strictEqual(t.mapLabelFontPx, 6);
  });

  test('overlay_emoji_size_percent augmente la taille emoji', () => {
    const t = resolveMapOverlayTypography(
      { overlay_emoji_size_percent: 150 },
      MAP_OVERLAY_REFERENCE_BOARD_HEIGHT_PX,
    );
    assert.strictEqual(t.mapEmojiFontPx, 26);
  });
});
