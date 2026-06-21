import test from 'node:test';
import assert from 'node:assert/strict';
import { translateFeuilletZoneToPoint } from '../src/shared/pct-map/pctPolygon.js';

test('translateFeuilletZoneToPoint aligne le centre et translate le polygone', () => {
  const zone = {
    zoneId: 'zf-p1-01',
    centreXp: 10,
    centreYp: 20,
    points: [
      { x: 8, y: 18 },
      { x: 12, y: 18 },
      { x: 10, y: 22 },
    ],
  };
  const next = translateFeuilletZoneToPoint(zone, { x: 30, y: 40 });
  assert.equal(next.centreXp, 30);
  assert.equal(next.centreYp, 40);
  assert.deepEqual(next.points, [
    { x: 28, y: 38 },
    { x: 32, y: 38 },
    { x: 30, y: 42 },
  ]);
  assert.deepEqual(next.centre, { x: 30, y: 40 });
});

test('translateFeuilletZoneToPoint accepte xp/yp', () => {
  const zone = {
    centreXp: 50,
    centreYp: 50,
    points: [
      { x: 48, y: 48 },
      { x: 52, y: 48 },
      { x: 50, y: 52 },
    ],
  };
  const next = translateFeuilletZoneToPoint(zone, { xp: 55, yp: 60 });
  assert.equal(next.centreXp, 55);
  assert.equal(next.centreYp, 60);
});
