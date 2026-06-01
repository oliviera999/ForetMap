'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

test('glPointInPolygon: point à l intérieur', async () => {
  const { isPointInPolygon, polygonArea } = await import('../src/utils/glPointInPolygon.js');
  const triangle = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 50, y: 100 },
  ];
  assert.strictEqual(isPointInPolygon(50, 40, triangle), true);
  assert.strictEqual(isPointInPolygon(50, 99, triangle), true);
  assert.strictEqual(isPointInPolygon(-1, 50, triangle), false);
  assert.strictEqual(isPointInPolygon(50, -1, triangle), false);
  assert.ok(polygonArea(triangle) > 0);
});

test('glPointInPolygon: polygone invalide', async () => {
  const { isPointInPolygon, polygonArea } = await import('../src/utils/glPointInPolygon.js');
  assert.strictEqual(isPointInPolygon(50, 50, []), false);
  assert.strictEqual(isPointInPolygon(50, 50, [{ x: 0, y: 0 }, { x: 10, y: 0 }]), false);
  assert.strictEqual(polygonArea([]), 0);
});
