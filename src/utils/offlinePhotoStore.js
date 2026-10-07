/**
 * Photos prises sans réseau (rapport de tâche, observation d'espèce), gardées dans IndexedDB
 * (`offlineDb.js`) jusqu'à leur envoi. Chaque photo est rangée sous la clé `client_uuid` de
 * l'écriture qu'elle accompagne, et porte le compte de son auteur : sur une tablette partagée,
 * elle n'est envoyée que sous sa session, et la déconnexion l'efface avec les autres données
 * de l'élève (`localDataCleanup.js`).
 *
 * La photo arrive déjà compressée par l'écran (`compressImageWithPreset`, quelques centaines
 * de Ko au plus) ; les bornes ci-dessous protègent l'appareil d'une file qui grossirait sans fin.
 */

import { OFFLINE_DB_STORES, idbDelete, idbGet, idbGetAll, idbPut } from './offlineDb.js';

const STORE = OFFLINE_DB_STORES.photos;
/** Taille maximale d'une photo gardée (data URL, en caractères ≈ octets). */
export const OFFLINE_PHOTO_MAX_CHARS = 2_500_000;
/** Nombre maximal de photos gardées par compte. */
export const OFFLINE_PHOTOS_PER_ACCOUNT_MAX = 20;

const DATA_URL_RE = /^data:image\/(?:jpeg|jpg|png|webp);base64,/i;

/**
 * Garde une photo sur l'appareil.
 * @param {string} key clé `client_uuid` de l'écriture accompagnée
 * @param {{ userId: string, dataUrl: string, kind?: string }} photo
 * @returns {Promise<boolean>} vrai si la photo est gardée — sinon, ne rien promettre à l'élève
 */
export async function putOfflinePhoto(key, { userId, dataUrl, kind = '' }) {
  const k = String(key || '').trim();
  const uid = String(userId ?? '').trim();
  const data = typeof dataUrl === 'string' ? dataUrl : '';
  if (!k || !uid || !DATA_URL_RE.test(data) || data.length > OFFLINE_PHOTO_MAX_CHARS) return false;
  const existing = (await idbGetAll(STORE)).filter((p) => p?.user_id === uid && p.key !== k);
  if (existing.length >= OFFLINE_PHOTOS_PER_ACCOUNT_MAX) return false;
  return idbPut(STORE, {
    key: k,
    user_id: uid,
    kind: String(kind || '').slice(0, 32),
    data_url: data,
    created_at: Date.now(),
  });
}

/** @returns {Promise<string|null>} la photo (data URL), ou `null` si absente */
export async function getOfflinePhoto(key) {
  const entry = await idbGet(STORE, String(key || ''));
  return typeof entry?.data_url === 'string' ? entry.data_url : null;
}

export function deleteOfflinePhoto(key) {
  return idbDelete(STORE, String(key || ''));
}

/**
 * Photos gardées (sans leur contenu), d'un compte ou de tous.
 * @param {string} [userId]
 * @returns {Promise<Array<{ key: string, user_id: string, kind: string, created_at: number, size: number }>>}
 */
export async function listOfflinePhotos(userId) {
  const uid = userId == null ? null : String(userId).trim();
  return (await idbGetAll(STORE))
    .filter((p) => p && (uid == null || p.user_id === uid))
    .map((p) => ({
      key: p.key,
      user_id: p.user_id,
      kind: p.kind || '',
      created_at: Number(p.created_at) || 0,
      size: typeof p.data_url === 'string' ? p.data_url.length : 0,
    }));
}

/** Efface les photos d'un compte (déconnexion sur une tablette partagée). */
export async function clearOfflinePhotosForUser(userId) {
  const uid = String(userId ?? '').trim();
  if (!uid) return 0;
  let removed = 0;
  for (const p of await listOfflinePhotos(uid)) {
    if (await deleteOfflinePhoto(p.key)) removed += 1;
  }
  return removed;
}

/**
 * Retire les photos qui n'accompagnent plus aucune écriture en attente (envoyée, refusée sans
 * texte à garder, effacée par l'élève).
 * @param {Set<string>} liveKeys clés `client_uuid` encore présentes dans les files
 */
export async function pruneOrphanOfflinePhotos(liveKeys) {
  const keep = liveKeys instanceof Set ? liveKeys : new Set();
  let removed = 0;
  for (const p of await listOfflinePhotos()) {
    if (!keep.has(p.key) && (await deleteOfflinePhoto(p.key))) removed += 1;
  }
  return removed;
}
