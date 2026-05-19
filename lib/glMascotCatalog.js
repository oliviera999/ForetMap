'use strict';

/**
 * Pont CJS -> ESM pour le catalogue de mascottes G&L (Lot 2C).
 *
 * Le catalogue source vit dans `src/utils/glMascotCatalog.js` (ESM, consommé
 * par le frontend Vite). Ce module l'importe dynamiquement la première fois
 * qu'il est utilisé côté serveur (routes/gl/mascots.js, tests Node) et met le
 * résultat en cache.
 */

const path = require('node:path');
const { pathToFileURL } = require('node:url');

let cachedCatalog = null;
let cachedById = null;

async function loadCatalog() {
  if (cachedCatalog) return cachedCatalog;
  const absolute = path.join(__dirname, '..', 'src', 'utils', 'glMascotCatalog.js');
  const mod = await import(pathToFileURL(absolute).href);
  const catalog = Array.isArray(mod.GL_MASCOT_CATALOG) ? mod.GL_MASCOT_CATALOG : [];
  cachedCatalog = catalog.map((entry) => ({ ...entry }));
  cachedById = new Map();
  for (const entry of cachedCatalog) {
    cachedById.set(String(entry.id), entry);
  }
  return cachedCatalog;
}

async function getGlMascotCatalog() {
  return loadCatalog();
}

async function getGlMascotById(mascotId) {
  await loadCatalog();
  if (!cachedById) return null;
  const id = String(mascotId || '').trim();
  if (!id) return null;
  return cachedById.get(id) || null;
}

function invalidateForTests() {
  cachedCatalog = null;
  cachedById = null;
}

module.exports = {
  getGlMascotCatalog,
  getGlMascotById,
  invalidateForTests,
};
