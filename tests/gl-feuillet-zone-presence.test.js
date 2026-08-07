'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  catalogPolygonToPctPoints,
  resolveTeamPctPosition,
  isTeamInsideFeuilletZone,
} = require('../lib/glFeuilletZonePresence');
const { getFeuilletZoneById } = require('../lib/glFeuilletZonesCatalog');

test('catalogPolygonToPctPoints convertit 0–1 → 0–100', () => {
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
});

test('resolveTeamPctPosition privilégie la position libre puis le repère', () => {
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
  assert.equal(resolveTeamPctPosition({}), null);
});

test('isTeamInsideFeuilletZone — centre catalogue zf-p1-01 dedans, coin loin dehors', () => {
  const zone = getFeuilletZoneById('zf-p1-01');
  assert.ok(zone, 'catalogue zones_feuillets.json requis');
  const [cx, cy] = zone.centre;
  assert.equal(
    isTeamInsideFeuilletZone({ position_x_pct: cx * 100, position_y_pct: cy * 100 }, zone),
    true,
  );
  assert.equal(isTeamInsideFeuilletZone({ position_x_pct: 90, position_y_pct: 90 }, zone), false);
  assert.equal(
    isTeamInsideFeuilletZone({ position_x_pct: null, position_y_pct: null }, zone),
    false,
  );
});
