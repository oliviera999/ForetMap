'use strict';

require('./helpers/setup');
const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('url');
const { join } = require('path');

let normalizeWheelDeltaYPixels;
let wheelZoomScaleFactor;

describe('mapWheelZoom', () => {
  before(async () => {
    const mod = await import(pathToFileURL(join(__dirname, '../src/utils/mapWheelZoom.js')).href);
    normalizeWheelDeltaYPixels = mod.normalizeWheelDeltaYPixels;
    wheelZoomScaleFactor = mod.wheelZoomScaleFactor;
  });
  it('normalise DOM_DELTA_LINE en pixels virtuels', () => {
    const dy = normalizeWheelDeltaYPixels({ deltaY: 3, deltaMode: 1 }, { linePixels: 16 });
    assert.equal(dy, 48);
  });

  it('molette pixel : petit delta donne un facteur proche de 1', () => {
    const f = wheelZoomScaleFactor({ deltaY: 8, deltaMode: 0 }, { pixelsPerZoomLevel: 380 });
    assert.ok(f > 0.97 && f < 1.03, `facteur ${f} attendu proche de 1`);
  });

  it('borne les sauts extrêmes', () => {
    const fIn = wheelZoomScaleFactor({ deltaY: -5000, deltaMode: 0 });
    assert.ok(fIn <= 1.38);
    const fOut = wheelZoomScaleFactor({ deltaY: 5000, deltaMode: 0 });
    assert.ok(fOut >= 0.72);
  });
});
