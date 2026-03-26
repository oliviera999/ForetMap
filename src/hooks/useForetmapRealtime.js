import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api, AccountDeletedError, API, withAppBase, getAuthToken } from '../services/api';

/**
 * Connexion Socket.IO (tâches, jardin, élèves) + indicateur temps réel mode prof.
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
}) {
  const [rtStatus, setRtStatus] = useState('off');
  const tasksRtDebounceRef = useRef(null);
  const gardenRtDebounceRef = useRef(null);
  const socketRef = useRef(null);

  const refreshTasksFromServer = useCallback(async () => {
    try {
      const mapQuery = `map_id=${encodeURIComponent(activeMapId)}`;
      const [t, projects] = await Promise.all([
        api(`/api/tasks?${mapQuery}`),
        api(`/api/task-projects?${mapQuery}`).catch(() => []),
      ]);
      setTasks(t);
      setTaskProjects(Array.isArray(projects) ? projects : []);
      window.dispatchEvent(new CustomEvent('foretmap_realtime', { detail: { domain: 'tasks' } }));
    } catch (e) {
      if (e instanceof AccountDeletedError) forceLogout();
      else console.error('[ForetMap] rafraîchissement tâches (temps réel)', e);
    }
  }, [activeMapId, forceLogout, setTaskProjects, setTasks]);

  const refreshGardenFromServer = useCallback(async () => {
    try {
      const mapQuery = `map_id=${encodeURIComponent(activeMapId)}`;
      const [z, p, m] = await Promise.all([
        api(`/api/zones?${mapQuery}`),
        api('/api/plants'),
        api(`/api/map/markers?${mapQuery}`),
      ]);
      setZones(z);
      setPlants(p);
      setMarkers(m);
      window.dispatchEvent(new CustomEvent('foretmap_realtime', { detail: { domain: 'garden' } }));
    } catch (e) {
      if (e instanceof AccountDeletedError) forceLogout();
      else console.error('[ForetMap] rafraîchissement jardin (temps réel)', e);
    }
  }, [activeMapId, forceLogout, setMarkers, setPlants, setZones]);

  const scheduleTasksRefresh = useCallback(() => {
    if (tasksRtDebounceRef.current) clearTimeout(tasksRtDebounceRef.current);
    tasksRtDebounceRef.current = setTimeout(() => {
      tasksRtDebounceRef.current = null;
      refreshTasksFromServer();
    }, 200);
  }, [refreshTasksFromServer]);

  const scheduleGardenRefresh = useCallback(() => {
    if (gardenRtDebounceRef.current) clearTimeout(gardenRtDebounceRef.current);
    gardenRtDebounceRef.current = setTimeout(() => {
      gardenRtDebounceRef.current = null;
      refreshGardenFromServer();
    }, 200);
  }, [refreshGardenFromServer]);

  const onStudentsRealtime = useCallback(() => {
    window.dispatchEvent(new CustomEvent('foretmap_realtime', { detail: { domain: 'students' } }));
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
      auth: { token: authToken },
      // Contournement temporaire: certains proxys de prod altèrent les trames WebSocket.
      // On force le polling tant que l'infra n'est pas corrigée.
      transports: ['polling'],
    });
    socketRef.current = socket;
    const onConnect = () => setRtStatus('live');
    const onDisconnect = () => setRtStatus('offline');
    const onConnectError = (err) => {
      console.warn('[ForetMap] Socket.IO connect_error', err?.message || err);
      setRtStatus('offline');
    };
    const onReconnectAttempt = () => setRtStatus('connecting');
    const onReconnect = () => {
      fetchAll();
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.io.on('reconnect_attempt', onReconnectAttempt);
    socket.io.on('reconnect', onReconnect);
    socket.on('tasks:changed', scheduleTasksRefresh);
    socket.on('students:changed', onStudentsRealtime);
    socket.on('garden:changed', scheduleGardenRefresh);
    if (socket.connected) setRtStatus('live');

    return () => {
      socketRef.current = null;
      socket.io.off('reconnect_attempt', onReconnectAttempt);
      socket.io.off('reconnect', onReconnect);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('tasks:changed', scheduleTasksRefresh);
      socket.off('students:changed', onStudentsRealtime);
      socket.off('garden:changed', scheduleGardenRefresh);
      if (tasksRtDebounceRef.current) clearTimeout(tasksRtDebounceRef.current);
      if (gardenRtDebounceRef.current) clearTimeout(gardenRtDebounceRef.current);
      socket.disconnect();
      setRtStatus('off');
    };
  }, [enabled, fetchAll, onStudentsRealtime, scheduleGardenRefresh, scheduleTasksRefresh]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !activeMapId) return;
    socket.emit('subscribe:map', { mapId: activeMapId });
  }, [activeMapId]);

  return rtStatus;
}
