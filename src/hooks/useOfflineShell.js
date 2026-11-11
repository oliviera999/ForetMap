import { useCallback, useEffect, useRef, useState } from 'react';
import { getAuthUserId } from '../services/api';
import { prepareFieldTrip } from '../services/fieldTripPrep.js';
import { useOfflineOutbox } from './useOfflineOutbox.js';
import { useServiceWorkerUpdate } from './useServiceWorkerUpdate';
import { useDeviceOnline } from '../shared/hooks/useDeviceOnline.js';
import { useNetworkMode } from '../shared/hooks/useNetworkMode.js';

/**
 * Connectivité et hors ligne du shell `App` — extrait tel quel d'`App.jsx` (lot 6) :
 * mise à jour de l'application prête (service worker), état réseau de l'appareil, boîte
 * d'envoi hors ligne (rejouée quel que soit l'écran ouvert), centre hors ligne et
 * préparation d'une sortie terrain.
 *
 * Ordre des effets conservé : `useServiceWorkerUpdate` → `useDeviceOnline` →
 * `useNetworkMode` → `useOfflineOutbox` → copie des données pour la sortie terrain.
 *
 * @param {object} params
 * @param {boolean} params.hasAuthenticatedShell Session établie (boîte d'envoi active).
 * @param {(msg: string) => void} params.setToast Toast du shell.
 * @param {() => Promise<void>} params.fetchAll Rechargement après synchronisation.
 * @param {() => Promise<void>} params.fetchAllFull Rechargement complet (sortie terrain).
 * @param {object} params.data `{ maps, zones, markers, plants, tutorials, activeMapId }`.
 */
export function useOfflineShell({ hasAuthenticatedShell, setToast, fetchAll, fetchAllFull, data }) {
  // Mise à jour de l'app prête à être appliquée : proposée en bandeau, jamais imposée.
  const swUpdate = useServiceWorkerUpdate();
  const deviceOnline = useDeviceOnline();
  const networkMode = useNetworkMode();

  // Boîte d'envoi hors ligne : rejouée quel que soit l'écran ouvert, messages centralisés.
  const outboxUserId = hasAuthenticatedShell ? getAuthUserId() : '';
  const offlineOutbox = useOfflineOutbox({
    userId: outboxUserId,
    enabled: hasAuthenticatedShell,
    onToast: setToast,
    onSynced: fetchAll,
  });
  const [offlineCenterOpen, setOfflineCenterOpen] = useState(false);
  const fieldTripDataRef = useRef({});
  useEffect(() => {
    fieldTripDataRef.current = data;
  });
  const prepareFieldTripNow = useCallback(
    (onProgress) =>
      prepareFieldTrip({
        refreshAll: fetchAllFull,
        getData: () => fieldTripDataRef.current,
        onProgress,
      }),
    [fetchAllFull],
  );

  return {
    // Résumé pour la pastille de l'en-tête (objet recréé à chaque rendu, comme avant le lot 6).
    headerOfflineCenter: hasAuthenticatedShell
      ? {
          pendingCount: offlineOutbox.pendingCount,
          refusedCount: offlineOutbox.refusedCount,
          networkMode,
          onOpen: () => setOfflineCenterOpen(true),
        }
      : null,
    swUpdate,
    deviceOnline,
    networkMode,
    offlineOutbox,
    offlineCenterOpen,
    setOfflineCenterOpen,
    prepareFieldTripNow,
  };
}
