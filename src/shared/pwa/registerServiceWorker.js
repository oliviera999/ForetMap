import {
  safeSessionStorageGetItem,
  safeSessionStorageSetItem,
} from '../platform/browserStorage.js';

/**
 * Enregistrement du service worker et **politique de mise à jour**.
 *
 * Auparavant (inline dans `src/main.jsx`), tout `controllerchange` déclenchait un
 * `window.location.reload()` immédiat. Deux défauts mesurés en exploitation :
 *
 *  1. **Faux positif à la première visite.** Le service worker appelle `clients.claim()`
 *     à son activation (`src/shared/pwa/swTemplate.js`) : sur une page qui n'était pas
 *     encore contrôlée (navigateur neuf, navigation privée, données de site effacées),
 *     cette première prise de contrôle émettait `controllerchange` alors qu'aucune version
 *     n'avait été remplacée — d'où un « Nouvelle version installée » et un rechargement
 *     sortis de nulle part.
 *  2. **Rechargement d'autorité.** Le déploiement automatique (`scripts/auto-deploy-cron.sh`,
 *     toutes les 2 minutes) publie un nouveau `sw.js` à chaque changement de bundle : sur le
 *     rythme de commits observé, 12 à 23 rechargements forcés par jour, chacun capable
 *     d'emporter une saisie en cours.
 *
 * Nouvelle règle : on **annonce** la mise à jour (événement
 * `foretmap_sw_update_available`, rendu en bandeau par `useServiceWorkerUpdate`) et on
 * recharge seulement quand l'utilisateur le demande. Le drapeau `foretmap_sw_updated`
 * survit au rechargement pour que le toast « Nouvelle version installée. » s'affiche
 * ensuite (`useAppStoragePersistence`), comme avant.
 *
 * Seule exception au « jamais d'autorité » : `vite:preloadError`. Le déploiement supprime
 * les anciens bundles hachés, donc un onglet resté ouvert peut échouer à charger un chunk
 * dynamique. À ce stade la page est déjà cassée — recharger est la seule issue, pas une
 * interruption.
 */

/** Drapeau consommé après rechargement pour afficher le toast de mise à jour. */
export const SW_UPDATED_FLAG = 'foretmap_sw_updated';
/** Anti-boucle du filet `vite:preloadError` (horodatage du dernier rechargement forcé). */
export const SW_PRELOAD_RELOAD_FLAG = 'foretmap_sw_preload_reload_at';
/** Événement fenêtre émis quand une version est prête à être appliquée. */
export const SW_UPDATE_AVAILABLE_EVENT = 'foretmap_sw_update_available';
/** Délai minimal entre deux rechargements « chunk manquant » dans le même onglet (ms). */
const PRELOAD_RELOAD_COOLDOWN_MS = 60_000;
/** Filet si le nouveau service worker ne prend pas la main après `SKIP_WAITING` (ms). */
const APPLY_FALLBACK_DELAY_MS = 2000;

/**
 * Mise à jour annoncée mais pas encore appliquée, ou `null`. Mémorisée au niveau du module
 * car l'annonce peut précéder le montage du composant qui affiche le bandeau.
 * @type {{ apply: () => void } | null}
 */
let pendingUpdate = null;

/** Mise à jour en attente d'application, `null` si aucune. */
export function getPendingSwUpdate() {
  return pendingUpdate;
}

/** Remise à zéro de l'état module — réservé aux tests. */
export function resetPendingSwUpdate() {
  pendingUpdate = null;
}

/**
 * Enregistre le service worker et installe la politique de mise à jour.
 *
 * @param {object} params
 * @param {string} params.swUrl URL du service worker (préfixée par `withAppBase`).
 * @param {Navigator} [params.nav] Injection pour les tests.
 * @param {Window} [params.win] Injection pour les tests.
 * @param {Document} [params.doc] Injection pour les tests.
 * @returns {boolean} Vrai si l'enregistrement a été tenté.
 */
export function registerServiceWorker({
  swUrl,
  nav = typeof navigator !== 'undefined' ? navigator : null,
  win = typeof window !== 'undefined' ? window : null,
  doc = typeof document !== 'undefined' ? document : null,
} = {}) {
  if (!nav || !win || !('serviceWorker' in nav)) return false;

  // Capturé AVANT l'enregistrement : faux ⇒ la page n'était pas contrôlée, donc le
  // `controllerchange` à venir sera la prise de contrôle initiale, pas une mise à jour.
  const hadControllerAtStartup = !!nav.serviceWorker.controller;

  let registrationRef = null;
  let applying = false;
  let reloading = false;

  const reloadForUpdate = () => {
    if (reloading) return;
    reloading = true;
    safeSessionStorageSetItem(SW_UPDATED_FLAG, '1');
    win.location.reload();
  };

  /** Applique la mise à jour en attente. Déclenché par l'utilisateur, jamais d'office. */
  const applyUpdate = () => {
    applying = true;
    const waiting = registrationRef?.waiting;
    if (!waiting) {
      // Version déjà active (appliquée par un autre onglet) : un rechargement suffit.
      reloadForUpdate();
      return;
    }
    waiting.postMessage({ type: 'SKIP_WAITING' });
    // Le rechargement suit normalement `controllerchange` ; filet si le navigateur
    // n'émet rien (SW bloqué, message perdu) pour ne pas laisser le bouton sans effet.
    win.setTimeout(reloadForUpdate, APPLY_FALLBACK_DELAY_MS);
  };

  const announceUpdate = (registration) => {
    if (registration) registrationRef = registration;
    if (pendingUpdate) return;
    pendingUpdate = { apply: applyUpdate };
    win.dispatchEvent(new CustomEvent(SW_UPDATE_AVAILABLE_EVENT, { detail: pendingUpdate }));
  };

  nav.serviceWorker.addEventListener('controllerchange', () => {
    // Première prise de contrôle : rien n'a été remplacé (cf. en-tête, point 1).
    if (!hadControllerAtStartup) return;
    if (applying) reloadForUpdate();
    // Un autre onglet vient d'appliquer la mise à jour : on l'annonce sans recharger.
    else announceUpdate(null);
  });

  nav.serviceWorker
    .register(swUrl)
    .then((registration) => {
      registrationRef = registration;
      // Version déjà installée et en attente au chargement de la page.
      if (registration.waiting && nav.serviceWorker.controller) announceUpdate(registration);

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          // `controller` non nul : il y avait bien une version précédente à remplacer.
          if (newWorker.state === 'installed' && nav.serviceWorker.controller) {
            announceUpdate(registration);
          }
        });
      });

      // Vérification d'update au retour au premier plan (inchangé).
      if (doc) {
        doc.addEventListener('visibilitychange', () => {
          if (doc.visibilityState === 'visible') registration.update().catch(() => {});
        });
      }
    })
    .catch(() => {});

  win.addEventListener('vite:preloadError', (event) => {
    // Anti-boucle : si le chunk manque encore après rechargement, mieux vaut laisser
    // l'erreur remonter (ErrorBoundary) que boucler sur `location.reload()`.
    const last = Number(safeSessionStorageGetItem(SW_PRELOAD_RELOAD_FLAG, 0)) || 0;
    if (last && Date.now() - last < PRELOAD_RELOAD_COOLDOWN_MS) return;
    safeSessionStorageSetItem(SW_PRELOAD_RELOAD_FLAG, String(Date.now()));
    if (typeof event?.preventDefault === 'function') event.preventDefault();
    reloadForUpdate();
  });

  return true;
}
