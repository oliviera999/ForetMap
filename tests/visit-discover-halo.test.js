'use strict';

require('./helpers/setup');
const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('url');
const { join } = require('path');

let pickDiscoverHaloKeys;
let discoverPlaceAnchorPct;
let DISCOVER_HALO_LIMIT;

before(async () => {
  const mod = await import(
    pathToFileURL(join(__dirname, '../src/utils/visitDiscoverHalo.js')).href
  );
  pickDiscoverHaloKeys = mod.pickDiscoverHaloKeys;
  discoverPlaceAnchorPct = mod.discoverPlaceAnchorPct;
  DISCOVER_HALO_LIMIT = mod.DISCOVER_HALO_LIMIT;
});

function zoneAt(id, xp, yp) {
  return {
    id,
    points: JSON.stringify([
      { xp: xp - 2, yp: yp - 2 },
      { xp: xp + 2, yp: yp - 2 },
      { xp: xp + 2, yp: yp + 2 },
      { xp: xp - 2, yp: yp + 2 },
    ]),
  };
}

describe('visitDiscoverHalo', () => {
  it('discoverPlaceAnchorPct lit un repère et un polygone', () => {
    assert.deepEqual(discoverPlaceAnchorPct({ x_pct: 12, y_pct: 34 }), { xp: 12, yp: 34 });
    const anchor = discoverPlaceAnchorPct(zoneAt(1, 40, 60));
    assert.ok(anchor);
    assert.ok(Math.abs(anchor.xp - 40) < 1);
    assert.ok(Math.abs(anchor.yp - 60) < 1);
  });

  it('pickDiscoverHaloKeys ignore sans Set seen', () => {
    const keys = pickDiscoverHaloKeys({
      zones: [zoneAt(1, 50, 50)],
      markers: [{ id: 2, x_pct: 10, y_pct: 10 }],
      seen: null,
    });
    assert.equal(keys.size, 0);
  });

  it('pickDiscoverHaloKeys exclut les lieux déjà vus et borne le nombre', () => {
    const zones = [
      zoneAt(1, 50, 50),
      zoneAt(2, 80, 80),
      zoneAt(3, 20, 20),
      zoneAt(4, 90, 10),
      zoneAt(5, 10, 90),
      zoneAt(6, 70, 30),
    ];
    const markers = [
      { id: 11, x_pct: 48, y_pct: 52 },
      { id: 12, x_pct: 5, y_pct: 5 },
    ];
    const seen = new Set(['zone:1', 'marker:11']);
    const keys = pickDiscoverHaloKeys({
      zones,
      markers,
      seen,
      centerPct: { xp: 50, yp: 50 },
      limit: 3,
    });
    assert.equal(keys.size, 3);
    assert.equal(keys.has('zone:1'), false);
    assert.equal(keys.has('marker:11'), false);
    // Les plus proches du centre parmi les restants : zone 6 (~70,30) et zone 3 / marker 12 etc.
    assert.ok([...keys].every((k) => !seen.has(k)));
  });

  it('pickDiscoverHaloKeys respecte la limite par défaut', () => {
    const zones = Array.from({ length: 12 }, (_, i) => zoneAt(i + 1, 10 + i * 5, 50));
    const keys = pickDiscoverHaloKeys({ zones, markers: [], seen: new Set() });
    assert.equal(keys.size, DISCOVER_HALO_LIMIT);
  });
});
