'use strict';

// =====================================================================
// Magasin de réglages paramétré `{ table, colonnes, registre }` — commun à ForetMap
// (`app_settings`), GL (`gl_settings`) et tout produit à venir.
//
// Cache plat **versionné par écriture** : chaque chargement mémorise la version d'écriture
// globale (`writeVersion()`, cf. `getDataWriteVersion()` de `database.js`, incrémentée par
// tout INSERT/UPDATE/DELETE passé par les helpers) ; dès qu'elle change, le cache est périmé
// — même patron que `lib/visitContentCache.js` et `lib/rbac.js`. Le TTL n'est qu'un
// garde-fou pour les écritures que le compteur ne voit pas (scripts CLI, SQL direct).
//
// Aucune dépendance à `database.js` : `queryAll`/`execute`/`writeVersion` sont injectés,
// ce qui rend le magasin testable sans base.
// =====================================================================

const {
  castValue,
  defaultsOf,
  validateKey,
  metaOf,
  cloneDefault,
  parseStoredJson,
} = require('./settingsRegistryCore');

const DEFAULT_TTL_MS = 15000;
/** Identifiants SQL (table, colonnes) : construits par le code, jamais par le client — on le vérifie quand même. */
const SQL_IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function isNoSuchTableError(error) {
  return !!(error && (error.errno === 1146 || error.code === 'ER_NO_SUCH_TABLE'));
}

function quoteIdentifier(name, label) {
  const s = String(name || '');
  if (!SQL_IDENTIFIER_RE.test(s)) {
    throw new TypeError(`createSettingsStore : ${label} « ${s} » n'est pas un identifiant SQL`);
  }
  return `\`${s}\``;
}

/**
 * @param {object} options
 * @param {string} options.table Table de stockage (`app_settings`, `gl_settings`…).
 * @param {string} [options.keyColumn='key']
 * @param {string} [options.valueColumn='value_json']
 * @param {string|null} [options.updatedAtColumn='updated_at'] `null` si la table n'en a pas.
 * @param {object} options.registry Registre `{ clé: meta }` (cf. `settingsRegistryCore`).
 * @param {() => number} options.writeVersion Version d'écriture globale (invalidation).
 * @param {Function} options.queryAll `(sql, params) => Promise<rows>`
 * @param {Function} options.execute `(sql, params) => Promise<result>`
 * @param {number} [options.ttlMs=15000] Garde-fou de péremption.
 * @param {() => number} [options.now] Horloge (tests).
 * @param {boolean} [options.allowUnknownKeys=false] `upsert` accepte une clé hors registre
 *   (écrite telle quelle, jamais relue par `loadFlat`) — GL stocke aussi des clés libres
 *   (`platform.title`, intro, aide…) dans la même table.
 * @param {Function} [options.onAfterWrite] `({ key, value }) => any` appelé après chaque upsert
 *   (une fois le cache invalidé).
 */
function createSettingsStore({
  table,
  keyColumn = 'key',
  valueColumn = 'value_json',
  updatedAtColumn = 'updated_at',
  registry,
  writeVersion,
  queryAll,
  execute,
  ttlMs = DEFAULT_TTL_MS,
  now = () => Date.now(),
  allowUnknownKeys = false,
  onAfterWrite = null,
} = {}) {
  if (!registry || typeof registry !== 'object') {
    throw new TypeError('createSettingsStore : registry (objet) est requis');
  }
  if (typeof writeVersion !== 'function') {
    throw new TypeError('createSettingsStore : writeVersion (fonction) est requis');
  }
  if (typeof queryAll !== 'function' || typeof execute !== 'function') {
    throw new TypeError('createSettingsStore : queryAll et execute (fonctions) sont requis');
  }
  const qTable = quoteIdentifier(table, 'table');
  const qKey = quoteIdentifier(keyColumn, 'keyColumn');
  const qValue = quoteIdentifier(valueColumn, 'valueColumn');
  const qUpdatedAt =
    updatedAtColumn == null ? null : quoteIdentifier(updatedAtColumn, 'updatedAtColumn');

  const registryKeys = Object.keys(registry);
  // Seules les clés du registre sont lues : la table GL porte aussi des blobs volumineux
  // (intro, aide) que personne ne relit par ici.
  const selectSql = registryKeys.length
    ? `SELECT ${qKey} AS \`key\`, ${qValue} AS value_json FROM ${qTable} WHERE ${qKey} IN (${registryKeys
        .map(() => '?')
        .join(', ')})`
    : null;

  /** @type {{ flat: object, writes: number, loadedAt: number, pinned: boolean } | null} */
  let cache = null;
  /** Chargement en cours partagé : N lectures simultanées sur cache périmé = 1 requête. */
  let inflight = null;

  function isFresh(entry) {
    if (!entry) return false;
    if (now() - entry.loadedAt >= ttlMs) return false;
    // Un snapshot de test est épinglé : seul le TTL (ou un `invalidate()`) le fait tomber.
    if (entry.pinned) return true;
    return entry.writes === writeVersion();
  }

  async function loadFromSource() {
    // Version relevée AVANT la requête : une écriture pendant le SELECT périme l'entrée.
    const writes = writeVersion();
    const flat = defaultsOf(registry);
    let rows = [];
    if (selectSql) {
      try {
        rows = await queryAll(selectSql, registryKeys);
      } catch (error) {
        if (!isNoSuchTableError(error)) throw error;
        rows = [];
      }
    }
    for (const row of rows || []) {
      const key = String(row?.key ?? '');
      const meta = metaOf(registry, key);
      if (!meta) continue;
      try {
        flat[key] = castValue(meta, parseStoredJson(row.value_json));
      } catch (_) {
        // Valeur illisible ou hors bornes : le défaut, jamais une lecture cassée.
        flat[key] = cloneDefault(meta.default);
      }
    }
    Object.freeze(flat);
    cache = { flat, writes, loadedAt: now(), pinned: false };
    return flat;
  }

  /**
   * Objet plat **gelé et partagé** (défauts + lignes castées). À ne jamais muter : c'est
   * l'instance du cache. Utile pour mémoïser des dérivés par identité (cf. `glSettings`).
   */
  async function loadFlatShared() {
    if (isFresh(cache)) return cache.flat;
    if (!inflight) {
      inflight = loadFromSource().finally(() => {
        inflight = null;
      });
    }
    return inflight;
  }

  /** Copie superficielle mutable du plat (contrat historique de `loadFlatSettings`). */
  async function loadFlat() {
    return { ...(await loadFlatShared()) };
  }

  async function get(key, fallback) {
    const flat = await loadFlatShared();
    if (!Object.prototype.hasOwnProperty.call(flat, key)) return fallback;
    return flat[key];
  }

  /**
   * INSERT … ON DUPLICATE KEY UPDATE, puis invalidation explicite du cache.
   * @param {string} key
   * @param {*} value Valeur à persister (sérialisée JSON).
   * @param {object} [options]
   * @param {object} [options.extraColumns] Colonnes supplémentaires `{ nom: valeur }`
   *   paramétrées (ex. `scope`/acteurs pour ForetMap, `updated_by` pour GL).
   * @param {boolean} [options.validate=true] Passer la valeur par `castValue` du registre.
   *   `false` quand l'appelant a déjà normalisé (ForetMap : normalisation asynchrone des
   *   dialogues mascotte ; GL : validateurs de route et cœur de conditionnement).
   * @returns {Promise<*>} La valeur effectivement écrite.
   */
  async function upsert(key, value, { extraColumns = {}, validate = true } = {}) {
    const k = String(key ?? '');
    const meta = metaOf(registry, k);
    if (!meta && !allowUnknownKeys) validateKey(registry, k); // lève « Clé de réglage inconnue »
    const toWrite = validate && meta ? castValue(meta, value) : value;

    const extraNames = Object.keys(extraColumns);
    const quotedExtras = extraNames.map((name) => quoteIdentifier(name, `extraColumns.${name}`));
    const columns = [qKey, qValue, ...quotedExtras];
    const placeholders = ['?', '?', ...extraNames.map(() => '?')];
    const updates = [
      `${qValue} = VALUES(${qValue})`,
      ...quotedExtras.map((q) => `${q} = VALUES(${q})`),
    ];
    if (qUpdatedAt) {
      columns.push(qUpdatedAt);
      placeholders.push('NOW()');
      updates.push(`${qUpdatedAt} = NOW()`);
    }
    const sql = `INSERT INTO ${qTable} (${columns.join(', ')})
     VALUES (${placeholders.join(', ')})
     ON DUPLICATE KEY UPDATE ${updates.join(', ')}`;
    const params = [k, JSON.stringify(toWrite), ...extraNames.map((name) => extraColumns[name])];
    await execute(sql, params);
    invalidate();
    if (typeof onAfterWrite === 'function') await onAfterWrite({ key: k, value: toWrite });
    return toWrite;
  }

  function invalidate() {
    cache = null;
  }

  /**
   * Test helper : injecter un plat (fusionné aux défauts) sans lire la base. Épinglé :
   * insensible à la version d'écriture, seul `ttlMs` (ou `invalidate()`) le périme.
   * `null` retire le snapshot.
   */
  function setCacheForTests(flat, pinnedTtlMs = ttlMs) {
    if (flat == null) {
      cache = null;
      return;
    }
    const merged = Object.freeze({ ...defaultsOf(registry), ...flat });
    // `loadedAt` recalé pour que le TTL demandé s'applique tel quel.
    cache = {
      flat: merged,
      writes: writeVersion(),
      loadedAt: now() - Math.max(0, ttlMs - pinnedTtlMs),
      pinned: true,
    };
  }

  return {
    table,
    registry,
    keys: registryKeys,
    loadFlat,
    loadFlatShared,
    get,
    upsert,
    invalidate,
    setCacheForTests,
    /** Diagnostic : le cache est-il servi tel quel à cet instant ? */
    isCached: () => isFresh(cache),
  };
}

module.exports = {
  DEFAULT_TTL_MS,
  createSettingsStore,
  isNoSuchTableError,
};
