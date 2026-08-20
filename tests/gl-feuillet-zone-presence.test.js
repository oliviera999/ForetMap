'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  normToPct,
  catalogPolygonToPctPoints,
  resolveTeamPctPosition,
  isTeamInsideFeuilletZone,
} = require('../lib/glFeuilletZonePresence');
const { getFeuilletZoneById, loadRawCatalog } = require('../lib/glFeuilletZonesCatalog');

test('normToPct : normalisé 0–1 → pourcentage, et rien d’autre', () => {
  assert.equal(normToPct(0.5), 50);
  assert.equal(normToPct(0), 0);
  assert.equal(normToPct(1), 100);
  // `Number(null)` et `Number('')` valent 0 : sans coercition stricte, une coordonnée
  // absente passerait pour l'origine du plateau au lieu d'être signalée comme inconnue.
  for (const value of [null, undefined, '', '   ', 'abc', NaN, true, {}, []]) {
    assert.equal(normToPct(value), null, `refus attendu pour ${JSON.stringify(value)}`);
  }
  assert.equal(normToPct('0.25'), 25, 'chaîne numérique acceptée');
});

test('catalogPolygonToPctPoints : conversion, et sommets illisibles ignorés', () => {
  assert.deepEqual(
    catalogPolygonToPctPoints([
      [0.1, 0.2],
      [0.3, 0.4],
      [0.5, 0.6],
    ]),
    [
      { x: 10, y: 20 },
      { x: 30, y: 40 },
      { x: 50, y: 60 },
    ],
  );
  assert.deepEqual(catalogPolygonToPctPoints([[0.1, 0.2], 'nope', [0.3], [0.4, 0.5]]), [
    { x: 10, y: 20 },
    { x: 40, y: 50 },
  ]);
  assert.deepEqual(catalogPolygonToPctPoints(null), []);
});

test('resolveTeamPctPosition : position libre d’abord, repère à défaut', () => {
  assert.deepEqual(
    resolveTeamPctPosition({
      position_x_pct: 12,
      position_y_pct: 34,
      marker_x_pct: 1,
      marker_y_pct: 2,
    }),
    { xp: 12, yp: 34 },
  );
  assert.deepEqual(
    resolveTeamPctPosition({
      position_x_pct: null,
      position_y_pct: null,
      marker_x_pct: 40,
      marker_y_pct: 50,
    }),
    { xp: 40, yp: 50 },
  );
  assert.equal(resolveTeamPctPosition({}), null, 'position inconnue');
  // Cas réel du LEFT JOIN sans repère : toutes les colonnes remontent à NULL. L'équipe
  // n'est pas « au coin (0, 0) », sa position est inconnue.
  assert.equal(
    resolveTeamPctPosition({
      position_x_pct: null,
      position_y_pct: null,
      marker_x_pct: null,
      marker_y_pct: null,
    }),
    null,
  );
});

test('isTeamInsideFeuilletZone : le centre est dedans, l’autre bout du plateau dehors', () => {
  const zone = getFeuilletZoneById('zf-p1-01');
  assert.ok(zone, 'catalogue zones_feuillets.json requis');
  const [cx, cy] = zone.centre;
  assert.equal(
    isTeamInsideFeuilletZone({ position_x_pct: cx * 100, position_y_pct: cy * 100 }, zone),
    true,
  );
  assert.equal(isTeamInsideFeuilletZone({ position_x_pct: 90, position_y_pct: 90 }, zone), false);
});

test('isTeamInsideFeuilletZone : sans position ni polygone exploitable, c’est non', () => {
  const zone = getFeuilletZoneById('zf-p1-01');
  assert.equal(isTeamInsideFeuilletZone({}, zone), false, 'position inconnue');
  assert.equal(
    isTeamInsideFeuilletZone(
      { position_x_pct: null, position_y_pct: null, marker_x_pct: null, marker_y_pct: null },
      zone,
    ),
    false,
    'colonnes NULL : refus, pas une position au coin',
  );
  assert.equal(
    isTeamInsideFeuilletZone(
      { position_x_pct: 50, position_y_pct: 50 },
      { polygone: [[0.1, 0.2]] },
    ),
    false,
    'moins de trois sommets : pas un polygone',
  );
  assert.equal(isTeamInsideFeuilletZone({ position_x_pct: 50, position_y_pct: 50 }, null), false);
});

test('tout le catalogue : le centre déclaré tombe dans le polygone déclaré', () => {
  // Garde de cohérence du catalogue lui-même : un centre hors polygone rendrait la zone
  // injouable — la mascotte posée « au centre » serait refusée par la garde de présence.
  const zones = loadRawCatalog().zones;
  assert.ok(zones.length >= 20);
  for (const zone of zones) {
    const [cx, cy] = zone.centre;
    assert.equal(
      isTeamInsideFeuilletZone({ position_x_pct: cx * 100, position_y_pct: cy * 100 }, zone),
      true,
      `centre hors polygone pour ${zone.zone_id}`,
    );
  }
});
