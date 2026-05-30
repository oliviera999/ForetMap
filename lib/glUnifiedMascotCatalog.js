'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { getGlMascotCatalog } = require('./glMascotCatalog');
const { loadPublishedVisitMascotPackCatalogEntries } = require('./visitMascotPackCatalog');
const { loadGlMascotPackCatalogEntries } = require('./glMascotPackCatalog');

let cachedStaticCatalog = null;
let cachedStaticById = null;

function normalizeEntry(entry, source) {
  if (!entry || !entry.id) return null;
  return {
    ...entry,
    source: entry.source || source,
  };
}

async function loadVisitMascots() {
  const absolute = path.join(__dirname, '..', 'src', 'utils', 'visitMascotCatalog.js');
  const mod = await import(pathToFileURL(absolute).href);
  if (typeof mod.getVisitMascotCatalog !== 'function') return [];
  const entries = mod.getVisitMascotCatalog();
  return Array.isArray(entries) ? entries : [];
}

async function buildStaticCatalog() {
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
  const staticCatalog = await loadStaticCatalog();
  const dynamicEntries = await loadDynamicCatalogEntries();
  const merged = staticCatalog.map((entry) => ({ ...entry }));
  const seen = new Set(merged.map((item) => String(item.id)));
  for (const row of dynamicEntries) {
    const normalized = normalizeEntry(row, row.source || 'foretmap');
    if (!normalized || seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    merged.push(normalized);
  }
  return merged;
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
