'use strict';

/**
 * Mode « ressources externes » de la CSP (`privacy.external_assets_mode`), servi sans jamais
 * attendre une base qui ne répond plus.
 *
 * Audit ForetMap du 19/11/2026 (S4) : le middleware CSP de `server.js` attendait la lecture
 * SQL du réglage (cache périmé) avant `next()`. Monté avant les statiques et `/api/health`,
 * il bloquait **toutes** les réponses dès que la base ne répondait plus — sondes « sans BDD »
 * comprises.
 *
 * `resolve()` lance la lecture (une seule à la fois) et l'attend au plus `waitMs` : dans le cas
 * courant, le réglage sort du cache mémoire de `lib/settings.js` en quelques microtâches, et un
 * changement de réglage s'applique dès la requête suivante (ce cache est invalidé à
 * l'écriture). Si la lecture tarde (base injoignable, pool saturé), la dernière valeur connue
 * est servie — `local`, la plus stricte, tant qu'aucune lecture n'a abouti — et la lecture se
 * termine en arrière-plan. Une lecture qui pend est abandonnée après `readTimeoutMs`, pour ne
 * pas bloquer les suivantes.
 */

const DEFAULT_WAIT_MS = 50;
const DEFAULT_READ_TIMEOUT_MS = 5000;

/**
 * @param {object} opts
 * @param {() => Promise<string>} opts.readMode lecture du réglage (peut rejeter ou pendre)
 * @param {() => boolean} [opts.isReady] la base applicative est-elle prête ?
 * @param {number} [opts.waitMs] attente maximale d'une lecture par requête
 * @param {number} [opts.readTimeoutMs] délai après lequel une lecture qui pend est abandonnée
 * @param {(err: unknown) => void} [opts.onError]
 */
function createCspAssetsModeCache({
  readMode,
  isReady = () => true,
  waitMs = DEFAULT_WAIT_MS,
  readTimeoutMs = DEFAULT_READ_TIMEOUT_MS,
  onError = () => {},
} = {}) {
  let current = 'local';
  let inflight = null;

  function timer(ms, onFire) {
    let handle = null;
    const promise = new Promise((resolve) => {
      handle = setTimeout(() => resolve(onFire()), ms);
      if (typeof handle.unref === 'function') handle.unref();
    });
    return { promise, cancel: () => clearTimeout(handle) };
  }

  /** Lance une lecture si aucune n'est en cours ; rend la promesse de la lecture en cours. */
  function refresh() {
    if (inflight) return inflight;
    if (!isReady()) return Promise.resolve(current);
    let abandonHandle = null;
    const abandon = new Promise((_, reject) => {
      abandonHandle = setTimeout(
        () => reject(new Error('lecture du mode CSP trop lente')),
        readTimeoutMs,
      );
      if (typeof abandonHandle.unref === 'function') abandonHandle.unref();
    });
    inflight = Promise.race([Promise.resolve().then(readMode), abandon])
      .then((mode) => {
        current = mode === 'external' ? 'external' : 'local';
        return current;
      })
      .catch((err) => {
        onError(err);
        return current;
      })
      .finally(() => {
        clearTimeout(abandonHandle);
        inflight = null;
      });
    return inflight;
  }

  /**
   * Mode à appliquer à la requête : la lecture fraîche si elle aboutit en moins de `waitMs`,
   * sinon la dernière valeur connue. Ne rejette jamais.
   * @returns {Promise<'local'|'external'>}
   */
  async function resolve() {
    const reading = refresh();
    const deadline = timer(waitMs, () => current);
    try {
      return await Promise.race([reading, deadline.promise]);
    } finally {
      deadline.cancel();
    }
  }

  /** Dernière valeur connue, sans lecture. */
  function peek() {
    return current;
  }

  return { resolve, refresh, peek };
}

module.exports = { createCspAssetsModeCache, DEFAULT_WAIT_MS, DEFAULT_READ_TIMEOUT_MS };
