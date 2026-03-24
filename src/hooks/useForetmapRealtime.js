import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api, AccountDeletedError, API } from '../services/api';

/**
 * Connexion Socket.IO (tâches, jardin, élèves) + indicateur temps réel mode prof.
 */
export function useForetmapRealtime({
  student,
  fetchAll,
  forceLogout,
  activeMapId,
  setTasks,
  setZones,
  setPlants,
  setMarkers,
}) {
  const [rtStatus, setRtStatus] = useState('off');
  const tasksRtDebounceRef = useRef(null);
  const gardenRtDebounceRef = useRef(null);

  const refreshTasksFromServer = useCallback(async () => {
    try {
      const t = await api('/api/tasks');
      setTasks(t);
    } catch (e) {
      if (e instanceof AccountDeletedError) forceLogout();
      else console.error('[ForetMap] rafraîchissement tâches (temps réel)', e);
    }
  }, [forceLogout, setTasks]);

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
    } catch (e) {
      console.error('[ForetMap] rafraîchissement jardin (temps réel)', e);
    }
  }, [activeMapId, setZones, setPlants, setMarkers]);

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
    if (!student) {
      setRtStatus('off');
      return undefined;
    }
    setRtStatus('connecting');
    const origin =
      API && String(API).trim() ? new URL(API, window.location.href).origin : window.location.origin;
    const socket = io(origin, {
      path: '/socket.io',
      // Contournement temporaire: certains proxys de prod altèrent les trames WebSocket.
      // On force le polling tant que l'infra n'est pas corrigée.
      transports: ['polling'],
    });
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
  }, [student, fetchAll, scheduleTasksRefresh, scheduleGardenRefresh, onStudentsRealtime]);

  return rtStatus;
}
