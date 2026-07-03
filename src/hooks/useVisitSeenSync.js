import { useCallback, useEffect, useRef, useState } from 'react';
import { api, AccountDeletedError, isLikelyNetworkTransportFailure } from '../services/api';
import {
  applyVisitSeenQueueToSet,
  enqueueVisitSeenAction,
  flushVisitSeenQueue,
  isBrowserOnline,
  loadVisitSeenQueue,
  replaceQueuedVisitSeenAction,
  safeVisitProgressPayload,
} from '../utils/visitProgressClient.js';
import { itemSeenKey } from '../utils/visitMediaGallery.js';

/**
 * Progression « vu » de la visite avec support hors-ligne.
 *
 * Extraction iso-comportement de VisitViewImpl (visit-views.jsx) : la logique pure
 * (file d'attente localStorage, compactage, flush) vit dans utils/visitProgressClient.js ;
 * ce hook n'orchestre que les états React et les effets navigateur (online/offline,
 * visibilitychange, flush après chargement).
 *
 * @param {object} params
 * @param {(() => void)|undefined} params.onForceLogout compte supprimé (401 deleted).
 * @param {boolean} params.loading chargement visite en cours (suspend le flush initial).
 * @param {object|null} params.selected élément sélectionné (zone/repère) pour onToggleSeen.
 * @param {('zone'|'marker')|null} params.selectedType type de l'élément sélectionné.
 * @param {() => void} params.closeVisitSelection ferme le panneau détail (avant célébration).
 * @param {() => void} params.onMascotSeenCelebration réaction mascotte au marquage « vu ».
 * @returns {{
 *   seen: Set<string>,
 *   savingSeen: boolean,
 *   isOnline: boolean,
 *   pendingSyncCount: number,
 *   syncStatus: 'idle'|'pending'|'syncing'|'synced'|'error',
 *   onToggleSeen: () => Promise<void>,
 *   applyServerProgress: (progressBody: unknown) => void,
 *   flushVisitSeenQueueNow: () => Promise<void>,
 * }}
 */
export function useVisitSeenSync({
  onForceLogout,
  loading,
  selected,
  selectedType,
  closeVisitSelection,
  onMascotSeenCelebration,
}) {
  const [seen, setSeen] = useState(new Set());
  const [savingSeen, setSavingSeen] = useState(false);
  const [isOnline, setIsOnline] = useState(() => isBrowserOnline());
  const [pendingSyncCount, setPendingSyncCount] = useState(() => loadVisitSeenQueue().length);
  /** idle | pending | syncing | synced | error */
  const [syncStatus, setSyncStatus] = useState(() =>
    loadVisitSeenQueue().length > 0 ? 'pending' : 'idle',
  );
  const visitSeenFlushInFlightRef = useRef(false);

  /** Applique la progression serveur (corps brut de `/api/visit/progress`) + rejoue la file locale. */
  const applyServerProgress = useCallback((progressBody) => {
    const { seen: progressSeen } = safeVisitProgressPayload(progressBody);
    const nextSeen = applyVisitSeenQueueToSet(
      new Set(progressSeen.map((r) => itemSeenKey(r.target_type, r.target_id))),
    );
    setSeen(nextSeen);
    const queueLen = loadVisitSeenQueue().length;
    setPendingSyncCount(queueLen);
    if (queueLen > 0) setSyncStatus((prev) => (prev === 'syncing' ? prev : 'pending'));
  }, []);

  const flushVisitSeenQueueNow = useCallback(async () => {
    if (!isBrowserOnline() || visitSeenFlushInFlightRef.current) return;
    const queue = loadVisitSeenQueue();
    if (queue.length === 0) {
      setPendingSyncCount(0);
      setSyncStatus('idle');
      return;
    }
    visitSeenFlushInFlightRef.current = true;
    setSyncStatus('syncing');
    try {
      const result = await flushVisitSeenQueue(async (action) => {
        await api('/api/visit/seen', 'POST', action);
      });
      setPendingSyncCount(result.remaining);
      if (result.remaining > 0) {
        setSyncStatus('error');
      } else if (result.synced > 0) {
        setSyncStatus('synced');
      } else {
        setSyncStatus('idle');
      }
    } catch (err) {
      if (err instanceof AccountDeletedError) onForceLogout?.();
      setSyncStatus('error');
    } finally {
      visitSeenFlushInFlightRef.current = false;
    }
  }, [onForceLogout]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onOnline = () => {
      setIsOnline(true);
      void flushVisitSeenQueueNow();
    };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [flushVisitSeenQueueNow]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && isBrowserOnline()) {
        void flushVisitSeenQueueNow();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [flushVisitSeenQueueNow]);

  useEffect(() => {
    if (loading || !isOnline) return;
    if (loadVisitSeenQueue().length > 0) void flushVisitSeenQueueNow();
  }, [loading, isOnline, flushVisitSeenQueueNow]);

  const queueSeenChangeLocally = useCallback((payloadType, payloadId, nextSeen) => {
    const compact = enqueueVisitSeenAction({
      target_type: payloadType,
      target_id: payloadId,
      seen: nextSeen,
    });
    setPendingSyncCount(compact.length);
    setSyncStatus('pending');
  }, []);

  const onToggleSeen = async () => {
    if (!selected || !selectedType) return;
    const key = itemSeenKey(selectedType, selected.id);
    const wasSeen = seen.has(key);
    const payloadType = selectedType;
    const payloadId = selected.id;
    const nextSeen = !wasSeen;

    if (!wasSeen) {
      closeVisitSelection();
      await new Promise((resolve) => {
        if (typeof requestAnimationFrame !== 'function') {
          setTimeout(resolve, 0);
          return;
        }
        requestAnimationFrame(() => {
          requestAnimationFrame(resolve);
        });
      });
    }

    setSeen((prev) => {
      const optimistic = new Set(prev);
      if (wasSeen) optimistic.delete(key);
      else optimistic.add(key);
      return optimistic;
    });

    if (!isBrowserOnline()) {
      queueSeenChangeLocally(payloadType, payloadId, nextSeen);
      if (nextSeen) onMascotSeenCelebration();
      return;
    }

    setSavingSeen(true);
    try {
      await api('/api/visit/seen', 'POST', {
        target_type: payloadType,
        target_id: payloadId,
        seen: nextSeen,
      });
      const compact = replaceQueuedVisitSeenAction({
        target_type: payloadType,
        target_id: payloadId,
        seen: nextSeen,
      });
      setPendingSyncCount(compact.length);
      if (compact.length === 0) setSyncStatus((prev) => (prev === 'syncing' ? prev : 'idle'));
      else setSyncStatus((prev) => (prev === 'syncing' ? prev : 'pending'));
      if (nextSeen) onMascotSeenCelebration();
    } catch (err) {
      if (err instanceof AccountDeletedError) {
        onForceLogout?.();
        return;
      }
      if (isLikelyNetworkTransportFailure(err)) {
        queueSeenChangeLocally(payloadType, payloadId, nextSeen);
        if (nextSeen) onMascotSeenCelebration();
        return;
      }
      alert(err.message || 'Erreur mise à jour');
      setSeen((prev) => {
        const revert = new Set(prev);
        if (wasSeen) revert.add(key);
        else revert.delete(key);
        return revert;
      });
    } finally {
      setSavingSeen(false);
    }
  };

  return {
    seen,
    savingSeen,
    isOnline,
    pendingSyncCount,
    syncStatus,
    onToggleSeen,
    applyServerProgress,
    flushVisitSeenQueueNow,
  };
}
