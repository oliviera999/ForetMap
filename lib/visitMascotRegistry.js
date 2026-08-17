'use strict';

/**
 * Registre unifié des mascottes de visite.
 *
 * Une mascotte est **une entrée du registre**, quelle que soit son origine :
 * - `source: 'catalog'` — mascotte livrée avec l'application (catalogue statique
 *   `src/utils/visitMascotCatalog.js`, servi côté serveur par son miroir CJS-compatible
 *   `lib/visit-pack/visitMascotCatalog.js`, synchronisé au build par `sync:visit-pack-lib`) ;
 * - `source: 'pack'` — pack importé/créé au studio et **publié** (table `visit_mascot_packs`).
 *
 * Les deux sources sont traitées à égalité : même identifiant (`id`), même libellé,
 * mêmes droits à être proposée aux visiteurs (`ui.visit.mascot.allowed_ids`) et à
 * devenir la mascotte par défaut (`ui.visit.mascot.default_id`).
 *
 * Les packs sont **dédupliqués par `catalog_id` toutes cartes confondues** : la mascotte
 * choisie par un visiteur le suit d'une carte à l'autre (cf. `docs/reference/foretmap/
 * visite-et-mascottes.md`). En cas d'homonymie entre cartes, le pack le plus récemment
 * mis à jour gagne.
 */

const { queryAll } = require('../database');
const { mergeMascotRegistryEntries } = require('./mascotRegistryMerge');

/** Cache du module catalogue (import ESM dynamique : le miroir n'est pas du CJS). */
let staticCatalogCache = null;

/**
 * Le **miroir `lib/visit-pack/` d'abord** : en production « runtime », `src/` est absent
 * (cf. `sync:visit-pack-lib`). Le repli sur `src/` ne sert qu'au développement quand le
 * build n'a pas encore été joué.
 */
async function loadStaticCatalogModule() {
  try {
    return await import('./visit-pack/visitMascotCatalog.js');
  } catch (_) {
    return await import('../src/utils/visitMascotCatalog.js');
  }
}

/**
 * Entrées **complètes** du catalogue livré (renderer, rive/spritesheet/spriteCut…), telles
 * que le front les consomme. Renvoie `[]` si le catalogue est introuvable côté serveur :
 * le front garde le sien, l'indisponibilité serveur ne casse jamais le rendu.
 */
async function listStaticVisitMascotEntries() {
  if (staticCatalogCache) return staticCatalogCache.map((entry) => ({ ...entry }));
  try {
    const mod = await loadStaticCatalogModule();
    const entries = mod.getVisitMascotCatalog();
    staticCatalogCache = (Array.isArray(entries) ? entries : []).filter((entry) =>
      String(entry?.id || '').trim(),
    );
    return staticCatalogCache.map((entry) => ({ ...entry }));
  } catch (_) {
    return [];
  }
}

/** Projection légère du catalogue livré : `[{ id, label }]`. */
async function listStaticVisitMascots() {
  const entries = await listStaticVisitMascotEntries();
  return entries.map((entry) => ({
    id: String(entry.id).trim(),
    label: String(entry.label || entry.id).trim(),
  }));
}

/** Identifiant par défaut livré avec l'application (repli ultime, jamais codé en dur ici). */
async function getBuiltinDefaultVisitMascotId() {
  try {
    const mod = await loadStaticCatalogModule();
    return String(mod.getDefaultVisitMascotId() || '').trim();
  } catch (_) {
    return '';
  }
}

/**
 * Packs publiés, toutes cartes confondues, dédupliqués par `catalog_id`
 * (le plus récemment mis à jour gagne). Renvoie `[]` si la table n'existe pas encore.
 */
async function listPublishedVisitMascotPacks() {
  let rows = [];
  try {
    rows = await queryAll(
      `SELECT catalog_id, label, map_id, pack_json, updated_at
         FROM visit_mascot_packs
        WHERE is_published = 1
        ORDER BY updated_at DESC, id ASC`,
    );
  } catch (e) {
    if (e && (e.errno === 1146 || e.code === 'ER_NO_SUCH_TABLE')) return [];
    throw e;
  }
  const byCatalogId = new Map();
  for (const row of rows || []) {
    const id = String(row?.catalog_id || '').trim();
    if (!id || byCatalogId.has(id)) continue;
    let pack = null;
    try {
      pack = JSON.parse(row.pack_json);
    } catch (_) {
      pack = null;
    }
    if (!pack || typeof pack !== 'object') continue;
    byCatalogId.set(id, {
      id,
      label: String(row.label || id).trim() || id,
      map_id: row.map_id || null,
      pack,
    });
  }
  return Array.from(byCatalogId.values());
}

/**
 * Registre complet servi à l'admin et au front : catalogue statique puis packs publiés.
 * Un pack qui reprendrait l'identifiant d'une mascotte du catalogue ne le remplace pas
 * (l'entrée statique reste, cf. `resolveVisitMascotEntry` côté front où l'extra gagne au rendu).
 *
 * @returns {Promise<Array<{ id: string, label: string, source: 'catalog'|'pack', map_id: string|null, pack: object|null }>>}
 */
async function listVisitMascotRegistry() {
  const [staticEntries, packs] = await Promise.all([
    listStaticVisitMascots(),
    listPublishedVisitMascotPacks(),
  ]);
  return mergeMascotRegistryEntries([
    {
      source: 'catalog',
      entries: staticEntries.map((entry) => ({ ...entry, map_id: null, pack: null })),
    },
    { source: 'pack', entries: packs },
  ]);
}

module.exports = {
  listStaticVisitMascots,
  listStaticVisitMascotEntries,
  listPublishedVisitMascotPacks,
  listVisitMascotRegistry,
  getBuiltinDefaultVisitMascotId,
};
