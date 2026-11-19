'use strict';

/**
 * Mode « ressources externes » de la CSP (`privacy.external_assets_mode`), servi sans jamais
 * attendre la base.
 *
 * Audit ForetMap du 19/11/2026 (S4) : le middleware CSP de `server.js` attendait la lecture
 * SQL du réglage (cache périmé) avant `next()`. Monté avant les statiques et `/api/health`,
 * il bloquait **toutes** les réponses dès que la base ne répondait plus — sondes « sans BDD »
 * comprises. Ici, `get()` rend immédiatement la dernière valeur connue (`local` tant qu'aucune
 * lecture n'a abouti : la politique la plus stricte) et déclenche, si elle est périmée, un
 * rafraîchissement en arrière-plan, un seul à la fois.
 */

const DEFAULT_REFRESH_MS = 15000;
const DEFAULT_READ_TIMEOUT_MS = 5000;

/**
 * @param {object} opts
 * @param {() => Promise<string>} opts.readMode lecture du réglage (peut rejeter ou pendre)
 * @param {() => boolean} [opts.isReady] la base applicative est-elle prête ?
 * @param {number} [opts.refreshMs] âge au-delà duquel la valeur est relue
 * @param {number} [opts.readTimeoutMs] délai après lequel une lecture qui pend est abandonnée
 *   (sinon elle bloquerait tous les rafraîchissements suivants)
 * @param {() => number} [opts.now]
 * @param {(err: unknown) => void} [opts.onError]
 */
function createCspAssetsModeCache({
  readMode,
  isReady = () => true,
  refreshMs = DEFAULT_REFRESH_MS,
  readTimeoutMs = DEFAULT_READ_TIMEOUT_MS,
  now = () => Date.now(),
  onError = () => {},
} = {}) {
  let current = 'local';
  let fetchedAt = null;
  let inflight = null;

  function refresh() {
    if (inflight) return inflight;
    if (!isReady()) return Promise.resolve(current);
    let timer = null;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('lecture du mode CSP trop lente')), readTimeoutMs);
      if (typeof timer.unref === 'function') timer.unref();
    });
    inflight = Promise.race([Promise.resolve().then(readMode), timeout])
      .then((mode) => {
        current = mode === 'external' ? 'external' : 'local';
        fetchedAt = now();
        return current;
      })
      .catch((err) => {
        onError(err);
        return current;
      })
      .finally(() => {
        clearTimeout(timer);
        inflight = null;
      });
    return inflight;
  }

  /** Valeur immédiate (jamais de promesse) ; relance une lecture si elle est périmée. */
  function get() {
    if (fetchedAt === null || now() - fetchedAt >= refreshMs) void refresh();
    return current;
  }

  return { get, refresh };
}

module.exports = { createCspAssetsModeCache, DEFAULT_REFRESH_MS, DEFAULT_READ_TIMEOUT_MS };
