import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP_OVERLAY_REFERENCE_BOARD_HEIGHT_PX } from '../src/shared/mapOverlayScale.js';
import {
  resolveMapOverlayTypography,
  clampZoomGrowthPercent,
  DEFAULT_ZOOM_GROWTH_PERCENT,
} from '../src/utils/mapOverlayTypography.js';

const REF = MAP_OVERLAY_REFERENCE_BOARD_HEIGHT_PX;

describe('mapOverlayTypography', () => {
  test('à hauteur de référence, au repos → tailles de référence (px-écran)', () => {
    // worldScale = 1 ⇒ zoomFactor = 1^g = 1 quel que soit le grossissement.
    const t = resolveMapOverlayTypography({}, REF);
    assert.strictEqual(t.mapEmojiFontPx, 19);
    assert.strictEqual(t.mapLabelFontPx, 14);
  });

  test('grossissement 0 % : taille apparente constante quel que soit le zoom', () => {
    const ref = resolveMapOverlayTypography({ overlay_zoom_growth_percent: 0 }, REF);
    for (const worldScale of [2, 3, 6, 8]) {
      const t = resolveMapOverlayTypography({ overlay_zoom_growth_percent: 0 }, REF, {
        worldScale,
      });
      // Taille apparente (px-écran) = fontPx × worldScale → identique au repos.
      assert.ok(Math.abs(t.mapEmojiFontPx * worldScale - ref.mapEmojiFontPx) < 1e-9);
      assert.ok(Math.abs(t.mapLabelFontPx * worldScale - ref.mapLabelFontPx) < 1e-9);
    }
  });

  test('grossissement 100 % : taille apparente linéaire avec le zoom', () => {
    const t = resolveMapOverlayTypography({ overlay_zoom_growth_percent: 100 }, REF, {
      worldScale: 2,
      zoomRatio: 2,
    });
    // apparent = base × zoomRatio^1 = 19 × 2 = 38.
    assert.ok(Math.abs(t.mapEmojiFontPx * 2 - 38) < 1e-9);
    assert.ok(Math.abs(t.mapLabelFontPx * 2 - 28) < 1e-9);
  });

  test('grossissement par défaut : grossit au zoom mais reste sous le linéaire', () => {
    const base = resolveMapOverlayTypography({}, REF).mapEmojiFontPx; // 19 au repos
    const t = resolveMapOverlayTypography({}, REF, { worldScale: 4, zoomRatio: 4 });
    const apparent = t.mapEmojiFontPx * 4;
    assert.ok(apparent > base, 'doit grossir au zoom');
    assert.ok(apparent < base * 4, 'doit rester sous la croissance linéaire');
    // base × 4^(35/100) ≈ 30.86
    assert.ok(Math.abs(apparent - base * 4 ** (DEFAULT_ZOOM_GROWTH_PERCENT / 100)) < 1e-6);
  });

  test('fitHeightPx moitié → tailles réduites', () => {
    const t = resolveMapOverlayTypography({}, REF / 2);
    assert.strictEqual(t.mapEmojiFontPx, 10);
    assert.strictEqual(t.mapLabelFontPx, 7);
  });

  test('overlay_emoji_size_percent augmente la taille emoji', () => {
    const t = resolveMapOverlayTypography({ overlay_emoji_size_percent: 150 }, REF);
    assert.strictEqual(t.mapEmojiFontPx, 29);
  });
});

describe('clampZoomGrowthPercent', () => {
  test('borne dans [0, 100], arrondit, et applique le défaut si non numérique', () => {
    assert.strictEqual(clampZoomGrowthPercent(50), 50);
    assert.strictEqual(clampZoomGrowthPercent(-10), 0);
    assert.strictEqual(clampZoomGrowthPercent(250), 100);
    assert.strictEqual(clampZoomGrowthPercent(33.6), 34);
    assert.strictEqual(clampZoomGrowthPercent(undefined), DEFAULT_ZOOM_GROWTH_PERCENT);
    assert.strictEqual(clampZoomGrowthPercent('abc'), DEFAULT_ZOOM_GROWTH_PERCENT);
  });
});
