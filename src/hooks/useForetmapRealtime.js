import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api, AccountDeletedError, API, withAppBase, getAuthToken } from '../services/api';

/** Après notification Socket.IO : tâches = refetch léger côté API (priorité fraîcheur). */
const TASKS_RT_DEBOUNCE_MS = 220;
/** Jardin = zones + plantes + repères (plus coûteux) : léger délai supplémentaire pour absorber les rafales. */
const GARDEN_RT_DEBOUNCE_MS = 400;

/**
 * Raisons `garden:changed` où la liste globale `/api/plants` ne change pas : on ne refetch que zones + repères de la carte active.
 * (Exclut `delete_zone`, imports, sync visite, mutations plantes — voir émissions serveur.)
 */
const GARDEN_REASONS_OMIT_PLANTS = new Set([
  'update_zone',
  'add_zone_photo',
  'delete_zone_photo',
  'create_zone',
  'create_marker',
  'update_marker',
  'delete_marker',
]);

function gardenChangedPayloadNeedsPlants(payload) {
  if (payload == null || typeof payload !== 'object') return true;
  const r = payload.reason;
  if (r == null || r === '') return true;
  return !GARDEN_REASONS_OMIT_PLANTS.has(String(r));
}

/**
 * Connexion Socket.IO (tâches, jardin, n3beurs, forum, commentaires) + indicateur temps réel mode n3boss.
 */
export function useForetmapRealtime({
  enabled,
  fetchAll,
  forceLogout,
  activeMapId,
  setTasks,
  setTaskProjects,
  setZones,
  setPlants,
  setMarkers,
  /** Quand vrai : pas de `setTasks` / jardin via temps réel (modale formulaire ouverte — clavier mobile). */
  pauseDataRefreshRef = null,
}) {
  const [rtStatus, setRtStatus] = useState('off');
  const tasksRtDebounceRef = useRef(null);
  const gardenRtDebounceRef = useRef(null);
  /** Pendant la fenêtre de debounce jardin : true si au moins un événement exige un refetch plantes. */
  const gardenRtPlantsPendingRef = useRef(false);
  const socketRef = useRef(null);
  const offlineTimerRef = useRef(null);
  const subscribedMapIdRef = useRef(null);
  const activeMapIdRef = useRef(activeMapId);
  const fetchAllRef = useRef(fetchAll);
  const forceLogoutRef = useRef(forceLogout);

  useEffect(() => {
    activeMapIdRef.current = activeMapId;
  }, [activeMapId]);

  useEffect(() => {
    fetchAllRef.current = fetchAll;
  }, [fetchAll]);

  useEffect(() => {
    forceLogoutRef.current = forceLogout;
  }, [forceLogout]);

  const refreshTasksFromServer = useCallback(async () => {
    if (pauseDataRefreshRef?.current) return;
    try {
      const mapId = activeMapIdRef.current || 'foret';
      const mapQuery = `map_id=${encodeURIComponent(mapId)}`;
      const [t, projects] = await Promise.all([
        api(`/api/tasks?${mapQuery}`),
        api(`/api/task-projects?${mapQuery}`).catch(() => []),
      ]);
      if (!Array.isArray(t)) {
        console.warn('[ForetMap] rafraîchissement tâches (temps réel) : réponse inattendue', typeof t);
        return;
      }
      setTasks(t);
      setTaskProjects(Array.isArray(projects) ? projects : []);
      window.dispatchEvent(new CustomEvent('foretmap_realtime', { detail: { domain: 'tasks' } }));
    } catch (e) {
      if (e instanceof AccountDeletedError) forceLogoutRef.current();
      else console.error('[ForetMap] rafraîchissement tâches (temps réel)', e);
    }
  }, [pauseDataRefreshRef, setTaskProjects, setTasks]);

  const refreshGardenFromServer = useCallback(async (options = {}) => {
    if (pauseDataRefreshRef?.current) return;
    const includePlants = options.includePlants !== false;
    try {
      const mapId = activeMapIdRef.current || 'foret';
      const mapQuery = `map_id=${encodeURIComponent(mapId)}`;
      if (includePlants) {
        const [z, p, m] = await Promise.all([
          api(`/api/zones?${mapQuery}`),
          api('/api/plants'),
          api(`/api/map/markers?${mapQuery}`),
        ]);
        setZones(z);
        setPlants(p);
        setMarkers(m);
      } else {
        const [z, m] = await Promise.all([
          api(`/api/zones?${mapQuery}`),
          api(`/api/map/markers?${mapQuery}`),
        ]);
        setZones(z);
        setMarkers(m);
      }
      window.dispatchEvent(
        new CustomEvent('foretmap_realtime', { detail: { domain: 'garden', includePlants } })
      );
    } catch (e) {
      if (e instanceof AccountDeletedError) forceLogoutRef.current();
      else console.error('[ForetMap] rafraîchissement jardin (temps réel)', e);
    }
  }, [pauseDataRefreshRef, setMarkers, setPlants, setZones]);

  const scheduleTasksRefresh = useCallback(() => {
    if (tasksRtDebounceRef.current) clearTimeout(tasksRtDebounceRef.current);
    tasksRtDebounceRef.current = setTimeout(() => {
      tasksRtDebounceRef.current = null;
      refreshTasksFromServer();
    }, TASKS_RT_DEBOUNCE_MS);
  }, [refreshTasksFromServer]);

  const scheduleGardenRefresh = useCallback(
    (payload) => {
      gardenRtPlantsPendingRef.current =
        gardenRtPlantsPendingRef.current || gardenChangedPayloadNeedsPlants(payload);
      if (gardenRtDebounceRef.current) clearTimeout(gardenRtDebounceRef.current);
      gardenRtDebounceRef.current = setTimeout(() => {
        gardenRtDebounceRef.current = null;
        const includePlants = gardenRtPlantsPendingRef.current;
        gardenRtPlantsPendingRef.current = false;
        refreshGardenFromServer({ includePlants });
      }, GARDEN_RT_DEBOUNCE_MS);
    },
    [refreshGardenFromServer]
  );

  const onStudentsRealtime = useCallback(() => {
    window.dispatchEvent(new CustomEvent('foretmap_realtime', { detail: { domain: 'students' } }));
  }, []);
  const onForumRealtime = useCallback(() => {
    window.dispatchEvent(new CustomEvent('foretmap_realtime', { detail: { domain: 'forum' } }));
  }, []);
  const onContextCommentsRealtime = useCallback((payload = {}) => {
    window.dispatchEvent(new CustomEvent('foretmap_realtime', { detail: { domain: 'context_comments', payload } }));
  }, []);

  useEffect(() => {
    if (!enabled) {
      setRtStatus('off');
      return undefined;
    }
    const authToken = getAuthToken();
    if (!authToken) {
      setRtStatus('off');
      return undefined;
    }
    setRtStatus('connecting');
    const origin =
      API && String(API).trim() ? new URL(API, window.location.href).origin : window.location.origin;
    const socket = io(origin, {
      path: withAppBase('/socket.io'),
      auth: { token: authToken, mapId: activeMapIdRef.current || undefined },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.3,
      timeout: 20000,
      // Polling HTTP uniquement : certains reverse-proxy / hébergeurs renvoient des trames WS
      // invalides (ex. « reserved bits » RSV2/RSV3) ; le long-polling reste fiable pour notifier + refetch REST.
      transports: ['polling'],
      // Interdit toute tentative d’upgrade WS côté moteur (double garde avec transports ci-dessus).
      upgrade: false,
    });
    socketRef.current = socket;
    const OFFLINE_GRACE_MS = 15000;
    const subscribeCurrentMap = () => {
      const mapId = activeMapIdRef.current;
      if (!mapId) return;
      if (subscribedMapIdRef.current === mapId) return;
      socket.emit('subscribe:map', { mapId });
      subscribedMapIdRef.current = mapId;
    };
    const clearOfflineTimer = () => {
      if (offlineTimerRef.current) {
        clearTimeout(offlineTimerRef.current);
        offlineTimerRef.current = null;
      }
    };
    const scheduleOfflineFallback = () => {
      clearOfflineTimer();
      offlineTimerRef.current = setTimeout(() => {
        offlineTimerRef.current = null;
        setRtStatus('offline');
      }, OFFLINE_GRACE_MS);
    };
    const onConnect = () => {
      clearOfflineTimer();
      setRtStatus('live');
      subscribeCurrentMap();
    };
    const onDisconnect = (reason) => {
      if (reason === 'io client disconnect') {
        clearOfflineTimer();
        setRtStatus('off');
        return;
      }
      setRtStatus('connecting');
      scheduleOfflineFallback();
    };
    const onConnectError = (err) => {
      console.warn('[ForetMap] Socket.IO connect_error', err?.message || err);
      setRtStatus('connecting');
      scheduleOfflineFallback();
    };
    const onReconnectAttempt = () => {
      clearOfflineTimer();
      setRtStatus('connecting');
    };
    const onReconnect = () => {
      clearOfflineTimer();
      setRtStatus('live');
      subscribeCurrentMap();
      fetchAllRef.current();
    };
    const onReconnectFailed = () => {
      scheduleOfflineFallback();
    };
    const onBrowserOnline = () => {
      if (!socket.connected) {
        setRtStatus('connecting');
        socket.connect();
      }
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.io.on('reconnect_attempt', onReconnectAttempt);
    socket.io.on('reconnect', onReconnect);
    socket.io.on('reconnect_failed', onReconnectFailed);
    socket.on('tasks:changed', scheduleTasksRefresh);
    socket.on('students:changed', onStudentsRealtime);
    socket.on('garden:changed', scheduleGardenRefresh);
    socket.on('forum:changed', onForumRealtime);
    socket.on('context-comments:changed', onContextCommentsRealtime);
    window.addEventListener('online', onBrowserOnline);
    if (socket.connected) setRtStatus('live');

    return () => {
      socketRef.current = null;
      subscribedMapIdRef.current = null;
      clearOfflineTimer();
      socket.io.off('reconnect_attempt', onReconnectAttempt);
      socket.io.off('reconnect', onReconnect);
      socket.io.off('reconnect_failed', onReconnectFailed);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('tasks:changed', scheduleTasksRefresh);
      socket.off('students:changed', onStudentsRealtime);
      socket.off('garden:changed', scheduleGardenRefresh);
      socket.off('forum:changed', onForumRealtime);
      socket.off('context-comments:changed', onContextCommentsRealtime);
      window.removeEventListener('online', onBrowserOnline);
      if (tasksRtDebounceRef.current) {
        clearTimeout(tasksRtDebounceRef.current);
        tasksRtDebounceRef.current = null;
      }
      if (gardenRtDebounceRef.current) {
        clearTimeout(gardenRtDebounceRef.current);
        gardenRtDebounceRef.current = null;
      }
      socket.disconnect();
      setRtStatus('off');
    };
  }, [enabled, onContextCommentsRealtime, onForumRealtime, onStudentsRealtime, scheduleGardenRefresh, scheduleTasksRefresh]);

  useEffect(() => {
    activeMapIdRef.current = activeMapId;
    const socket = socketRef.current;
    if (!socket || !activeMapId) return;
    if (subscribedMapIdRef.current === activeMapId) return;
    socket.emit('subscribe:map', { mapId: activeMapId });
    subscribedMapIdRef.current = activeMapId;
  }, [activeMapId]);

  return rtStatus;
}
