'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('url');
const { join } = require('path');

describe('pctPolygon', () => {
  it('normalise et borne les points %', async () => {
    const { normalizePctPoint, normalizePctPoints } = await import(
      pathToFileURL(join(__dirname, '../src/shared/pct-map/pctPolygon.js')).href
    );
    assert.deepEqual(normalizePctPoint({ xp: 120, yp: -5 }), { x: 100, y: 0 });
    assert.equal(normalizePctPoints([{ x: 10, y: 20 }]).length, 1);
  });

  it('insère un sommet sur l’arête la plus proche', async () => {
    const { findNearestEdgeInsertion, insertPctPointAt } = await import(
      pathToFileURL(join(__dirname, '../src/shared/pct-map/pctPolygon.js')).href
    );
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const hit = findNearestEdgeInsertion(square, { x: 5, y: 0 }, 2);
    assert.ok(hit);
    assert.equal(hit.insertIndex, 1);
    const next = insertPctPointAt(square, hit.insertIndex, hit.point);
    assert.equal(next.length, 5);
    assert.ok(Math.abs(next[1].x - 5) < 0.1);
  });

  it('refuse de retirer un sommet si le polygone aurait moins de 3 points', async () => {
    const { removePctPointAt } = await import(
      pathToFileURL(join(__dirname, '../src/shared/pct-map/pctPolygon.js')).href
    );
    const tri = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 25, y: 50 },
    ];
    const next = removePctPointAt(tri, 1);
    assert.equal(next.length, 3);
  });

  it('translate un polygone', async () => {
    const { translatePctPoints } = await import(
      pathToFileURL(join(__dirname, '../src/shared/pct-map/pctPolygon.js')).href
    );
    const moved = translatePctPoints([{ x: 1, y: 2 }], 3, 4);
    assert.deepEqual(moved, [{ x: 4, y: 6 }]);
  });
});
