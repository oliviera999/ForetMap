import { useCallback, useEffect, useRef, useState } from 'react';
import {
  OUTBOX_CHANGED_EVENT,
  OUTBOX_KINDS,
  flushOutbox,
  listOutboxEntries,
  outboxFlushToast,
} from '../services/offlineOutbox.js';
import { syncOutboxMirror } from '../services/offlineOutboxMirror.js';
import { isDeviceOffline, subscribeNetworkStatus } from '../shared/networkStatus.js';
import { requestPersistentStorage } from '../shared/platform/storagePersistence.js';
import { OUTBOX_REPLAYED_MESSAGE } from '../utils/offlineDb.js';
import { taskDoneAlreadyClosedMessage } from '../utils/taskDoneQueue.js';

/** Nouvel essai périodique tant que des écritures attendent (ms). */
export const OUTBOX_RETRY_INTERVAL_MS = 60_000;

const closedTaskMessage = (item, response) =>
  taskDoneAlreadyClosedMessage(item?.task_title, response?.already_closed);

/** Écritures que la boîte d'envoi rejoue elle-même (pas les refusées, pas le carnet). */
function hasReplayable(entries) {
  return entries.some((e) => !e.refused && e.kind !== OUTBOX_KINDS.journalDraft);
}

/**
 * Boîte d'envoi hors ligne de la session : rejoue les écritures gardées sur l'appareil quel
 * que soit l'écran ouvert — au montage, au retour du réseau (y compris quand un réseau
 * inutilisable redevient utilisable), au retour sur l'onglet, après un rejeu du service worker
 * et toutes les minutes tant qu'il en reste. Annonce le résultat (un seul message, ici) et
 * tient à jour la copie pour la synchronisation en arrière-plan.
 *
 * @param {object} params
 * @param {string} params.userId compte connecté (vide : rien à faire)
 * @param {boolean} [params.enabled]
 * @param {(message: string) => void} [params.onToast]
 * @param {() => void} [params.onSynced] au moins une écriture est partie (recharger les données)
 * @returns {{ entries: import('../services/offlineOutbox.js').OutboxEntry[],
 *   pendingCount: number, refusedCount: number, refresh: () => void,
 *   flushNow: () => Promise<unknown> }}
 */
export function useOfflineOutbox({ userId, enabled = true, onToast = null, onSynced = null }) {
  const active = !!enabled && !!userId;
  const [entries, setEntries] = useState(() => (active ? listOutboxEntries(userId) : []));
  const onToastRef = useRef(onToast);
  const onSyncedRef = useRef(onSynced);
  const persistRequestedRef = useRef(false);
  useEffect(() => {
    onToastRef.current = onToast;
    onSyncedRef.current = onSynced;
  });

  const refresh = useCallback(() => {
    setEntries(active ? listOutboxEntries(userId) : []);
  }, [active, userId]);

  const flushNow = useCallback(
    () => (active ? flushOutbox({ userId }) : Promise.resolve(null)),
    [active, userId],
  );

  useEffect(() => {
    refresh();
    if (!active || typeof window === 'undefined') return undefined;

    const tryFlush = () => {
      if (isDeviceOffline() || !hasReplayable(listOutboxEntries(userId))) return;
      void flushOutbox({ userId });
    };
    const onChanged = (event) => {
      refresh();
      const detail = event?.detail;
      // Moment utile pour demander le stockage persistant : l'élève vient de confier une
      // écriture à l'appareil (Chrome l'accorde sans question à une application installée).
      if (detail?.reason === 'queued' && !persistRequestedRef.current) {
        persistRequestedRef.current = true;
        void requestPersistentStorage();
      }
      if (detail?.reason === 'flushed' && detail.summary) {
        const message = outboxFlushToast(detail.summary, closedTaskMessage);
        if (message) onToastRef.current?.(message);
        if (detail.summary.synced > 0) onSyncedRef.current?.();
      }
      void syncOutboxMirror({ userId });
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') tryFlush();
    };
    const onSwMessage = (event) => {
      if (event?.data?.type !== OUTBOX_REPLAYED_MESSAGE) return;
      refresh();
      tryFlush();
    };

    window.addEventListener(OUTBOX_CHANGED_EVENT, onChanged);
    const unsubscribeNetwork = subscribeNetworkStatus((online) => {
      if (online) tryFlush();
    });
    document.addEventListener('visibilitychange', onVisible);
    const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : null;
    sw?.addEventListener?.('message', onSwMessage);
    const timer = setInterval(tryFlush, OUTBOX_RETRY_INTERVAL_MS);

    tryFlush();
    void syncOutboxMirror({ userId });

    return () => {
      window.removeEventListener(OUTBOX_CHANGED_EVENT, onChanged);
      unsubscribeNetwork();
      document.removeEventListener('visibilitychange', onVisible);
      sw?.removeEventListener?.('message', onSwMessage);
      clearInterval(timer);
    };
  }, [active, userId, refresh]);

  return {
    entries,
    pendingCount: entries.filter((e) => !e.refused).length,
    refusedCount: entries.filter((e) => e.refused).length,
    refresh,
    flushNow,
  };
}
