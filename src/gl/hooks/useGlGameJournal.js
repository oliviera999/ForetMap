import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { jitteredRefreshDelay } from '../../utils/realtimeRefreshDelay';
import { apiGL } from '../services/apiGL.js';
import { acquireGlSocket, subscribeGlGame } from '../realtime/glSocketClient.js';

export function useGlGameJournal({
  gameId,
  token,
  teamFilterId = null,
  limit = 200,
  chronological = false,
}) {
  const [events, setEvents] = useState([]);
  const [teams, setTeams] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!gameId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (teamFilterId != null && Number.isFinite(Number(teamFilterId))) {
        params.set('teamId', String(teamFilterId));
      }
      const data = await apiGL(`/api/gl/journal/games/${gameId}?${params}`);
      const nextTeams = Array.isArray(data?.teams) ? data.teams : [];
      setTeams(nextTeams);
      setEvents(Array.isArray(data?.events) ? data.events : []);
      setError('');
    } catch (err) {
      setError(err.message || 'Chargement impossible');
    } finally {
      setLoading(false);
    }
  }, [gameId, teamFilterId, limit]);

  useEffect(() => {
    reload();
  }, [reload]);

  const reloadDebounceRef = useRef(null);
  useEffect(
    () => () => {
      if (reloadDebounceRef.current) clearTimeout(reloadDebounceRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!token || !gameId) return undefined;
    const { socket, release } = acquireGlSocket(token);
    if (!socket) return undefined;
    const unsubGame = subscribeGlGame(token, gameId);
    const onEvent = (evt) => {
      if (Number(evt?.gameId) !== Number(gameId)) return;
      if (reloadDebounceRef.current) clearTimeout(reloadDebounceRef.current);
      reloadDebounceRef.current = setTimeout(() => {
        reloadDebounceRef.current = null;
        reload();
      }, jitteredRefreshDelay(0));
    };
    socket.on('gl:game:event', onEvent);
    return () => {
      socket.off('gl:game:event', onEvent);
      unsubGame();
      release();
    };
  }, [token, gameId, reload]);

  const displayEvents = useMemo(() => {
    const list = [...events];
    if (chronological) list.reverse();
    return list;
  }, [events, chronological]);

  return {
    events: displayEvents,
    teams,
    error,
    loading,
    reload,
  };
}
