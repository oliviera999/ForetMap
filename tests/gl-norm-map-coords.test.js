'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

test('glNormMapCoords: conversion 0-1 vers 0-100', async () => {
  const {
    normToPct,
    pctToNorm,
    normPointToPct,
    normPolygonToPctPoints,
    pctPointToNorm,
    pctPointsToNormPolygon,
  } = await import('../src/utils/glNormMapCoords.js');

  assert.strictEqual(normToPct(0.5), 50);
  assert.strictEqual(pctToNorm(50), 0.5);
  assert.deepStrictEqual(normPointToPct([0.2, 0.8]), { x: 20, y: 80 });
  assert.deepStrictEqual(normPolygonToPctPoints([[0, 0], [1, 1]]), [
    { x: 0, y: 0 },
    { x: 100, y: 100 },
  ]);
  assert.deepStrictEqual(pctPointToNorm({ x: 25, y: 75 }), [0.25, 0.75]);
  assert.deepStrictEqual(pctPointsToNormPolygon([{ x: 10, y: 20 }]), [[0.1, 0.2]]);
});
