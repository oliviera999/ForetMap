'use strict';

require('./helpers/setup');
const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('url');
const { join } = require('path');

let parseVisitZonePoints;
let visitZoneCentroidPct;

before(async () => {
  const mod = await import(pathToFileURL(join(__dirname, '../src/utils/visitMapGeometry.js')).href);
  parseVisitZonePoints = mod.parseVisitZonePoints;
  visitZoneCentroidPct = mod.visitZoneCentroidPct;
});

describe('visitMapGeometry', () => {
  it('parseVisitZonePoints ignore les entrées invalides', () => {
    assert.deepEqual(parseVisitZonePoints(''), []);
    assert.deepEqual(parseVisitZonePoints('not json'), []);
    assert.deepEqual(parseVisitZonePoints('{}'), []);
    assert.deepEqual(parseVisitZonePoints('[{"xp":"x","yp":1}]'), []);
  });

  it('parseVisitZonePoints accepte des nombres valides', () => {
    const raw = JSON.stringify([
      { xp: 10, yp: 20 },
      { xp: 30, yp: 40 },
    ]);
    assert.deepEqual(parseVisitZonePoints(raw), [
      { xp: 10, yp: 20 },
      { xp: 30, yp: 40 },
    ]);
  });

  it('visitZoneCentroidPct retourne null si moins de 3 points', () => {
    assert.equal(visitZoneCentroidPct({ points: '[]' }), null);
    assert.equal(
      visitZoneCentroidPct({ points: JSON.stringify([{ xp: 0, yp: 0 }, { xp: 1, yp: 1 }]) }),
      null
    );
  });

  it('visitZoneCentroidPct calcule le centroïde du carré 0–100', () => {
    const square = JSON.stringify([
      { xp: 0, yp: 0 },
      { xp: 100, yp: 0 },
      { xp: 100, yp: 100 },
      { xp: 0, yp: 100 },
    ]);
    const c = visitZoneCentroidPct({ points: square });
    assert.ok(c);
    assert.ok(Math.abs(c.xp - 50) < 1e-9);
    assert.ok(Math.abs(c.yp - 50) < 1e-9);
  });

  it('visitZoneCentroidPct calcule le centroïde d’un triangle', () => {
    const tri = JSON.stringify([
      { xp: 0, yp: 0 },
      { xp: 100, yp: 0 },
      { xp: 50, yp: 100 },
    ]);
    const c = visitZoneCentroidPct({ points: tri });
    assert.ok(c);
    assert.ok(Math.abs(c.xp - 50) < 1e-9);
    assert.ok(Math.abs(c.yp - 100 / 3) < 1e-6);
  });
});
