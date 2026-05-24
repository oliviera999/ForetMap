'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const {
  normalizeGlImageFrame,
  parseGlImageFrameAttr,
} = require('../lib/glImageFrame');

test('normalizeGlImageFrame applique les valeurs par defaut par contexte', () => {
  const frame = normalizeGlImageFrame(null, 'chapter-map');
  assert.strictEqual(frame.objectFit, 'contain');
  assert.strictEqual(frame.aspectRatio, 'auto');
  assert.strictEqual(frame.focalX, 50);
  assert.strictEqual(frame.focalY, 50);
});

test('normalizeGlImageFrame nettoie les valeurs hors bornes', () => {
  const frame = normalizeGlImageFrame({
    aspectRatio: 'bad',
    objectFit: 'invalid',
    focalX: 200,
    focalY: -50,
    maxWidthPx: -20,
    maxHeightPx: 9000,
    crop: { x: -1, y: 0.25, w: 2, h: 0.6 },
  }, 'brand-card');
  assert.strictEqual(frame.aspectRatio, '4/3');
  assert.strictEqual(frame.objectFit, 'cover');
  assert.strictEqual(frame.focalX, 100);
  assert.strictEqual(frame.focalY, 0);
  assert.strictEqual(frame.maxWidthPx, null);
  assert.strictEqual(frame.maxHeightPx, 4096);
  assert.deepStrictEqual(frame.crop, { x: 0, y: 0.25, w: 1, h: 0.6 });
});

test('parseGlImageFrameAttr degrade proprement le JSON invalide', () => {
  const frame = parseGlImageFrameAttr('{not-json}', 'brand-banner');
  assert.strictEqual(frame.aspectRatio, '16/9');
  assert.strictEqual(frame.maxHeightPx, 280);
});
