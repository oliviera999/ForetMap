'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

/** Ancres de référence (xp/yp en %, lat/lng arbitraires plausibles). */
const ANCHORS = [
  { xp: 10, yp: 10, lat: 48.85, lng: 2.3 },
  { xp: 90, yp: 10, lat: 48.85, lng: 2.31 },
  { xp: 10, yp: 90, lat: 48.84, lng: 2.3 },
];

test('mapGeoTransform: geoToPct reconstruit les ancres (identité)', async () => {
  const { geoToPct } = await import('../src/utils/mapGeoTransform.js');
  for (const a of ANCHORS) {
    const pct = geoToPct(a.lat, a.lng, ANCHORS);
    assert.ok(pct, 'pct non null');
    assert.ok(Math.abs(pct.xp - a.xp) < 1e-6, `xp ≈ ${a.xp}`);
    assert.ok(Math.abs(pct.yp - a.yp) < 1e-6, `yp ≈ ${a.yp}`);
  }
});

test('mapGeoTransform: pctToGeo est l’inverse de geoToPct', async () => {
  const { geoToPct, pctToGeo } = await import('../src/utils/mapGeoTransform.js');
  const pct = geoToPct(48.847, 2.305, ANCHORS);
  assert.ok(pct);
  const geo = pctToGeo(pct.xp, pct.yp, ANCHORS);
  assert.ok(geo);
  assert.ok(Math.abs(geo.lat - 48.847) < 1e-6, 'lat reconstruit');
  assert.ok(Math.abs(geo.lng - 2.305) < 1e-6, 'lng reconstruit');
});

test('mapGeoTransform: ancres colinéaires ou invalides → null', async () => {
  const { geoToPct, isValidAnchors, solveAffineFromAnchors } =
    await import('../src/utils/mapGeoTransform.js');
  const collinear = [
    { xp: 0, yp: 0, lat: 1, lng: 1 },
    { xp: 50, yp: 50, lat: 2, lng: 2 },
    { xp: 100, yp: 100, lat: 3, lng: 3 },
  ];
  assert.strictEqual(isValidAnchors(collinear), false);
  assert.strictEqual(solveAffineFromAnchors(collinear), null);
  assert.strictEqual(geoToPct(1.5, 1.5, collinear), null);

  assert.strictEqual(isValidAnchors([]), false);
  assert.strictEqual(isValidAnchors(ANCHORS.slice(0, 2)), false);
  assert.strictEqual(
    isValidAnchors([{ xp: 'x', yp: 0, lat: 0, lng: 0 }, ...ANCHORS.slice(1)]),
    false,
  );
  assert.strictEqual(isValidAnchors(ANCHORS), true);
});

test('mapGeoTransform: isPctWithinMap respecte les bornes', async () => {
  const { isPctWithinMap } = await import('../src/utils/mapGeoTransform.js');
  assert.strictEqual(isPctWithinMap({ xp: 50, yp: 50 }), true);
  assert.strictEqual(isPctWithinMap({ xp: -1, yp: 50 }), false);
  assert.strictEqual(isPctWithinMap({ xp: 101, yp: 50 }), false);
  assert.strictEqual(isPctWithinMap({ xp: 102, yp: 50 }, 5), true);
  assert.strictEqual(isPctWithinMap(null), false);
});
