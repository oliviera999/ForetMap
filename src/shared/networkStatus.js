/**
 * État réseau **de l'appareil**, partagé par ForetMap et GL.
 *
 * Deux sources, réunies dans `isDeviceOffline()` :
 *   1. `navigator.onLine === false` : aucune interface réseau active (mode avion, Wi-Fi
 *      coupé). L'inverse (`true`) ne garantit rien, d'où la seconde source ;
 *   2. le **réseau inutilisable** (« lie-fi ») : une barre de réseau, un Wi-Fi saturé par
 *      une classe entière, un portail captif. Le navigateur se croit en ligne mais rien ne
 *      passe. On le déduit des requêtes elles-mêmes : après `UNREACHABLE_FAILURE_THRESHOLD`
 *      échecs de transport consécutifs (aucune réponse du serveur, ou copie servie par le
 *      service worker faute de réponse à temps), l'appareil est traité comme hors ligne. Une
 *      sonde légère (`/api/health`) vérifie ensuite à intervalle régulier si le serveur
 *      répond de nouveau ; la moindre réponse HTTP, d'une sonde ou d'une requête ordinaire,
 *      lève l'état.
 *
 * Neutre produit : aucune session, aucun jeton, aucune donnée métier.
 */

/** Échecs de transport consécutifs au-delà desquels le réseau est jugé inutilisable. */
export const UNREACHABLE_FAILURE_THRESHOLD = 3;
/** Intervalle de la sonde de retour tant que le réseau est jugé inutilisable (ms). */
export const REACHABILITY_PROBE_INTERVAL_MS = 15_000;
/** Délai maximal d'une sonde (ms) : au-delà, le serveur reste injoignable. */
export const REACHABILITY_PROBE_TIMEOUT_MS = 5_000;

let consecutiveTransportFailures = 0;
let unreachable = false;
let probeUrl = '/api/health';
let probeTimer = null;
let probeInFlight = false;
/** @type {Set<(online: boolean) => void>} */
const reachabilityListeners = new Set();

/**
 * URL de la sonde de retour (résolue par l'adaptateur produit, ex. `withAppBase`).
 * @param {string} url
 */
export function configureReachabilityProbe(url) {
  if (typeof url === 'string' && url.trim()) probeUrl = url.trim();
}

function notifyReachability(online) {
  for (const listener of [...reachabilityListeners]) {
    try {
      listener(online);
    } catch {
      /* un abonné défaillant ne bloque pas les autres */
    }
  }
}

function stopProbe() {
  if (probeTimer != null) {
    clearInterval(probeTimer);
    probeTimer = null;
  }
}

/** Une sonde : toute réponse HTTP (même 5xx) prouve que le réseau passe. */
export async function probeReachability({ fetchImpl } = {}) {
  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!doFetch || probeInFlight) return false;
  probeInFlight = true;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), REACHABILITY_PROBE_TIMEOUT_MS);
  try {
    await doFetch(probeUrl, {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller?.signal,
    });
    reportTransportSuccess();
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    probeInFlight = false;
  }
}

function startProbe() {
  if (probeTimer != null || typeof setInterval !== 'function') return;
  probeTimer = setInterval(() => {
    void probeReachability();
  }, REACHABILITY_PROBE_INTERVAL_MS);
}

/**
 * Une requête est partie sans obtenir de réponse du serveur (erreur de transport, délai
 * dépassé, copie de secours du service worker).
 */
export function reportTransportFailure() {
  consecutiveTransportFailures += 1;
  if (!unreachable && consecutiveTransportFailures >= UNREACHABLE_FAILURE_THRESHOLD) {
    unreachable = true;
    startProbe();
    notifyReachability(false);
  }
}

/** Le serveur a répondu (n'importe quel statut HTTP) : le réseau passe. */
export function reportTransportSuccess() {
  consecutiveTransportFailures = 0;
  if (unreachable) {
    unreachable = false;
    stopProbe();
    notifyReachability(true);
  }
}

/** Vrai quand le navigateur se croit en ligne mais que le serveur ne répond plus. */
export function isServerUnreachable() {
  return unreachable;
}

/** Remise à zéro — réservé aux tests. */
export function resetReachabilityState() {
  consecutiveTransportFailures = 0;
  unreachable = false;
  probeInFlight = false;
  stopProbe();
  probeUrl = '/api/health';
}

/** Vrai quand l'appareil se déclare sans réseau. */
export function isNavigatorOffline(nav = typeof navigator !== 'undefined' ? navigator : null) {
  return !!nav && nav.onLine === false;
}

/** Vrai quand l'appareil est sans réseau ou que le réseau est inutilisable. */
export function isDeviceOffline(nav = typeof navigator !== 'undefined' ? navigator : null) {
  return isNavigatorOffline(nav) || unreachable;
}

/**
 * État réseau à afficher : `offline` (mode avion), `unreachable` (réseau inutilisable) ou
 * `online`.
 * @returns {'online'|'offline'|'unreachable'}
 */
export function getNetworkMode(nav = typeof navigator !== 'undefined' ? navigator : null) {
  if (isNavigatorOffline(nav)) return 'offline';
  return unreachable ? 'unreachable' : 'online';
}

/**
 * Abonne `handler(online: boolean)` aux changements d'état réseau de l'appareil (interface
 * réseau ET réseau inutilisable).
 * @returns {() => void} désabonnement
 */
export function subscribeNetworkStatus(
  handler,
  win = typeof window !== 'undefined' ? window : null,
) {
  const onReachability = (online) => {
    if (online && isNavigatorOffline()) return;
    handler(online);
  };
  reachabilityListeners.add(onReachability);
  if (!win || typeof win.addEventListener !== 'function') {
    return () => reachabilityListeners.delete(onReachability);
  }
  const onOnline = () => {
    // Nouvelle interface réseau : on retente sans attendre la sonde.
    consecutiveTransportFailures = 0;
    if (unreachable) {
      unreachable = false;
      stopProbe();
    }
    handler(true);
  };
  const onOffline = () => handler(false);
  win.addEventListener('online', onOnline);
  win.addEventListener('offline', onOffline);
  return () => {
    reachabilityListeners.delete(onReachability);
    win.removeEventListener('online', onOnline);
    win.removeEventListener('offline', onOffline);
  };
}

/**
 * Marque une erreur comme « appareil hors ligne » : les appelants (synchronisation,
 * files d'écritures) la distinguent ainsi d'une panne du serveur.
 */
export function markOfflineError(error) {
  if (error && typeof error === 'object') {
    try {
      error.offline = true;
    } catch {
      /* erreur gelée : on la laisse telle quelle */
    }
  }
  return error;
}

/** Vrai si l'erreur a été levée alors que l'appareil était hors ligne. */
export function isOfflineError(error) {
  return !!error && typeof error === 'object' && error.offline === true;
}
