'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const LAT = 48.85;
const M_PER_DEG = 111320;
const COS = Math.cos((LAT * Math.PI) / 180);

/** Plan de 200 m × 100 m calé nord en haut : 1 % en x = 2 m, 1 % en y = 1 m. */
const ANCHORS = [
  { xp: 0, yp: 0, lat: LAT, lng: 2.3 },
  { xp: 100, yp: 0, lat: LAT, lng: 2.3 + 200 / (M_PER_DEG * COS) },
  { xp: 0, yp: 100, lat: LAT - 100 / M_PER_DEG, lng: 2.3 },
];

const SQUARE = [
  { xp: 10, yp: 10 },
  { xp: 20, yp: 10 },
  { xp: 20, yp: 30 },
  { xp: 10, yp: 30 },
];

const normSpaces = (s) => String(s).replace(/[\u202f\u00a0]/g, ' ');

test('polygonAreaM2 : rectangle connu (20 m × 20 m = 400 m²)', async () => {
  const { polygonAreaM2 } = await import('../src/shared/pct-map/pctGeoTransform.js');
  const area = polygonAreaM2(SQUARE, ANCHORS);
  assert.ok(area != null);
  assert.ok(Math.abs(area - 400) / 400 < 0.01, `aire ≈ 400, obtenu ${area}`);
});

test('polygonAreaM2 : sens de parcours indifférent', async () => {
  const { polygonAreaM2 } = await import('../src/shared/pct-map/pctGeoTransform.js');
  const a = polygonAreaM2(SQUARE, ANCHORS);
  const b = polygonAreaM2([...SQUARE].reverse(), ANCHORS);
  assert.ok(Math.abs(a - b) < 1e-6);
});

test('polygonAreaM2 : null sans calage valide ou avec moins de 3 sommets', async () => {
  const { polygonAreaM2 } = await import('../src/shared/pct-map/pctGeoTransform.js');
  assert.strictEqual(polygonAreaM2(SQUARE, null), null);
  assert.strictEqual(polygonAreaM2(SQUARE, ANCHORS.slice(0, 2)), null);
  assert.strictEqual(polygonAreaM2(SQUARE.slice(0, 2), ANCHORS), null);
  assert.strictEqual(polygonAreaM2(null, ANCHORS), null);
});

test('zoneSurfaceM2 : accepte les points JSON stockés ou un tableau', async () => {
  const { zoneSurfaceM2 } = await import('../src/utils/zoneSurface.js');
  const fromJson = zoneSurfaceM2({ points: JSON.stringify(SQUARE) }, ANCHORS);
  const fromArray = zoneSurfaceM2({ points: SQUARE }, ANCHORS);
  assert.ok(Math.abs(fromJson - 400) < 4);
  assert.ok(Math.abs(fromArray - fromJson) < 1e-9);
  assert.strictEqual(zoneSurfaceM2({ points: JSON.stringify(SQUARE) }, null), null);
  assert.strictEqual(zoneSurfaceM2({ points: 'pas du json' }, ANCHORS), null);
  assert.strictEqual(zoneSurfaceM2(null, ANCHORS), null);
});

test('formatSurface : m² sous 1 ha, ha au-delà, séparateurs fr-FR', async () => {
  const { formatSurface } = await import('../src/utils/zoneSurface.js');
  assert.strictEqual(normSpaces(formatSurface(400.4)), '≈ 400 m²');
  assert.strictEqual(normSpaces(formatSurface(1234.4)), '≈ 1 234 m²');
  assert.strictEqual(normSpaces(formatSurface(12345)), '≈ 1,23 ha');
  assert.strictEqual(formatSurface(null), null);
  assert.strictEqual(formatSurface(Number.NaN), null);
  assert.strictEqual(formatSurface(-1), null);
});

test('pointsSurfaceLabel : libellé direct, null sans calage', async () => {
  const { pointsSurfaceLabel } = await import('../src/utils/zoneSurface.js');
  assert.strictEqual(normSpaces(pointsSurfaceLabel(SQUARE, ANCHORS)), '≈ 400 m²');
  assert.strictEqual(pointsSurfaceLabel(SQUARE, null), null);
});
