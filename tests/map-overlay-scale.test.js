import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAP_OVERLAY_REFERENCE_BOARD_HEIGHT_PX,
  clampMapOverlaySizePercent,
  readPlateauMarkerSizePercent,
  resolveMapOverlayBoardScale,
  resolveMapOverlayScaleCssValue,
} from '../src/shared/mapOverlayScale.js';

describe('mapOverlayScale', () => {
  test('resolveMapOverlayBoardScale à hauteur de référence et 100 % → 1', () => {
    assert.strictEqual(
      resolveMapOverlayBoardScale({
        fitHeightPx: MAP_OVERLAY_REFERENCE_BOARD_HEIGHT_PX,
        sizePercent: 100,
      }),
      1,
    );
  });

  test('resolveMapOverlayBoardScale proportionnel à fitHeightPx', () => {
    assert.strictEqual(resolveMapOverlayBoardScale({ fitHeightPx: 240, sizePercent: 100 }), 0.5);
  });

  test('resolveMapOverlayBoardScale applique sizePercent', () => {
    assert.strictEqual(
      resolveMapOverlayBoardScale({
        fitHeightPx: MAP_OVERLAY_REFERENCE_BOARD_HEIGHT_PX,
        sizePercent: 150,
      }),
      1.5,
    );
  });

  test('fitHeightPx absent retombe sur la hauteur de référence', () => {
    assert.strictEqual(resolveMapOverlayBoardScale({ fitHeightPx: 0, sizePercent: 100 }), 1);
  });

  test('clampMapOverlaySizePercent borne 50–200', () => {
    assert.strictEqual(clampMapOverlaySizePercent(30), 50);
    assert.strictEqual(clampMapOverlaySizePercent(250), 200);
    assert.strictEqual(clampMapOverlaySizePercent('abc'), 100);
  });

  test('resolveMapOverlayScaleCssValue borne le facteur CSS', () => {
    assert.strictEqual(
      resolveMapOverlayScaleCssValue({ fitHeightPx: 50, sizePercent: 100 }),
      '0.25',
    );
    assert.strictEqual(
      resolveMapOverlayScaleCssValue({
        fitHeightPx: MAP_OVERLAY_REFERENCE_BOARD_HEIGHT_PX * 4,
        sizePercent: 200,
      }),
      '3',
    );
  });

  test('readPlateauMarkerSizePercent priorise plateau_marker_size_percent', () => {
    assert.strictEqual(
      readPlateauMarkerSizePercent({
        plateau_marker_size_percent: 120,
        overlay_emoji_size_percent: 80,
      }),
      120,
    );
    assert.strictEqual(readPlateauMarkerSizePercent({ overlay_emoji_size_percent: 90 }), 90);
  });
});
