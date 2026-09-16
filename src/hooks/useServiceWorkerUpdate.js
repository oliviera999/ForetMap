import { useEffect, useState } from 'react';
import {
  getPendingSwUpdate,
  SW_UPDATE_AVAILABLE_EVENT,
} from '../shared/pwa/registerServiceWorker.js';

/**
 * Mise à jour de l'app annoncée par le service worker, en attente d'application.
 *
 * Retourne `null` tant qu'aucune version n'attend, sinon `{ apply }` — `apply()` recharge
 * la page sur la nouvelle version. Le rechargement n'a lieu que sur cet appel : la
 * politique « annoncer, ne pas imposer » est décrite dans
 * `src/shared/pwa/registerServiceWorker.js`.
 *
 * @returns {{ apply: () => void } | null}
 */
export function useServiceWorkerUpdate() {
  // L'annonce peut précéder le montage (registration résolue avant le premier effet) :
  // l'initialiseur relit l'état module plutôt que d'attendre un événement déjà passé.
  const [update, setUpdate] = useState(getPendingSwUpdate);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onAvailable = (event) => setUpdate(event?.detail || getPendingSwUpdate());
    window.addEventListener(SW_UPDATE_AVAILABLE_EVENT, onAvailable);
    // Course montage / annonce : rattrape une annonce survenue entre le rendu et l'effet.
    const pending = getPendingSwUpdate();
    if (pending) setUpdate(pending);
    return () => window.removeEventListener(SW_UPDATE_AVAILABLE_EVENT, onAvailable);
  }, []);

  return update;
}
