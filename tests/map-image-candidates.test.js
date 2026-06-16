'use strict';

require('./helpers/setup');
const { before, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('url');
const { join } = require('path');

let buildMapImageCandidates;

describe('mapImageCandidates', () => {
  before(async () => {
    const mod = await import(
      pathToFileURL(join(__dirname, '../src/utils/mapImageCandidates.js')).href
    );
    buildMapImageCandidates = mod.buildMapImageCandidates;
  });

  it('priorise map_image_url et conserve /map.png en ultime fallback', () => {
    const candidates = buildMapImageCandidates({
      id: 'potager',
      map_image_url: '/uploads/maps/potager-main.webp',
    });
    assert.deepEqual(candidates, ['/uploads/maps/potager-main.webp', '/map.png']);
  });

  it('déduplique les URLs candidates issues des fallbacks carte', () => {
    const candidates = buildMapImageCandidates({
      id: 'foret',
      map_image_url: '/map.png',
      fallback_image_urls: ['/maps/plan-foret.jpg', '/map.png', '/maps/plan-foret.jpg'],
    });
    assert.deepEqual(candidates, ['/map.png', '/maps/plan-foret.jpg']);
  });
});
