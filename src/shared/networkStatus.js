/**
 * État réseau **de l'appareil** (mode avion, Wi-Fi coupé), partagé par ForetMap et GL.
 *
 * Le navigateur ne sait dire qu'une chose avec certitude : `navigator.onLine === false`
 * signifie qu'aucune interface réseau n'est active. L'inverse (`true`) ne garantit pas que
 * le serveur soit joignable (portail captif, une barre de réseau) : ce cas reste traité
 * par la boucle de réessai habituelle. On ne se fie donc qu'au `false`.
 *
 * Neutre produit : aucune session, aucun jeton, aucune donnée métier.
 */

/** Vrai quand l'appareil se déclare sans réseau. */
export function isDeviceOffline(nav = typeof navigator !== 'undefined' ? navigator : null) {
  return !!nav && nav.onLine === false;
}

/**
 * Abonne `handler(online: boolean)` aux changements d'état réseau de l'appareil.
 * @returns {() => void} désabonnement
 */
export function subscribeNetworkStatus(
  handler,
  win = typeof window !== 'undefined' ? window : null,
) {
  if (!win || typeof win.addEventListener !== 'function') return () => {};
  const onOnline = () => handler(true);
  const onOffline = () => handler(false);
  win.addEventListener('online', onOnline);
  win.addEventListener('offline', onOffline);
  return () => {
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
