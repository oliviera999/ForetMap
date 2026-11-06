'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizePoint,
  findZoneAtPoint,
  nearestSleepingZone,
  verdictForDistance,
} = require('../lib/glChasse');
const { teamsUnderVoile } = require('../lib/glVoile');
const { pickRandom } = require('../lib/glChapardeur');

const square = (id, x0, y0, size = 0.1) => ({
  id,
  zoneKey: `z-${id}`,
  points: [
    { x: x0, y: y0 },
    { x: x0 + size, y: y0 },
    { x: x0 + size, y: y0 + size },
    { x: x0, y: y0 + size },
  ],
  centre: { x: x0 + size / 2, y: y0 + size / 2 },
});

test('normalizePoint : 0–1 accepté, hors bornes refusé', () => {
  assert.deepEqual(normalizePoint(0.25, 0.5), { x: 0.25, y: 0.5 });
  assert.deepEqual(normalizePoint('0', '1'), { x: 0, y: 1 });
  assert.equal(normalizePoint(1.5, 0.5), null);
  assert.equal(normalizePoint(-0.1, 0.5), null);
  assert.equal(normalizePoint('a', 0.5), null);
});

test('findZoneAtPoint : dedans / dehors, polygones de moins de 3 points ignorés', () => {
  const zones = [square(1, 0.3, 0.25), { id: 2, zoneKey: 'z-2', points: [{ x: 0, y: 0 }] }];
  assert.equal(findZoneAtPoint(zones, { x: 0.35, y: 0.3 })?.id, 1);
  assert.equal(findZoneAtPoint(zones, { x: 0.7, y: 0.7 }), null);
  assert.equal(findZoneAtPoint(zones, null), null);
});

test('nearestSleepingZone : seules les zones endormies / pâlies comptent', () => {
  const zones = [square(1, 0.3, 0.25), square(2, 0.5, 0.25), square(3, 0.8, 0.8)];
  const pages = new Map([
    [1, { etat: 'trouvee' }],
    [2, { etat: 'palie' }],
    [3, { etat: 'endormie' }],
  ]);
  const near = nearestSleepingZone(zones, pages, { x: 0.36, y: 0.3 });
  assert.equal(near.zone.id, 2, 'la zone 1 (trouvée) ne guide plus');
  assert.ok(near.distance > 0.1);
  assert.equal(
    nearestSleepingZone(
      zones,
      new Map([
        [1, { etat: 'tenue' }],
        [2, { etat: 'tenue' }],
        [3, { etat: 'revelee' }],
      ]),
      { x: 0, y: 0 },
    ),
    null,
  );
});

test('verdictForDistance : seuils chaud / tiède, repli sur 0.06 / 0.15', () => {
  const seuils = { chaud: 0.06, tiede: 0.15 };
  assert.equal(verdictForDistance(0.01, seuils), 'chaud');
  assert.equal(verdictForDistance(0.06, seuils), 'chaud');
  assert.equal(verdictForDistance(0.1, seuils), 'tiede');
  assert.equal(verdictForDistance(0.2, seuils), 'froid');
  assert.equal(verdictForDistance(0.1, null), 'tiede');
});

test('teamsUnderVoile : rang du pion ≤ position ; −1 = personne', () => {
  const markers = [0, 1, 2, 3, 4].map((i) => ({ id: 10 + i, order_index: i }));
  const teams = [
    { id: 1, position_marker_id: 10 },
    { id: 2, position_marker_id: 12 },
    { id: 3, position_marker_id: 14 },
  ];
  assert.deepEqual(teamsUnderVoile({ voilePosition: -1 }, teams, markers), []);
  assert.deepEqual(
    teamsUnderVoile({ voile_position: 2 }, teams, markers).map((t) => t.id),
    [1, 2],
  );
});

test('pickRandom : liste vide → null, un élément → lui-même, tirage borné', () => {
  assert.equal(pickRandom([]), null);
  assert.equal(pickRandom(['x']), 'x');
  assert.equal(
    pickRandom(['a', 'b', 'c'], () => 2),
    'c',
  );
});
