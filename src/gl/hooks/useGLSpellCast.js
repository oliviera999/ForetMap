import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { withAppBase } from '../../services/api.js';

export function useGLSpellCast({ token, gameId, enabled, onCastComplete }) {
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const onCastCompleteRef = useRef(onCastComplete);

  useEffect(() => {
    onCastCompleteRef.current = onCastComplete;
  }, [onCastComplete]);

  const runAction = useCallback(async (action) => {
    setBusy(true);
    try {
      const result = await action();
      setError('');
      return result;
    } catch (err) {
      setError(err.message || 'Action impossible');
      throw err;
    } finally {
      setBusy(false);
    }
  }, []);

  const startDraft = useCallback(
    async ({ spellCode, teamId }) => {
      if (!gameId) throw new Error('Aucune partie active');
      return runAction(async () => {
        const body = { spellCode };
        if (teamId != null && Number(teamId) > 0) body.teamId = Number(teamId);
        const data = await apiGL(`/api/gl/games/${gameId}/spell-casts/drafts`, 'POST', body);
        setDraft(data?.draft || null);
        return data?.draft;
      });
    },
    [gameId, runAction],
  );

  const refreshDraft = useCallback(
    async (draftId) => {
      if (!gameId || draftId == null) return null;
      const data = await apiGL(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}`);
      setDraft(data?.draft || null);
      return data?.draft;
    },
    [gameId],
  );

  const saveContributions = useCallback(
    async (draftId, contributions) => {
      if (!gameId || draftId == null) return null;
      return runAction(async () => {
        const data = await apiGL(
          `/api/gl/games/${gameId}/spell-casts/drafts/${draftId}/contributions`,
          'PUT',
          { contributions },
        );
        setDraft(data?.draft || null);
        return data?.draft;
      });
    },
    [gameId, runAction],
  );

  const launch = useCallback(
    async (draftId) => {
      if (!gameId || draftId == null) return null;
      return runAction(async () => {
        const data = await apiGL(
          `/api/gl/games/${gameId}/spell-casts/drafts/${draftId}/launch`,
          'POST',
        );
        setDraft(data?.draft || null);
        onCastCompleteRef.current?.(data);
        return data;
      });
    },
    [gameId, runAction],
  );

  const cancelDraft = useCallback(
    async (draftId) => {
      if (!gameId || draftId == null) return;
      await runAction(async () => {
        await apiGL(`/api/gl/games/${gameId}/spell-casts/drafts/${draftId}`, 'DELETE');
        setDraft(null);
      });
    },
    [gameId, runAction],
  );

  const reset = useCallback(() => {
    setDraft(null);
    setError('');
  }, []);

  useEffect(() => {
    if (!token || !gameId || !enabled) return undefined;
    let cancelled = false;
    let socket = null;
    // Import dynamique : socket.io-client (chunk `socket-io`) n'est chargé que lorsque
    // l'assistant de sort est actif — il reste hors du chargement initial de la page GL.
    (async () => {
      const { io } = await import('socket.io-client');
      if (cancelled) return;
      socket = io(withAppBase(''), {
        path: '/socket.io',
        transports: ['polling', 'websocket'],
        auth: { token },
      });
      socket.on('connect', () => {
        socket.emit('subscribe:gl-game', { gameId });
      });
      socket.on('gl:spell_cast:draft', (evt) => {
        if (Number(evt?.gameId) !== Number(gameId)) return;
        if (evt?.draft) setDraft(evt.draft);
        else if (evt?.draftId && draft?.id === evt.draftId) {
          refreshDraft(evt.draftId);
        }
      });
    })();
    return () => {
      cancelled = true;
      if (socket) socket.close();
    };
  }, [token, gameId, enabled, draft?.id, refreshDraft]);

  return {
    draft,
    busy,
    error,
    setError,
    startDraft,
    refreshDraft,
    saveContributions,
    launch,
    cancelDraft,
    reset,
  };
}
