'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { queryAll } = require('../database');

let mascotPackModulePromise = null;

function loadMascotPackModule() {
  if (!mascotPackModulePromise) {
    const absolute = path.join(__dirname, 'visit-pack', 'mascotPack.js');
    mascotPackModulePromise = import(pathToFileURL(absolute).href).catch(() => null);
  }
  return mascotPackModulePromise;
}

/**
 * Entrées catalogue visite (`sprite_cut`) à partir des packs publiés en base.
 * @returns {Promise<Array<object>>}
 */
async function loadPublishedVisitMascotPackCatalogEntries() {
  let rows = [];
  try {
    rows = await queryAll(
      `SELECT catalog_id, label, pack_json
         FROM visit_mascot_packs
        WHERE is_published = 1
        ORDER BY updated_at DESC, id ASC`
    );
  } catch (_) {
    return [];
  }

  const mod = await loadMascotPackModule();
  if (!mod || typeof mod.validateMascotPackV1 !== 'function') return [];

  const out = [];
  for (const row of rows || []) {
    const catalogId = String(row?.catalog_id || '').trim();
    if (!catalogId) continue;
    let pack = {};
    try {
      pack = JSON.parse(row.pack_json);
    } catch (_) {
      continue;
    }
    if (!pack || typeof pack !== 'object') continue;
    const relaxed = mod.validateMascotPackV1(pack, { relaxAssetPrefix: true });
    if (!relaxed.ok) continue;
    const ver = Number(relaxed.pack.mascotPackVersion) === 2 ? 2 : 1;
    out.push({
      id: catalogId,
      label: String(row.label || '').trim() || relaxed.pack.label,
      source: 'foretmap',
      renderer: 'sprite_cut',
      fallbackSilhouette: relaxed.pack.fallbackSilhouette || 'gnome',
      spriteCut: relaxed.spriteCut,
      ...(ver === 2 && relaxed.pack.interactionProfile
        ? { interactionProfile: relaxed.pack.interactionProfile }
        : {}),
      mascotPackVersion: ver,
      description: 'Mascotte pack publiée (visite ForetMap)',
    });
  }
  return out;
}

module.exports = {
  loadPublishedVisitMascotPackCatalogEntries,
};
