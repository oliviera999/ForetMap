'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { queryAll } = require('../database');
const { validateGlMascotPack } = require('./gl-pack/mascotPack');

let glMascotPackToVisitPromise = null;

function loadGlMascotPackToVisitModule() {
  if (!glMascotPackToVisitPromise) {
    const absolute = path.join(__dirname, '..', 'src', 'utils', 'glMascotPackToVisit.js');
    glMascotPackToVisitPromise = import(pathToFileURL(absolute).href).catch(() => null);
  }
  return glMascotPackToVisitPromise;
}

/**
 * Entrées catalogue GL à partir des packs persistés (`gl_mascot_packs`).
 * @returns {Promise<Array<object>>}
 */
async function loadGlMascotPackCatalogEntries() {
  let rows = [];
  try {
    rows = await queryAll(
      `SELECT id, name, payload_json
         FROM gl_mascot_packs
        ORDER BY updated_at DESC, id DESC`
    );
  } catch (_) {
    return [];
  }

  const toVisitMod = await loadGlMascotPackToVisitModule();
  const out = [];
  for (const row of rows || []) {
    let payload = {};
    try {
      payload = row.payload_json ? JSON.parse(row.payload_json) : {};
    } catch (_) {
      continue;
    }
    const parsed = validateGlMascotPack(payload);
    if (!parsed.success) continue;
    const data = parsed.data;
    const id = String(data.id || '').trim();
    if (!id) continue;
    const entry = {
      id,
      label: String(row.name || data.name || id).trim(),
      source: 'gl',
      type: data.type === 'unicorn' ? 'unicorn' : 'gnome',
      renderer: data.renderer || 'fallback',
      description: `Pack mascotte GL (#${Number(row.id)})`,
    };
    if (data.renderer === 'sprite_cut'
      && toVisitMod
      && typeof toVisitMod.glMascotPackSpriteCutToVisitValidation === 'function') {
      const mapped = toVisitMod.glMascotPackSpriteCutToVisitValidation(data, { relaxAssetPrefix: true });
      if (mapped.ok) {
        entry.spriteCut = mapped.spriteCut;
        entry.fallbackSilhouette = mapped.visitPack?.fallbackSilhouette
          || data.fallbackSilhouette
          || 'gnome';
        entry.mascotPackVersion = 1;
      }
    }
    out.push(entry);
  }
  return out;
}

module.exports = {
  loadGlMascotPackCatalogEntries,
};
