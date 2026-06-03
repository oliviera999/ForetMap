import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { withAppBase } from '../../services/api.js';
import { apiGL } from '../services/apiGL.js';
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

  useEffect(() => {
    if (!token || !gameId) return undefined;
    const socket = io(withAppBase(''), {
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      auth: { token },
    });
    socket.on('connect', () => {
      socket.emit('subscribe:gl-game', { gameId: Number(gameId) });
    });
    socket.on('gl:game:event', (evt) => {
      if (Number(evt?.gameId) !== Number(gameId)) return;
      const id = Number(evt?.id);
      if (!Number.isFinite(id)) {
        reload();
        return;
      }
      setEvents((prev) => mergeEvent(prev, evt, teamsByIdRef.current));
    });
    return () => {
      socket.close();
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
