import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP_OVERLAY_REFERENCE_BOARD_HEIGHT_PX } from '../src/shared/mapOverlayScale.js';
import {
  resolveMapOverlayTypography,
  resolveMapOverlayMarkerCssTypography,
  resolveMapOverlayCssVariables,
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

  test('fitHeightPx moitié → plancher appliqué au couple, ratio emoji/libellé conservé', () => {
    const t = resolveMapOverlayTypography({}, REF / 2);
    // Le libellé bute sur son plancher (11) ; l'emoji est relevé du même facteur,
    // au lieu d'un plancher indépendant (13) qui écrasait le ratio 19/14.
    assert.ok(Math.abs(t.mapLabelFontPx - 11) < 1e-9);
    assert.ok(Math.abs(t.mapEmojiFontPx / t.mapLabelFontPx - 19 / 14) < 1e-9);
    assert.ok(t.mapEmojiFontPx >= 13);
  });

  test('petit plateau : libellé ≥ plancher chrome (toolbar ref)', () => {
    const t = resolveMapOverlayTypography({}, 120);
    assert.ok(t.baseLabelApparentPx >= 11);
    assert.ok(t.baseEmojiApparentPx >= 13);
  });

  test('overlay_emoji_size_percent augmente la taille emoji (sans arrondi intermédiaire)', () => {
    const t = resolveMapOverlayTypography({ overlay_emoji_size_percent: 150 }, REF);
    // 19 × 1,5 = 28,5 : plus d'arrondi avant la division par worldScale (sauts d'1 px monde).
    assert.strictEqual(t.mapEmojiFontPx, 28.5);
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

describe('resolveMapOverlayMarkerCssTypography — compensation du calque zoomé (Visite)', () => {
  test('sans compensateWorldScale : identique quel que soit worldScale (GL, plateaux sans zoom)', () => {
    const a = resolveMapOverlayMarkerCssTypography({}, REF, {});
    const b = resolveMapOverlayMarkerCssTypography({}, REF, { worldScale: 3 });
    assert.strictEqual(a.emojiFontSizePx, b.emojiFontSizePx);
    assert.strictEqual(b.worldInv, 1);
  });

  test('compensateWorldScale : les repères suivent la croissance douce des zones, pas le zoom linéaire', () => {
    const rest = resolveMapOverlayMarkerCssTypography({}, REF, { compensateWorldScale: true });
    const zoomed = resolveMapOverlayMarkerCssTypography({}, REF, {
      compensateWorldScale: true,
      worldScale: 2,
    });
    // Taille apparente = fontPx × worldScale : doit croître comme 2^0,35, pas ×2.
    const apparentGrowth = (zoomed.emojiFontSizePx * 2) / rest.emojiFontSizePx;
    assert.ok(Math.abs(apparentGrowth - 2 ** (DEFAULT_ZOOM_GROWTH_PERCENT / 100)) < 1e-9);
    assert.ok(Math.abs(zoomed.worldInv - 0.5) < 1e-9);
  });

  test('les variables CSS exposent worldInv et une largeur max compensée', () => {
    const vars = resolveMapOverlayCssVariables({}, REF, {
      compensateWorldScale: true,
      worldScale: 2,
    });
    assert.strictEqual(vars['--map-overlay-world-inv'], '0.5');
    const maxW = parseFloat(vars['--map-overlay-label-max-width']);
    assert.ok(Math.abs(maxW - 96 * (2 ** (DEFAULT_ZOOM_GROWTH_PERCENT / 100) / 2)) < 1e-9);
  });
});
