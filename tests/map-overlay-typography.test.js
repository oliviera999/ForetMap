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
      assert.ok(Math.abs(t.mapEmojiFontPx * worldScale - ref.mapEmojiFontPx) < 1e-9);
      assert.ok(Math.abs(t.mapLabelFontPx * worldScale - ref.mapLabelFontPx) < 1e-9);
    }
  });

  test('grossissement 100 % : taille apparente linéaire avec le zoom', () => {
    const t = resolveMapOverlayTypography({ overlay_zoom_growth_percent: 100 }, REF, {
      worldScale: 2,
      zoomRatio: 2,
    });
    assert.ok(Math.abs(t.mapEmojiFontPx * 2 - 38) < 1e-9);
    assert.ok(Math.abs(t.mapLabelFontPx * 2 - 28) < 1e-9);
  });

  test('grossissement par défaut : grossit au zoom mais reste sous le linéaire', () => {
    const base = resolveMapOverlayTypography({}, REF).mapEmojiFontPx;
    const t = resolveMapOverlayTypography({}, REF, { worldScale: 4, zoomRatio: 4 });
    const apparent = t.mapEmojiFontPx * 4;
    assert.ok(apparent > base, 'doit grossir au zoom');
    assert.ok(apparent < base * 4, 'doit rester sous la croissance linéaire');
    assert.ok(Math.abs(apparent - base * 4 ** (DEFAULT_ZOOM_GROWTH_PERCENT / 100)) < 1e-6);
  });

  test('fitHeightPx moitié → tailles réduites avec planchers relevés', () => {
    const t = resolveMapOverlayTypography({}, REF / 2);
    assert.strictEqual(t.mapEmojiFontPx, 13);
    assert.strictEqual(t.mapLabelFontPx, 11);
  });

  test('petit plateau : libellé ≥ plancher chrome (toolbar ref)', () => {
    const t = resolveMapOverlayTypography({}, 120);
    assert.ok(t.baseLabelApparentPx >= 11);
    assert.ok(t.baseEmojiApparentPx >= 13);
  });

  test('overlay_emoji_size_percent augmente la taille emoji', () => {
    const t = resolveMapOverlayTypography({ overlay_emoji_size_percent: 150 }, REF);
    assert.strictEqual(t.mapEmojiFontPx, 29);
  });

  test('isCoarsePointer grossit les étiquettes', () => {
    const base = resolveMapOverlayTypography({}, REF);
    const coarse = resolveMapOverlayTypography({}, REF, { isCoarsePointer: true });
    assert.ok(coarse.mapEmojiFontPx > base.mapEmojiFontPx);
    assert.ok(coarse.mapLabelFontPx >= base.mapLabelFontPx);
  });

  test('userTextSizePercent 125 % grossit les étiquettes', () => {
    const base = resolveMapOverlayTypography({}, REF);
    const large = resolveMapOverlayTypography({}, REF, { userTextSizePercent: 125 });
    assert.ok(large.mapLabelFontPx >= base.mapLabelFontPx);
  });

  test('fitWidthPx contraignant réduit la taille vs hauteur seule', () => {
    const heightOnly = resolveMapOverlayTypography({}, REF, { fitWidthPx: REF });
    const narrow = resolveMapOverlayTypography({}, REF, { fitWidthPx: REF / 2 });
    assert.ok(narrow.mapLabelFontPx <= heightOnly.mapLabelFontPx);
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
