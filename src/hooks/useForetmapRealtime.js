import { useCallback, useEffect, useRef, useState } from 'react';
import {
  api,
  AccountDeletedError,
  API,
  withAppBase,
  getAuthToken,
  getStoredSessionAccountKey,
} from '../services/api';
import { partitionByArchived } from '../utils/taskArchive';
import { isSocketAuthRejection } from '../utils/realtimeAuthRejection';
import { jitteredRefreshDelay } from '../utils/realtimeRefreshDelay';
import { getSocketIoClientOptions } from '../utils/socketIoClientOptions';
import { setForetmapSocket } from '../services/foretmapSocketRegistry';
import { fetchAllTaskPages } from '../utils/tasksListResponse.js';

/** Après notification Socket.IO : tâches = refetch léger côté API (priorité fraîcheur). */
const TASKS_RT_DEBOUNCE_MS = 220;
/** Jardin = zones + plantes + repères (plus coûteux) : léger délai supplémentaire pour absorber les rafales. */
const GARDEN_RT_DEBOUNCE_MS = 400;

/**
 * Client Socket.IO chargé à la demande (audit UI/UX du 19/11/2026, U1) : ce hook est monté
 * par `App.jsx` dès l'écran de connexion, où `enabled` est faux — un import statique y
 * faisait partir les 40 Ko du chunk `socket-io` pour rien. L'import ne part qu'avec une
 * session (élève ou prof) ; pour une session restaurée, il part dès le premier effet, en
 * parallèle du shell connecté. Le navigateur garde le module : une reconnexion (jeton
 * renouvelé) ne le recharge pas.
 */
const loadSocketIoClient = () => import('socket.io-client');

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
  /** Aligné sur `realtime.allow_websocket` des réglages publics (env serveur). */
  allowWebsocket = false,
}) {
  const [rtStatus, setRtStatus] = useState('off');
  // Jeton réactif : après élévation PIN, refresh ou expiration, `foretmap_session_changed`
  // met à jour le jeton et force une reconnexion du socket avec le bon niveau de droits.
  const [authToken, setAuthToken] = useState(() => getAuthToken());
  useEffect(() => {
    const sync = () => setAuthToken(getAuthToken());
    window.addEventListener('foretmap_session_changed', sync);
    return () => window.removeEventListener('foretmap_session_changed', sync);
  }, []);
  const tasksRtDebounceRef = useRef(null);
  const gardenRtDebounceRef = useRef(null);
  /** Pendant la fenêtre de debounce jardin : true si au moins un événement exige un refetch plantes. */
  const gardenRtPlantsPendingRef = useRef(false);
  const socketRef = useRef(null);
  /** Vrai quand le serveur a refusé le jeton : on ne relance plus de connexion avec celui-ci. */
  const authRejectedRef = useRef(false);
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
    const accountAtStart = getStoredSessionAccountKey();
    const tokenAtStart = getAuthToken();
    if (!accountAtStart || !tokenAtStart) return;
    try {
      const mapId = String(activeMapIdRef.current || '').trim();
      if (!mapId) return;
      const mapQuery = `map_id=${encodeURIComponent(mapId)}`;
      // Actives seulement — les archives se rechargent via loadArchivedTasks (vue Archivés).
      const [t, projects] = await Promise.all([
        fetchAllTaskPages(api, mapQuery),
        api(`/api/task-projects?${mapQuery}`).catch(() => []),
      ]);
      // Audit 26/11 S3 : ignorer si déconnexion / changement de compte pendant l'await.
      if (
        !getAuthToken() ||
        getStoredSessionAccountKey() !== accountAtStart ||
        pauseDataRefreshRef?.current
      ) {
        return;
      }
      if (!Array.isArray(t)) {
        console.warn(
          '[ForetMap] rafraîchissement tâches (temps réel) : réponse inattendue',
          typeof t,
        );
        return;
      }
      const { active: activeTasks } = partitionByArchived(t);
      const { active: activeProjects } = partitionByArchived(
        Array.isArray(projects) ? projects : [],
      );
      setTasks(activeTasks);
      setTaskProjects(activeProjects);
      window.dispatchEvent(new CustomEvent('foretmap_realtime', { detail: { domain: 'tasks' } }));
    } catch (e) {
      if (e instanceof AccountDeletedError) forceLogoutRef.current();
      else console.error('[ForetMap] rafraîchissement tâches (temps réel)', e);
    }
  }, [pauseDataRefreshRef, setTaskProjects, setTasks]);

  const refreshGardenFromServer = useCallback(
    async (options = {}) => {
      if (pauseDataRefreshRef?.current) return;
      const accountAtStart = getStoredSessionAccountKey();
      const tokenAtStart = getAuthToken();
      if (!accountAtStart || !tokenAtStart) return;
      const includePlants = options.includePlants !== false;
      try {
        const mapId = String(activeMapIdRef.current || '').trim();
        if (!mapId) return;
        const mapQuery = `map_id=${encodeURIComponent(mapId)}`;
        if (includePlants) {
          const [z, p, m] = await Promise.all([
            api(`/api/zones?${mapQuery}`),
            api('/api/plants'),
            api(`/api/map/markers?${mapQuery}`),
          ]);
          if (
            !getAuthToken() ||
            getStoredSessionAccountKey() !== accountAtStart ||
            pauseDataRefreshRef?.current
          ) {
            return;
          }
          setZones(z);
          setPlants(p);
          setMarkers(m);
        } else {
          const [z, m] = await Promise.all([
            api(`/api/zones?${mapQuery}`),
            api(`/api/map/markers?${mapQuery}`),
          ]);
          if (
            !getAuthToken() ||
            getStoredSessionAccountKey() !== accountAtStart ||
            pauseDataRefreshRef?.current
          ) {
            return;
          }
          setZones(z);
          setMarkers(m);
        }
        window.dispatchEvent(
          new CustomEvent('foretmap_realtime', { detail: { domain: 'garden', includePlants } }),
        );
      } catch (e) {
        if (e instanceof AccountDeletedError) forceLogoutRef.current();
        else console.error('[ForetMap] rafraîchissement jardin (temps réel)', e);
      }
    },
    [pauseDataRefreshRef, setMarkers, setPlants, setZones],
  );

  const scheduleTasksRefresh = useCallback(() => {
    if (tasksRtDebounceRef.current) clearTimeout(tasksRtDebounceRef.current);
    tasksRtDebounceRef.current = setTimeout(() => {
      tasksRtDebounceRef.current = null;
      refreshTasksFromServer();
    }, jitteredRefreshDelay(TASKS_RT_DEBOUNCE_MS));
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
      }, jitteredRefreshDelay(GARDEN_RT_DEBOUNCE_MS));
    },
    [refreshGardenFromServer],
  );

  const onStudentsRealtime = useCallback(() => {
    window.dispatchEvent(new CustomEvent('foretmap_realtime', { detail: { domain: 'students' } }));
  }, []);
  const onForumRealtime = useCallback((payload = {}) => {
    window.dispatchEvent(
      new CustomEvent('foretmap_realtime', { detail: { domain: 'forum', payload } }),
    );
  }, []);
  const onContextCommentsRealtime = useCallback((payload = {}) => {
    window.dispatchEvent(
      new CustomEvent('foretmap_realtime', { detail: { domain: 'context_comments', payload } }),
    );
  }, []);
  const onObservationsRealtime = useCallback((payload = {}) => {
    window.dispatchEvent(
      new CustomEvent('foretmap_realtime', { detail: { domain: 'observations', payload } }),
    );
  }, []);

  useEffect(() => {
    if (!enabled) {
      setRtStatus('off');
      return undefined;
    }
    if (!authToken) {
      setRtStatus('off');
      return undefined;
    }
    setRtStatus('connecting');
    // Nouveau socket (jeton renouvelé, élévation, changement de session) : le refus
    // précédent ne vaut plus.
    authRejectedRef.current = false;
    let cancelled = false;
    let teardown = null;
    let retryOnOnline = null;
    const clearRetry = () => {
      if (retryOnOnline) {
        window.removeEventListener('online', retryOnOnline);
        retryOnOnline = null;
      }
    };
    /** Ouvre la connexion une fois le client chargé ; renvoie le nettoyage du socket. */
    const openSocket = (io) => {
      const origin =
        API && String(API).trim()
          ? new URL(API, window.location.href).origin
          : window.location.origin;
      const socket = io(origin, {
        path: withAppBase('/socket.io'),
        auth: { token: authToken, mapId: activeMapIdRef.current || undefined },
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        randomizationFactor: 0.3,
        timeout: 20000,
        ...getSocketIoClientOptions({ allowWebsocket }),
      });
      socketRef.current = socket;
      // Socket exposée aux abonnements ciblés (plateaux de fresque), sans seconde connexion.
      setForetmapSocket(socket);
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
        if (isSocketAuthRejection(err)) {
          // Jeton refusé : la reconnexion automatique (infinie, toutes les 1 à 5 s, en
          // long-polling donc une requête HTTP par tentative) rejouerait éternellement le
          // même jeton. On coupe ; le polling REST prend le relais, et une nouvelle session
          // (`foretmap_session_changed` → `authToken`) relance cet effet avec un jeton neuf.
          authRejectedRef.current = true;
          clearOfflineTimer();
          setRtStatus('off');
          socket.disconnect();
          return;
        }
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
        // Retour du réseau : inutile de relancer une connexion que le serveur refuse.
        if (authRejectedRef.current) return;
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
      socket.on('observations:changed', onObservationsRealtime);
      const onPresenceUpdate = (payload) => {
        try {
          window.dispatchEvent(new CustomEvent('foretmap_presence', { detail: payload }));
        } catch {
          /* ignore */
        }
      };
      socket.on('presence:update', onPresenceUpdate);
      // Notification adressée à ce compte (salon personnel) : le centre de notifications
      // recharge sa liste depuis le serveur.
      const onNotificationsNew = (payload) => {
        window.dispatchEvent(new CustomEvent('foretmap_notifications_new', { detail: payload }));
      };
      socket.on('notifications:new', onNotificationsNew);
      window.addEventListener('online', onBrowserOnline);
      if (socket.connected) setRtStatus('live');

      return () => {
        socketRef.current = null;
        setForetmapSocket(null);
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
        socket.off('observations:changed', onObservationsRealtime);
        socket.off('presence:update', onPresenceUpdate);
        socket.off('notifications:new', onNotificationsNew);
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
    };
    const load = () => {
      loadSocketIoClient()
        .then(({ io }) => {
          if (cancelled) return;
          teardown = openSocket(io);
        })
        .catch((err) => {
          if (cancelled) return;
          // Module introuvable (hors ligne, déploiement en cours) : le polling REST tient
          // l'écran à jour ; nouvel essai au retour du réseau.
          console.warn('[ForetMap] Socket.IO indisponible', err?.message || err);
          setRtStatus('offline');
          clearRetry();
          retryOnOnline = () => {
            clearRetry();
            if (cancelled) return;
            setRtStatus('connecting');
            load();
          };
          window.addEventListener('online', retryOnOnline);
        });
    };
    load();

    return () => {
      cancelled = true;
      clearRetry();
      if (teardown) teardown();
      else setRtStatus('off');
    };
  }, [
    enabled,
    authToken,
    allowWebsocket,
    onContextCommentsRealtime,
    onObservationsRealtime,
    onForumRealtime,
    onStudentsRealtime,
    scheduleGardenRefresh,
    scheduleTasksRefresh,
  ]);

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
