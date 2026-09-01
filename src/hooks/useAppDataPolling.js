import { useEffect, useMemo, useRef } from 'react';
import { POLLING_COARSE_TABS } from '../constants/app-runtime';

/** Intervalle plancher quand le temps réel Socket.IO est actif (filet REST si un événement a été manqué). */
export const LIVE_MIN_INTERVAL_MS = 90000;
/** Intervalle plancher quand l'onglet navigateur est en arrière-plan. */
const BACKGROUND_MIN_INTERVAL_MS = 120000;

/**
 * Cadence du rafraîchissement automatique des données, extraite de `src/App.jsx` :
 * intervalle adaptatif (temps réel, onglet en arrière-plan, onglets « calmes ») et
 * refetch unique en quittant un onglet secondaire.
 *
 * @param {object} params
 * @param {() => unknown} params.fetchAll Rechargement complet des données.
 * @param {string} params.tab Onglet courant.
 * @param {string} params.rtStatus État Socket.IO (`live` = push actif).
 * @param {number} params.refreshMs Intervalle nominal courant (allongé si serveur indisponible).
 * @param {boolean} params.isTabVisible Onglet navigateur au premier plan.
 * @param {{ current: boolean }} params.pauseRef Pause du rafraîchissement (modales de tâches).
 */
export function useAppDataPolling({ fetchAll, tab, rtStatus, refreshMs, isTabVisible, pauseRef }) {
  const prevTabRef = useRef(tab);

  // Auto-refresh adaptatif (ralenti quand le push est actif, ralenti en arrière-plan).
  const pollingIntervalMs = useMemo(() => {
    const coarse = POLLING_COARSE_TABS.has(tab) ? 2 : 1;
    const liveAdjusted =
      rtStatus === 'live' ? Math.max(refreshMs, LIVE_MIN_INTERVAL_MS) : refreshMs * coarse;
    return isTabVisible ? liveAdjusted : Math.max(liveAdjusted, BACKGROUND_MIN_INTERVAL_MS);
  }, [isTabVisible, refreshMs, rtStatus, tab]);

  useEffect(() => {
    const id = setInterval(() => {
      if (pauseRef.current) return;
      if (document.visibilityState === 'hidden') return;
      fetchAll();
    }, pollingIntervalMs);
    return () => clearInterval(id);
  }, [fetchAll, pollingIntervalMs, pauseRef]);

  /** En quittant un onglet « secondaire », on refetch une fois pour éviter des données trop vieilles à l’arrivée sur carte / tâches / visite. */
  useEffect(() => {
    const prev = prevTabRef.current;
    prevTabRef.current = tab;
    const wasCoarse = POLLING_COARSE_TABS.has(prev);
    const isCoarse = POLLING_COARSE_TABS.has(tab);
    if (wasCoarse && !isCoarse) void fetchAll();
  }, [tab, fetchAll]);
}
