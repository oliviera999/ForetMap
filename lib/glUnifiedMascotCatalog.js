'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { getGlMascotCatalog } = require('./glMascotCatalog');

let cachedCatalog = null;
let cachedById = null;

function normalizeEntry(entry, source) {
  if (!entry || !entry.id) return null;
  return {
    ...entry,
    source,
  };
}

async function loadVisitMascots() {
  const absolute = path.join(__dirname, '..', 'src', 'utils', 'visitMascotCatalog.js');
  const mod = await import(pathToFileURL(absolute).href);
  if (typeof mod.getVisitMascotCatalog !== 'function') return [];
  const entries = mod.getVisitMascotCatalog();
  return Array.isArray(entries) ? entries : [];
}

async function loadCatalog() {
  if (cachedCatalog) return cachedCatalog;
  const [glCatalog, visitCatalog] = await Promise.all([
    getGlMascotCatalog(),
    loadVisitMascots(),
  ]);

  const merged = [];
  const seen = new Set();
  for (const row of glCatalog || []) {
    const normalized = normalizeEntry(row, 'gl');
    if (!normalized || seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    merged.push(normalized);
  }
  for (const row of visitCatalog || []) {
    const normalized = normalizeEntry(row, 'foretmap');
    if (!normalized || seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    merged.push(normalized);
  }

  cachedCatalog = merged;
  cachedById = new Map(merged.map((item) => [String(item.id), item]));
  return cachedCatalog;
}

async function getGlUnifiedMascotCatalog() {
  const catalog = await loadCatalog();
  return catalog.map((entry) => ({ ...entry }));
}

async function getGlUnifiedMascotById(mascotId) {
  await loadCatalog();
  if (!cachedById) return null;
  const id = String(mascotId || '').trim();
  if (!id) return null;
  const row = cachedById.get(id);
  return row ? { ...row } : null;
}

function invalidateGlUnifiedMascotCatalogForTests() {
  cachedCatalog = null;
  cachedById = null;
}

module.exports = {
  getGlUnifiedMascotCatalog,
  getGlUnifiedMascotById,
  invalidateGlUnifiedMascotCatalogForTests,
};
