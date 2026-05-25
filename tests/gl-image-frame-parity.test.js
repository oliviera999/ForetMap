'use strict';

require('./helpers/setup');
const { before, test } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('url');
const { join } = require('path');
const libFrame = require('../lib/glImageFrame');

let srcFrame;

before(async () => {
  srcFrame = await import(pathToFileURL(join(__dirname, '../src/utils/glImageFrame.js')).href);
});

test('glImageFrame frontend/backend restent alignés', () => {
  const sample = {
    aspectRatio: '16/9',
    objectFit: 'cover',
    focalX: 37.5,
    focalY: 62.5,
    maxWidthPx: '900',
    maxHeightPx: '',
    crop: { x: 0.1, y: 0.2, w: 0.9, h: 0.7 },
  };
  assert.deepEqual(
    srcFrame.normalizeGlImageFrame(sample, 'brand-banner'),
    libFrame.normalizeGlImageFrame(sample, 'brand-banner')
  );
  assert.deepEqual(
    srcFrame.parseGlImageFrameAttr('{bad-json}', 'chapter-map'),
    libFrame.parseGlImageFrameAttr('{bad-json}', 'chapter-map')
  );
});
