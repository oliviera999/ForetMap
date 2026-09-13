'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const VALID_ANCHORS = [
  { xp: 10, yp: 10, lat: 48.85, lng: 2.3 },
  { xp: 90, yp: 10, lat: 48.85, lng: 2.31 },
  { xp: 10, yp: 90, lat: 48.84, lng: 2.3 },
];

describe('mapScaleCompass', () => {
  test('metersPerScreenPixel diminue quand le zoom augmente', async () => {
    const { metersPerScreenPixel } = await import('../src/shared/pct-map/mapScaleCompass.js');
    const planSize = { widthM: 100, heightM: 80 };
    const at1 = metersPerScreenPixel(planSize, 1000, 1);
    const at2 = metersPerScreenPixel(planSize, 1000, 2);
    assert.equal(at1, 0.1);
    assert.equal(at2, 0.05);
  });

  test('niceScaleBar choisit une longueur lisible', async () => {
    const { niceScaleBar } = await import('../src/shared/pct-map/mapScaleCompass.js');
    const bar = niceScaleBar(0.1, 80);
    assert.ok(bar);
    assert.equal(bar.meters, 10);
    assert.equal(bar.label, '10 m');
    assert.ok(Math.abs(bar.widthPx - 100) < 1e-9);
  });

  test('compassNeedleDeg combine nord du plan et orientation de vue', async () => {
    const { compassNeedleDeg } = await import('../src/shared/pct-map/mapScaleCompass.js');
    assert.equal(compassNeedleDeg(30, 0), 30);
    assert.equal(compassNeedleDeg(30, -90), 300);
    assert.equal(compassNeedleDeg(-10, 0), 350);
  });

  test('northOffsetDegFromGeoref est un angle fini pour un calage valide', async () => {
    const { northOffsetDegFromGeoref } = await import('../src/shared/pct-map/mapScaleCompass.js');
    const deg = northOffsetDegFromGeoref(VALID_ANCHORS);
    assert.ok(Number.isFinite(deg));
    assert.ok(deg >= 0 && deg < 360);
  });

  test('resolveScaleCompassDisplay renvoie barre + aiguille', async () => {
    const { resolveScaleCompassDisplay } = await import('../src/shared/pct-map/mapScaleCompass.js');
    const display = resolveScaleCompassDisplay({
      georef: VALID_ANCHORS,
      contentWidthPx: 800,
      scale: 1,
      orientationDeg: 0,
    });
    assert.ok(display);
    assert.ok(display.scaleBar.widthPx > 0);
    assert.ok(display.scaleBar.label.length > 0);
    assert.ok(Number.isFinite(display.needleDeg));
  });

  test('resolveScaleCompassDisplay refuse un calage invalide', async () => {
    const { resolveScaleCompassDisplay } = await import('../src/shared/pct-map/mapScaleCompass.js');
    assert.equal(resolveScaleCompassDisplay({ georef: null, contentWidthPx: 800, scale: 1 }), null);
  });
});
