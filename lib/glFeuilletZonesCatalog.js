'use strict';

const fs = require('fs');
const path = require('path');

let cachedById = null;

function catalogPath() {
  return path.join(__dirname, '..', 'src', 'gl', 'data', 'zones_feuillets.json');
}

function loadRawCatalog() {
  const raw = fs.readFileSync(catalogPath(), 'utf8');
  return JSON.parse(raw);
}

function buildCatalogIndex() {
  const raw = loadRawCatalog();
  const zones = Array.isArray(raw?.zones) ? raw.zones : [];
  const byId = new Map();
  for (const zone of zones) {
    const zoneId = String(zone?.zone_id || '').trim();
    if (!zoneId) continue;
    byId.set(zoneId, zone);
  }
  return byId;
}

function getFeuilletZoneById(zoneId) {
  if (!cachedById) {
    cachedById = buildCatalogIndex();
  }
  return cachedById.get(String(zoneId || '').trim()) || null;
}

function resetFeuilletZonesCatalogCache() {
  cachedById = null;
}

/** Ensemble des `feuillet_code` couverts par une zone carte (canal « zone »). */
function getZoneFeuilletCodes() {
  const byId = cachedById || buildCatalogIndex();
  const codes = new Set();
  for (const zone of byId.values()) {
    const code = String(zone?.feuillet_code || '').trim();
    if (code) codes.add(code);
  }
  return codes;
}

module.exports = {
  getFeuilletZoneById,
  getZoneFeuilletCodes,
  resetFeuilletZonesCatalogCache,
  loadRawCatalog,
};
