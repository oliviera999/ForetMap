'use strict';

const { getGlMascotCatalog } = require('./glMascotCatalog');
const { loadPublishedVisitMascotPackCatalogEntries } = require('./visitMascotPackCatalog');
const { loadGlMascotPackCatalogEntries } = require('./glMascotPackCatalog');
const { listStaticVisitMascotEntries } = require('./visitMascotRegistry');
const { mergeMascotRegistryEntries } = require('./mascotRegistryMerge');

let cachedStaticCatalog = null;
let cachedStaticById = null;

/**
 * Catalogue statique unifié : mascottes G&L puis mascottes livrées ForetMap.
 *
 * Le catalogue ForetMap vient du **registre de visite** (`listStaticVisitMascotEntries`),
 * qui lit le miroir `lib/visit-pack/` avant `src/` : ce module chargeait auparavant `src/`
 * en dur, ce qui échouait en production « runtime » (déploiement sans `src/`) et faisait
 * tomber `GET /api/gl/mascots` en erreur au lieu de servir le catalogue.
 */
async function buildStaticCatalog() {
  const [glCatalog, visitCatalog] = await Promise.all([
    getGlMascotCatalog(),
    listStaticVisitMascotEntries(),
  ]);

  const merged = mergeMascotRegistryEntries([
    { source: 'gl', entries: glCatalog || [] },
    { source: 'foretmap', entries: visitCatalog || [] },
  ]);

  cachedStaticCatalog = merged;
  cachedStaticById = new Map(merged.map((item) => [String(item.id), item]));
  return merged;
}

async function loadStaticCatalog() {
  if (cachedStaticCatalog) return cachedStaticCatalog;
  return buildStaticCatalog();
}

async function loadDynamicCatalogEntries() {
  const [visitPacks, glPacks] = await Promise.all([
    loadPublishedVisitMascotPackCatalogEntries(),
    loadGlMascotPackCatalogEntries(),
  ]);
  return [...(visitPacks || []), ...(glPacks || [])];
}

async function loadCatalog() {
  const [staticCatalog, dynamicEntries] = await Promise.all([
    loadStaticCatalog(),
    loadDynamicCatalogEntries(),
  ]);
  return mergeMascotRegistryEntries([
    { entries: staticCatalog },
    { source: 'foretmap', entries: dynamicEntries },
  ]);
}

async function getGlUnifiedMascotCatalog() {
  const catalog = await loadCatalog();
  return catalog.map((entry) => ({ ...entry }));
}

async function getGlUnifiedMascotById(mascotId) {
  const catalog = await loadCatalog();
  const id = String(mascotId || '').trim();
  if (!id) return null;
  const row = catalog.find((item) => String(item.id) === id);
  return row ? { ...row } : null;
}

function invalidateGlUnifiedMascotCatalogForTests() {
  cachedStaticCatalog = null;
  cachedStaticById = null;
}

module.exports = {
  getGlUnifiedMascotCatalog,
  getGlUnifiedMascotById,
  invalidateGlUnifiedMascotCatalogForTests,
};
