/**
 * Fabrique de files hors ligne « par compte » pour les écritures élèves (piste D, audit du
 * 25/09/2026, § 1.4.6 et § 2.4). Même patron que `plantObservationQueue.js` (« Espèce
 * observée ») : file dans le stockage local, bornée, propre à chaque compte, rejouée au
 * retour du réseau ; chaque écriture porte une clé d'idempotence (`client_uuid`) que le
 * serveur ne compte qu'une fois.
 *
 * Règles de rejeu, communes à toutes les files :
 *   - succès (ou réponse rejouée par le serveur) → l'écriture sort de la file ;
 *   - refus définitif (4xx hors 401, 408, 429) → elle sort (`drop`) ou reste marquée en échec
 *     (`keep`, pour un texte que l'élève a écrit et qu'on ne jette pas) ;
 *   - réseau absent, 5xx, 401 (session à rouvrir), 408, 429 → elle reste, et le rejeu s'arrête :
 *     inutile d'insister sur les suivantes.
 * Sur une tablette partagée, une écriture n'est jamais rejouée sous la session d'un autre
 * compte : elle attend que son auteur se reconnecte.
 */

import {
  safeLocalStorageReadJson,
  safeLocalStorageWriteJson,
} from '../shared/platform/browserStorage.js';

/** Format accepté par le serveur (migrations 296 et 299). */
export const CLIENT_UUID_RE = /^[A-Za-z0-9-]{8,64}$/;

/** Statuts qui ne condamnent pas l'écriture : session à rouvrir, délai, limite de débit. */
export const RETRYABLE_CLIENT_STATUSES = new Set([401, 408, 429]);

/** Clé d'idempotence d'une écriture (UUID v4 si le navigateur le permet). */
export function newClientUuid(prefix = 'op') {
  const c = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const rand = () => Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand()}-${rand()}`;
}

/** Refus définitif du serveur (l'écriture ne passera jamais telle quelle). */
export function isDefinitiveRefusal(err) {
  const status = Number(err?.status);
  return status >= 400 && status < 500 && !RETRYABLE_CLIENT_STATUSES.has(status);
}

/**
 * @template {{ user_id: string, client_uuid: string }} T
 * @param {object} options
 * @param {string} options.storageKey clé du stockage local
 * @param {number} options.max borne de la file (les plus anciennes sortent au-delà)
 * @param {(raw: unknown) => T|null} options.normalize valide et normalise une entrée
 *   (`user_id` et `client_uuid` sont vérifiés en plus par la fabrique)
 */
export function createOfflineQueue({ storageKey, max, normalize }) {
  const check = (raw) => {
    const item = normalize(raw);
    if (!item) return null;
    const userId = String(item.user_id ?? '').trim();
    if (!userId || userId.length > 64) return null;
    if (!CLIENT_UUID_RE.test(String(item.client_uuid || ''))) return null;
    return { ...item, user_id: userId };
  };

  /** @returns {T[]} */
  function load() {
    const raw = safeLocalStorageReadJson(storageKey, []);
    if (!Array.isArray(raw)) return [];
    return raw.map(check).filter(Boolean);
  }

  /** @returns {boolean} vrai si la file a bien été écrite (quota, navigation privée…) */
  function save(queue) {
    return safeLocalStorageWriteJson(storageKey, (Array.isArray(queue) ? queue : []).slice(-max));
  }

  /** Écritures d'un compte, dans l'ordre d'arrivée. */
  function listFor(userId) {
    const uid = String(userId ?? '').trim();
    return uid ? load().filter((q) => q.user_id === uid) : [];
  }

  /**
   * Ajoute une écriture (sans doublon de clé).
   * @returns {boolean} vrai si elle est gardée sur l'appareil — sinon, ne rien promettre à l'élève
   */
  function enqueue(item) {
    const normalized = check({ ...item, queued_at: Date.now() });
    if (!normalized) return false;
    const queue = load();
    if (queue.some((q) => q.client_uuid === normalized.client_uuid)) return true;
    if (!save([...queue, normalized])) return false;
    return load().some((q) => q.client_uuid === normalized.client_uuid);
  }

  /** Met à jour une écriture en file ; renvoie l'entrée modifiée, ou `null`. */
  function update(clientUuid, patch) {
    let updated = null;
    const next = load().map((q) => {
      if (q.client_uuid !== clientUuid) return q;
      updated = check({ ...q, ...patch, client_uuid: q.client_uuid, user_id: q.user_id });
      return updated || q;
    });
    if (!updated || !save(next)) return null;
    return updated;
  }

  function remove(clientUuid) {
    save(load().filter((q) => q.client_uuid !== clientUuid));
  }

  let flushInFlight = null;
  let flushAgain = null;

  /**
   * Rejoue les écritures **du compte connecté**, une à la fois, dans l'ordre. Un seul rejeu à
   * la fois dans la page, même si plusieurs écrans le demandent : une demande qui arrive
   * pendant un rejeu en programme **un** autre, juste après — le retour du réseau peut
   * survenir pendant un essai qui échoue encore, et ne doit pas être perdu.
   *
   * @param {(item: T) => Promise<unknown>} send envoi d'une écriture (lève en cas d'échec)
   * @param {string|null|undefined} userId compte connecté ; aucun rejeu sans compte
   * @param {object} [options]
   * @param {'drop'|'keep'} [options.onRefusal='drop'] sort d'une écriture refusée définitivement ;
   *   `keep` la garde avec `refused: true` et le message du serveur (`error`)
   * @param {(item: T) => boolean} [options.eligible] filtre des écritures à rejouer maintenant
   * @returns {Promise<{ synced: number, dropped: number, refused: Array<{ item: T, message: string }>, remaining: number }>}
   */
  function flush(send, userId, { onRefusal = 'drop', eligible = () => true } = {}) {
    const uid = String(userId ?? '').trim();
    if (!uid) return Promise.resolve({ synced: 0, dropped: 0, refused: [], remaining: 0 });
    if (flushInFlight) {
      if (!flushAgain) {
        flushAgain = flushInFlight.then(() => {
          flushAgain = null;
          return flush(send, userId, { onRefusal, eligible });
        });
      }
      return flushAgain;
    }
    flushInFlight = (async () => {
      let synced = 0;
      let dropped = 0;
      const refused = [];
      for (const item of listFor(uid).filter((q) => !q.refused && eligible(q))) {
        try {
          await send(item);
          synced += 1;
          remove(item.client_uuid);
        } catch (err) {
          if (!isDefinitiveRefusal(err)) break; // réseau toujours absent ou serveur en difficulté
          const message = String(err?.message || 'Refusé par le serveur');
          refused.push({ item, message });
          if (onRefusal === 'keep') {
            update(item.client_uuid, { refused: true, error: message });
          } else {
            dropped += 1;
            remove(item.client_uuid);
          }
        }
      }
      return { synced, dropped, refused, remaining: listFor(uid).length };
    })().finally(() => {
      flushInFlight = null;
    });
    return flushInFlight;
  }

  return { storageKey, max, load, save, listFor, enqueue, update, remove, flush };
}
