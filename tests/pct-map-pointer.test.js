'use strict';

require('./helpers/setup');
const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('url');
const { join } = require('path');

let pointToElementPct;
let pointToContainedRectPct;

describe('pctMapPointer', () => {
  before(async () => {
    const mod = await import(pathToFileURL(join(__dirname, '../src/shared/pct-map/pctMapPointer.js')).href);
    pointToElementPct = mod.pointToElementPct;
    pointToContainedRectPct = mod.pointToContainedRectPct;
  });

  it('calcule un pourcentage borné dans un rectangle', () => {
    const point = pointToElementPct(150, 75, { left: 100, top: 50, width: 200, height: 100 }, { decimals: 2 });
    assert.deepEqual(point, { x: 25, y: 25 });
  });

  it('respecte le mode non borné pour la carte tâches', () => {
    const point = pointToContainedRectPct(
      { clientX: 330, clientY: 20 },
      { getBoundingClientRect: () => ({ left: 100, top: 50, width: 200, height: 100 }) },
      { x: 0, y: 0, s: 1 },
      { offsetX: 0, offsetY: 0, width: 200, height: 100 },
      { clamp: false }
    );
    assert.ok(point.xp > 100);
    assert.ok(point.yp < 0);
  });
});
