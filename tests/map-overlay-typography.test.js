import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP_OVERLAY_REFERENCE_BOARD_HEIGHT_PX } from '../src/shared/mapOverlayScale.js';
import { resolveMapOverlayTypography } from '../src/utils/mapOverlayTypography.js';

describe('mapOverlayTypography', () => {
  test('à hauteur de référence sans worldScale → tailles proches de la référence', () => {
    const t = resolveMapOverlayTypography({}, MAP_OVERLAY_REFERENCE_BOARD_HEIGHT_PX);
    assert.strictEqual(t.mapEmojiFontPx, 19);
    assert.strictEqual(t.mapLabelFontPx, 14);
  });

  test('worldScale compense les coordonnées monde (carte tâches)', () => {
    const t = resolveMapOverlayTypography({}, MAP_OVERLAY_REFERENCE_BOARD_HEIGHT_PX, {
      worldScale: 2,
    });
    assert.strictEqual(t.mapEmojiFontPx, 10);
    assert.ok(t.mapEmojiFontPx * 2 >= 19);
  });

  test('fitHeightPx moitié → tailles réduites', () => {
    const t = resolveMapOverlayTypography({}, MAP_OVERLAY_REFERENCE_BOARD_HEIGHT_PX / 2);
    assert.strictEqual(t.mapEmojiFontPx, 10);
    assert.strictEqual(t.mapLabelFontPx, 7);
  });

  test('overlay_emoji_size_percent augmente la taille emoji', () => {
    const t = resolveMapOverlayTypography(
      { overlay_emoji_size_percent: 150 },
      MAP_OVERLAY_REFERENCE_BOARD_HEIGHT_PX,
    );
    assert.strictEqual(t.mapEmojiFontPx, 29);
  });
});
