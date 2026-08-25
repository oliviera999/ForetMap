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
 * Les deux sources sont traitées à égalité : même identifiant (`id`), même libellé, même droit
 * à devenir la mascotte par défaut (`ui.visit.mascot.default_id`).
 *
 * **Être proposée aux visiteurs ne se règle plus ici** : c'est `is_published` sur la ligne
 * (étape 3 de la fusion). L'ancien `ui.visit.mascot.allowed_ids` était une liste blanche
 * d'identifiants, donc figée sur les mascottes existant le jour où on la posait — toute mascotte
 * ajoutée ensuite en était absente, donc invisible. Voir `lib/visitMascotVisibility.js`.
 *
 * Les packs ne sont **pas** rattachés à une carte (migration
 * `176_visit_mascot_packs_drop_map.sql`) : une mascotte publiée est proposée partout, et
 * le choix d'un visiteur le suit d'une carte à l'autre (cf. `docs/reference/foretmap/
 * visite-et-mascottes.md`). `catalog_id` est unique en base ; la déduplication par
 * `catalog_id` reste un garde-fou (le pack le plus récemment mis à jour gagne).
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
      `SELECT catalog_id, label, pack_json, updated_at
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
      pack,
    });
  }
  return Array.from(byCatalogId.values());
}

/**
 * `catalog_id` de **toutes** les lignes de `visit_mascot_packs`, publiées ou non.
 *
 * Sert à savoir si une mascotte livrée a déjà sa ligne. Renvoie `null` — et non `[]` — si la
 * table est inaccessible : l'appelant doit pouvoir distinguer « aucune ligne » de « je ne sais
 * pas », les deux n'appellent pas la même prudence.
 *
 * @returns {Promise<Set<string>|null>}
 */
async function listVisitMascotPackCatalogIds() {
  try {
    const rows = await queryAll('SELECT catalog_id FROM visit_mascot_packs');
    return new Set((rows || []).map((r) => String(r?.catalog_id || '').trim()).filter(Boolean));
  } catch (e) {
    if (e && (e.errno === 1146 || e.code === 'ER_NO_SUCH_TABLE')) return new Set();
    return null;
  }
}

/**
 * Registre complet servi à l'admin et au front : catalogue statique puis packs publiés.
 * Un pack qui reprendrait l'identifiant d'une mascotte du catalogue ne le remplace pas
 * (l'entrée statique reste, cf. `resolveVisitMascotEntry` côté front où l'extra gagne au rendu).
 *
 * @returns {Promise<Array<{ id: string, label: string, source: 'catalog'|'pack', pack: object|null }>>}
 */
async function listVisitMascotRegistry() {
  const [staticEntries, packs, connues] = await Promise.all([
    listStaticVisitMascots(),
    listPublishedVisitMascotPacks(),
    listVisitMascotPackCatalogIds(),
  ]);

  // **Le repli ne s'applique qu'aux mascottes sans ligne.** Depuis l'étape 3, masquer une
  // mascotte, c'est dépublier sa ligne (`is_published = 0`). Or une livrée dépubliée sort de
  // `listPublishedVisitMascotPacks` : sans ce filtre, le catalogue en code la ramènerait
  // aussitôt, et le geste de masquage n'aurait **aucun effet visible** sur les seize livrées.
  //
  // Le filet de l'étape 2 tient toujours, parce qu'il porte sur un cas différent : une mascotte
  // qui n'a **pas** de ligne du tout — semis pas encore joué, ou en échec — continue d'être
  // servie par le catalogue. Ligne absente : le code parle. Ligne présente : elle seule décide.
  //
  // Si la table est illisible (`null`), on ne filtre rien : mieux vaut proposer une mascotte
  // masquée que vider le sélecteur sur une panne de lecture.
  const repli = connues
    ? staticEntries.filter((entry) => !connues.has(String(entry.id).trim()))
    : staticEntries;
  // **Les packs d'abord.** Depuis que les mascottes livrées sont semées dans
  // `visit_mascot_packs` (`origin = 'builtin'`, cf. `lib/visitMascotBuiltinSeed.js`), la ligne
  // en base est la version **éditable** : c'est elle qui doit gagner. Laisser le catalogue en
  // code passer devant masquerait toute modification faite au studio — un prof éditerait une
  // mascotte livrée sans que rien ne change à l'écran, en silence.
  //
  // Le catalogue reste en second, et c'est le filet : une entrée pas encore semée — semis qui
  // a échoué, base d'une installation qui n'a pas encore redémarré — continue d'être proposée.
  // Un semis raté ne peut donc pas vider le sélecteur, au pire il ne change rien.
  //
  // C'est aussi l'ordre que le client applique déjà (`buildVisitMascotSelectionOptions` :
  // « à identifiant égal, c'est l'entrée du pack qui est retenue ») ; les deux côtés
  // s'accordent enfin.
  return mergeMascotRegistryEntries([
    { source: 'pack', entries: packs },
    {
      source: 'catalog',
      entries: repli.map((entry) => ({ ...entry, pack: null })),
    },
  ]);
}

/**
 * Cette mascotte est-elle **proposée aux visiteurs** ?
 *
 * Remplace la vérification contre `ui.visit.mascot.allowed_ids` : la question ne se pose plus à
 * un réglage mais au registre, qui est la même source que le sélecteur. Les deux ne peuvent donc
 * plus diverger — c'était la panne signalée : une mascotte présente au studio, éditable, et
 * pourtant refusée à la sélection.
 *
 * @param {string} id
 * @returns {Promise<boolean>}
 */
async function isVisitMascotOffered(id) {
  const wanted = String(id || '').trim();
  if (!wanted) return false;
  const registry = await listVisitMascotRegistry();
  // Registre vide = catalogue et table tous deux injoignables. Refuser dans ce cas condamnerait
  // le visiteur pour une panne de lecture : on laisse passer, la résolution au rendu retombera
  // au pire sur la mascotte livrée par défaut.
  if (registry.length === 0) return true;
  return registry.some((entry) => String(entry.id) === wanted);
}

module.exports = {
  listStaticVisitMascots,
  listStaticVisitMascotEntries,
  listPublishedVisitMascotPacks,
  listVisitMascotPackCatalogIds,
  listVisitMascotRegistry,
  isVisitMascotOffered,
  getBuiltinDefaultVisitMascotId,
};
