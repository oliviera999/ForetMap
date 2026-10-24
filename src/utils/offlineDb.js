/**
 * Base IndexedDB des données hors ligne volumineuses (photos gardées sans réseau) et de la
 * copie des écritures en attente que le service worker rejoue en arrière-plan.
 *
 * Pourquoi IndexedDB et pas le stockage local : le stockage local est limité à ~5 Mo pour
 * tout le site, synchrone (il bloque l'écran pendant l'écriture) et ne se lit pas depuis le
 * service worker. Une photo compressée pèse 100 à 300 Ko : quelques-unes suffisaient à le
 * saturer. Les files de textes (rapports, observations, carnet), petites et bornées, restent
 * dans le stockage local, lu de façon synchrone par les écrans.
 *
 * Mêmes nom, version et magasins que le service worker (`src/shared/pwa/swTemplate.js`,
 * vérifié par `tests/pwa-sw-template.test.js`). Meilleur effort : sans IndexedDB (navigation
 * privée de certains navigateurs), chaque fonction échoue proprement (`null`, `false`, `[]`).
 */

export const OFFLINE_DB_NAME = 'foretmap-offline';
export const OFFLINE_DB_VERSION = 1;
export const OFFLINE_DB_STORES = Object.freeze({ photos: 'photos', outbox: 'outbox' });
/** Étiquette de la synchronisation en arrière-plan demandée au navigateur. */
export const OUTBOX_SYNC_TAG = 'foretmap-outbox';
/** Message posté par le service worker aux pages après un rejeu en arrière-plan. */
export const OUTBOX_REPLAYED_MESSAGE = 'FORETMAP_OUTBOX_REPLAYED';

let dbPromise = null;

function idbFactory() {
  return typeof indexedDB !== 'undefined' ? indexedDB : null;
}

/** IndexedDB disponible sur cet appareil. */
export function isOfflineDbAvailable() {
  return !!idbFactory();
}

/** @returns {Promise<IDBDatabase|null>} */
export function openOfflineDb() {
  const factory = idbFactory();
  if (!factory) return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    let req;
    try {
      req = factory.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(OFFLINE_DB_STORES.photos)) {
        db.createObjectStore(OFFLINE_DB_STORES.photos, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(OFFLINE_DB_STORES.outbox)) {
        db.createObjectStore(OFFLINE_DB_STORES.outbox, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // Une autre version (nouvel onglet après mise à jour) demande la main : on la rend.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  }).then((db) => {
    if (!db) dbPromise = null;
    return db;
  });
  return dbPromise;
}

/** Ferme la base et oublie la connexion — réservé aux tests. */
export async function resetOfflineDbForTests() {
  const pending = dbPromise;
  dbPromise = null;
  const db = pending ? await pending : null;
  db?.close();
}

function requestToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(storeName, mode, fn, fallback) {
  const db = await openOfflineDb();
  if (!db) return fallback;
  try {
    const tx = db.transaction(storeName, mode);
    const done = new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction annulée'));
    });
    const result = await fn(tx.objectStore(storeName));
    // Une écriture n'est acquise qu'une fois la transaction validée (quota dépassé…).
    if (mode === 'readwrite') await done;
    else done.catch(() => {});
    return result;
  } catch {
    return fallback;
  }
}

/** @returns {Promise<any|null>} */
export function idbGet(storeName, key) {
  return withStore(storeName, 'readonly', (store) => requestToPromise(store.get(key)), null).then(
    (value) => value ?? null,
  );
}

/** @returns {Promise<any[]>} */
export function idbGetAll(storeName) {
  return withStore(storeName, 'readonly', (store) => requestToPromise(store.getAll()), []).then(
    (list) => (Array.isArray(list) ? list : []),
  );
}

/** @returns {Promise<boolean>} vrai si la valeur est écrite (quota, base indisponible…) */
export function idbPut(storeName, value) {
  return withStore(
    storeName,
    'readwrite',
    async (store) => {
      await requestToPromise(store.put(value));
      return true;
    },
    false,
  );
}

/** @returns {Promise<boolean>} */
export function idbDelete(storeName, key) {
  return withStore(
    storeName,
    'readwrite',
    async (store) => {
      await requestToPromise(store.delete(key));
      return true;
    },
    false,
  );
}

/**
 * Remplace tout le contenu d'un magasin en une transaction.
 * @returns {Promise<boolean>}
 */
export function idbReplaceAll(storeName, values) {
  return withStore(
    storeName,
    'readwrite',
    async (store) => {
      await requestToPromise(store.clear());
      for (const value of Array.isArray(values) ? values : []) store.put(value);
      return true;
    },
    false,
  );
}
