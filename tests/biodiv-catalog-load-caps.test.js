'use strict';

/**
 * Plafonds / lots catalogue biodiversité (plan charge biodiv 1A).
 * Le serveur reste à 200 ids/requête ; le client découpe et fusionne.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const { parsePlantIdsQueryParam } = require('../lib/plantsRouteHelpers');
const { SUMMARY_MAX_REFS } = require('../lib/learningGatingSummary');

async function loadCatalogLoad() {
  return import(pathToFileURL(path.join(__dirname, '../src/utils/biodivCatalogLoad.js')).href);
}

test('parsePlantIdsQueryParam tronque toujours à 200 (contrat HTTP unitaire)', () => {
  const raw = Array.from({ length: 250 }, (_, i) => i + 1).join(',');
  const parsed = parsePlantIdsQueryParam(raw);
  assert.equal(parsed.length, 200);
  assert.equal(parsed[0], 1);
  assert.equal(parsed[199], 200);
});

test('SUMMARY_MAX_REFS serveur = 200 (taille de lot)', () => {
  assert.equal(SUMMARY_MAX_REFS, 200);
});

test('chunkIds découpe 250 ids en deux lots de 200 et 50', async () => {
  const { chunkIds, BIODIV_IDS_BATCH_SIZE, normalizePlantIds } = await loadCatalogLoad();
  assert.equal(BIODIV_IDS_BATCH_SIZE, 200);
  const ids = normalizePlantIds(Array.from({ length: 250 }, (_, i) => i + 1));
  const batches = chunkIds(ids);
  assert.equal(batches.length, 2);
  assert.equal(batches[0].length, 200);
  assert.equal(batches[1].length, 50);
  assert.equal(batches[0][0], 1);
  assert.equal(batches[1][0], 201);
});

test('chunkIds liste vide → []', async () => {
  const { chunkIds } = await loadCatalogLoad();
  assert.deepEqual(chunkIds([]), []);
  assert.deepEqual(chunkIds(null), []);
});

test('GATING_SUMMARY_MAX_REFS client aligné sur la taille de lot', async () => {
  const catalog = await loadCatalogLoad();
  const mod = await import(
    pathToFileURL(path.join(__dirname, '../src/shared/hooks/useLearningGatingSummary.js')).href
  );
  assert.equal(mod.GATING_SUMMARY_MAX_REFS, catalog.BIODIV_IDS_BATCH_SIZE);
  assert.equal(mod.GATING_SUMMARY_MAX_REFS, SUMMARY_MAX_REFS);
});

test('BIODIV_PAGE_SIZE = 36 (Voir plus)', async () => {
  const { BIODIV_PAGE_SIZE } = await loadCatalogLoad();
  assert.equal(BIODIV_PAGE_SIZE, 36);
});
