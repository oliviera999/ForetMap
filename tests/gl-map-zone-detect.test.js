'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

test('glMapZoneDetect: traversée détectée', async () => {
  const { findZoneTriggeredOnMoveGeneric } = await import('../src/gl/utils/glMapZoneDetect.js');
  const zone = {
    zoneId: 'z1',
    points: [
      { x: 40, y: 40 },
      { x: 60, y: 40 },
      { x: 50, y: 60 },
    ],
  };
  const hit = findZoneTriggeredOnMoveGeneric({ xp: 30, yp: 50 }, { xp: 50, yp: 50 }, [zone], {
    getZonePoints: (z) => z.points,
    isZoneEligible: () => true,
  });
  assert.strictEqual(hit?.zoneId, 'z1');
});

test('glMapZoneDetect: zone déjà lue ignorée', async () => {
  const { findZoneTriggeredOnMoveGeneric } = await import('../src/gl/utils/glMapZoneDetect.js');
  const zone = {
    zoneId: 'z-read',
    points: [
      { x: 40, y: 40 },
      { x: 60, y: 40 },
      { x: 50, y: 60 },
    ],
  };
  const read = new Set(['z-read']);
  const hit = findZoneTriggeredOnMoveGeneric({ xp: 30, yp: 50 }, { xp: 50, yp: 50 }, [zone], {
    getZonePoints: (z) => z.points,
    isZoneEligible: (z) => !read.has(z.zoneId),
  });
  assert.strictEqual(hit, null);
});

test('glMapZoneDetect: plus petite zone en chevauchement', async () => {
  const { findZoneTriggeredOnMoveGeneric } = await import('../src/gl/utils/glMapZoneDetect.js');
  const big = {
    zoneId: 'big',
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ],
  };
  const small = {
    zoneId: 'small',
    points: [
      { x: 45, y: 45 },
      { x: 55, y: 45 },
      { x: 50, y: 55 },
    ],
  };
  const hit = findZoneTriggeredOnMoveGeneric({ xp: 40, yp: 50 }, { xp: 50, yp: 50 }, [big, small], {
    getZonePoints: (z) => z.points,
    isZoneEligible: () => true,
  });
  assert.strictEqual(hit?.zoneId, 'small');
});
