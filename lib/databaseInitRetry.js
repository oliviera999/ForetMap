'use strict';

/**
 * Reprise automatique de l'initialisation base de données au démarrage.
 *
 * Pourquoi : `initDatabase()` échouait au boot → l'erreur était seulement journalisée et
 * `applicationDatabaseReady` restait faux **définitivement**. Le process, lui, vivait :
 * `/api/health` répondait `200` (donc le keepalive crontab entretenait un zombie), tandis
 * que tout `/api/*` renvoyait `503 SERVICE_NOT_READY` — code que le client considère comme
 * une réponse « passerelle » et réessaie 8 fois par requête. Résultat côté utilisateur :
 * « reconnexion en cours… » en boucle, sans fin, jusqu'à un redémarrage manuel. Et comme
 * le process ne meurt jamais, le journal de cycle de vie ne voit rien : `prod:uptime-report`
 * rend le verdict `stable` et oriente vers le réseau ou le navigateur.
 *
 * Or la cause la plus fréquente est transitoire sur mutualisé : MySQL momentanément
 * injoignable au moment précis du démarrage (plafond `max_user_connections`, redémarrage
 * hébergeur, pic de charge). Elle doit être rattrapée, pas subie : on réessaie donc
 * indéfiniment, avec un backoff plafonné à une minute (une tentative par minute coûte
 * moins qu'une demi-journée d'indisponibilité).
 *
 * Ce module ne connaît ni Express ni le pool MySQL : `initDatabase`, l'ordonnanceur et les
 * rappels de journalisation sont injectés, ce qui le rend testable sans base ni minuteur réel.
 */

/** Backoff : rapide au début (panne transitoire), puis une tentative par minute. */
const DEFAULT_RETRY_DELAYS_MS = [2000, 5000, 10000, 20000, 30000, 60000];

/** Délai avant la tentative suivante, en fonction du nombre de tentatives déjà échouées. */
function retryDelayMs(failedAttempts, delays = DEFAULT_RETRY_DELAYS_MS) {
  const list = Array.isArray(delays) && delays.length > 0 ? delays : DEFAULT_RETRY_DELAYS_MS;
  const index = Math.max(0, failedAttempts - 1);
  return list[Math.min(index, list.length - 1)];
}

/** Minuteur par défaut : `unref` pour ne jamais retenir le process (arrêt, tests). */
function defaultSchedule(fn, ms) {
  const timer = setTimeout(fn, ms);
  if (timer && typeof timer.unref === 'function') timer.unref();
  return timer;
}

/** Un rappel de journalisation qui lève ne doit jamais interrompre la boucle de reprise. */
function safeCall(fn, payload) {
  if (typeof fn !== 'function') return;
  try {
    fn(payload);
  } catch (_) {
    // Journalisation best-effort.
  }
}

function errorMessage(err) {
  try {
    return String(err instanceof Error ? err.message : err).slice(0, 300);
  } catch (_) {
    return 'unknown';
  }
}

/**
 * Crée la boucle de reprise de `initDatabase()`.
 *
 * @param {object} options
 * @param {() => Promise<unknown>} options.initDatabase Initialisation à (re)tenter.
 * @param {number[]} [options.delays] Backoff en ms (dernière valeur répétée indéfiniment).
 * @param {(fn: () => void, ms: number) => unknown} [options.schedule] Ordonnanceur (tests).
 * @param {(ctx: { attempts: number, error: Error, nextRetryMs: number }) => void} [options.onAttemptFailed]
 * @param {(ctx: { attempts: number }) => void} [options.onReady]
 * @param {() => boolean} [options.shouldStop] Vrai pour abandonner (arrêt du process en cours).
 * @returns {{ start: () => Promise<boolean>, getState: () => object }}
 */
function createDatabaseInitRetry(options = {}) {
  const {
    initDatabase,
    delays = DEFAULT_RETRY_DELAYS_MS,
    schedule = defaultSchedule,
    onAttemptFailed,
    onReady,
    shouldStop = () => false,
  } = options;

  if (typeof initDatabase !== 'function') {
    throw new TypeError('createDatabaseInitRetry : initDatabase (fonction) est requis');
  }

  const state = {
    ready: false,
    attempts: 0,
    lastError: null,
    lastAttemptAt: null,
    /** Délai avant la prochaine tentative ; `null` quand il n'y en a plus (prêt ou abandonné). */
    nextRetryMs: null,
    stopped: false,
  };
  let startPromise = null;

  function stop(resolve) {
    state.stopped = true;
    state.nextRetryMs = null;
    resolve(false);
  }

  async function attempt(resolve) {
    if (shouldStop()) return stop(resolve);
    state.attempts += 1;
    state.lastAttemptAt = new Date().toISOString();
    try {
      await initDatabase();
    } catch (err) {
      state.lastError = errorMessage(err);
      if (shouldStop()) return stop(resolve);
      const waitMs = retryDelayMs(state.attempts, delays);
      state.nextRetryMs = waitMs;
      safeCall(onAttemptFailed, { attempts: state.attempts, error: err, nextRetryMs: waitMs });
      schedule(() => {
        void attempt(resolve);
      }, waitMs);
      return undefined;
    }
    state.ready = true;
    state.lastError = null;
    state.nextRetryMs = null;
    safeCall(onReady, { attempts: state.attempts });
    resolve(true);
    return undefined;
  }

  return {
    /** Lance la boucle (idempotent) ; résout `true` dès que la base est prête, `false` si abandon. */
    start() {
      if (!startPromise) {
        startPromise = new Promise((resolve) => {
          void attempt(resolve);
        });
      }
      return startPromise;
    },
    /** Instantané pour `GET /api/admin/diagnostics` (champ `databaseInit`). */
    getState() {
      return { ...state };
    },
  };
}

module.exports = {
  DEFAULT_RETRY_DELAYS_MS,
  retryDelayMs,
  createDatabaseInitRetry,
};
