'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { listPublishedVisitMascotPacks } = require('./visitMascotRegistry');

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
 *
 * La lecture des packs (SQL, parsing JSON, dédoublonnage par `catalog_id` toutes cartes
 * confondues) vient du **registre de visite** — ce module n'ajoute que l'expansion
 * `spriteCut` attendue par le renderer. Les deux étapes vivaient auparavant en double,
 * avec des règles de dédoublonnage différentes.
 *
 * @returns {Promise<Array<object>>}
 */
async function loadPublishedVisitMascotPackCatalogEntries() {
  let packs = [];
  try {
    packs = await listPublishedVisitMascotPacks();
  } catch (_) {
    return [];
  }

  const mod = await loadMascotPackModule();
  if (!mod || typeof mod.validateMascotPackV1 !== 'function') return [];

  const out = [];
  for (const row of packs) {
    const relaxed = mod.validateMascotPackV1(row.pack, { relaxAssetPrefix: true });
    if (!relaxed.ok) continue;
    const ver = Number(relaxed.pack.mascotPackVersion) === 2 ? 2 : 1;
    out.push({
      id: row.id,
      label: row.label || relaxed.pack.label,
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
