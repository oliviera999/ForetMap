const test = require('node:test');
const assert = require('node:assert');
const {
  isValidAnchors,
  sanitizeAnchors,
  parseAnchors,
  withMapGeoref,
  assessAnchorsGeoPlausibility,
} = require('../lib/mapGeoref');

const NUMERIC_ANCHORS = [
  { xp: 10, yp: 10, lat: 48.8534, lng: 2.3488 },
  { xp: 90, yp: 12, lat: 48.8534, lng: 2.3588 },
  { xp: 12, yp: 88, lat: 48.8434, lng: 2.3488 },
];

test('isValidAnchors accepte des coordonnées en chaîne (virgule ou point décimal)', () => {
  const textual = [
    { xp: '10', yp: '10', lat: '48,8534', lng: '2.3488' },
    { xp: 90, yp: '12', lat: '48.8534', lng: '2,3588' },
    { xp: '12', yp: 88, lat: '48,8434', lng: '2.3488' },
  ];
  assert.strictEqual(isValidAnchors(textual), true);
  assert.deepStrictEqual(sanitizeAnchors(textual), NUMERIC_ANCHORS);
});

test('isValidAnchors rejette les chaînes non numériques et les hors-bornes', () => {
  const withText = [{ ...NUMERIC_ANCHORS[0], lat: 'nord' }, ...NUMERIC_ANCHORS.slice(1)];
  assert.strictEqual(isValidAnchors(withText), false);
  const outOfRange = [{ ...NUMERIC_ANCHORS[0], lat: '91' }, ...NUMERIC_ANCHORS.slice(1)];
  assert.strictEqual(isValidAnchors(outOfRange), false);
  const outOfPlan = [{ ...NUMERIC_ANCHORS[0], xp: '101' }, ...NUMERIC_ANCHORS.slice(1)];
  assert.strictEqual(isValidAnchors(outOfPlan), false);
});

test('isValidAnchors rejette 3 points colinéaires ou un nombre de points ≠ 3', () => {
  const collinear = [
    { xp: 0, yp: 0, lat: 1, lng: 1 },
    { xp: 50, yp: 50, lat: 2, lng: 2 },
    { xp: 100, yp: 100, lat: 3, lng: 3 },
  ];
  assert.strictEqual(isValidAnchors(collinear), false);
  assert.strictEqual(isValidAnchors(NUMERIC_ANCHORS.slice(0, 2)), false);
  assert.strictEqual(isValidAnchors(null), false);
});

test('assessAnchorsGeoPlausibility accepte un calage cohérent', () => {
  assert.strictEqual(assessAnchorsGeoPlausibility(NUMERIC_ANCHORS).ok, true);
});

test('assessAnchorsGeoPlausibility rejette des points GPS alignés ou confondus', () => {
  // Triangle net sur le plan, mais points GPS sur une même ligne nord-sud.
  const geoCollinear = [
    { xp: 10, yp: 10, lat: 48.85, lng: 2.3 },
    { xp: 90, yp: 10, lat: 48.851, lng: 2.3 },
    { xp: 10, yp: 90, lat: 48.852, lng: 2.3 },
  ];
  const flat = assessAnchorsGeoPlausibility(geoCollinear);
  assert.strictEqual(flat.ok, false);
  assert.strictEqual(flat.reason, 'geo_collinear');

  const duplicated = [
    { xp: 10, yp: 10, lat: 48.85, lng: 2.3 },
    { xp: 90, yp: 10, lat: 48.85, lng: 2.3 },
    { xp: 10, yp: 90, lat: 48.8495, lng: 2.3005 },
  ];
  assert.strictEqual(assessAnchorsGeoPlausibility(duplicated).ok, false);
});

test('assessAnchorsGeoPlausibility rejette des échelles incompatibles (cas audit BDD §3.1)', () => {
  // 80 % du plan ≈ 3,7 m sur un axe, ≈ 55 m sur l'autre : facteur ~15.
  const mismatched = [
    { xp: 10, yp: 10, lat: 48.85, lng: 2.3 },
    { xp: 90, yp: 10, lat: 48.85, lng: 2.30005 },
    { xp: 10, yp: 90, lat: 48.8495, lng: 2.3 },
  ];
  const res = assessAnchorsGeoPlausibility(mismatched);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.reason, 'scale_mismatch');
  assert.ok(res.scaleRatio > 8, `ratio ${res.scaleRatio} > 8`);
});

test('parseAnchors normalise le JSON stocké et withMapGeoref expose georef/gps_enabled', () => {
  assert.deepStrictEqual(parseAnchors(JSON.stringify(NUMERIC_ANCHORS)), NUMERIC_ANCHORS);
  assert.strictEqual(parseAnchors('pas du json'), null);
  assert.strictEqual(parseAnchors(''), null);

  const row = withMapGeoref({
    id: 'foret',
    geo_anchors_json: JSON.stringify(NUMERIC_ANCHORS),
    gps_enabled: 1,
  });
  assert.strictEqual(row.geo_anchors_json, undefined);
  assert.strictEqual(row.gps_enabled, true);
  assert.strictEqual(row.georef.length, 3);

  // Sans ancres valides, le suivi GPS ne peut pas être annoncé comme actif.
  const broken = withMapGeoref({ id: 'foret', geo_anchors_json: '[]', gps_enabled: 1 });
  assert.strictEqual(broken.georef, null);
  assert.strictEqual(broken.gps_enabled, false);
});
