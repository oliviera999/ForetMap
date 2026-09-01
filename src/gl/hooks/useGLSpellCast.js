import { useCallback, useEffect, useRef, useState } from 'react';
import { jitteredRefreshDelay } from '../../utils/realtimeRefreshDelay';
import { apiGL } from '../services/apiGL.js';
import { acquireGlSocket, subscribeGlGame } from '../realtime/glSocketClient.js';

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

  // Le refetch déclenché par `gl:spell_cast:draft` (émis à toute la partie) est étalé
  // comme les autres refetchs temps réel (`src/utils/realtimeRefreshDelay.js`) pour ne
  // pas faire recharger tous les postes dans la même seconde.
  const draftRefreshDebounceRef = useRef(null);
  const scheduleDraftRefresh = useCallback(
    (draftId) => {
      if (draftRefreshDebounceRef.current) clearTimeout(draftRefreshDebounceRef.current);
      draftRefreshDebounceRef.current = setTimeout(() => {
        draftRefreshDebounceRef.current = null;
        refreshDraft(draftId);
      }, jitteredRefreshDelay(0));
    },
    [refreshDraft],
  );

  useEffect(
    () => () => {
      if (draftRefreshDebounceRef.current) clearTimeout(draftRefreshDebounceRef.current);
    },
    [],
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

  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (!token || !gameId || !enabled) return undefined;
    const { socket, release } = acquireGlSocket(token);
    if (!socket) return undefined;
    const unsubGame = subscribeGlGame(token, gameId);
    const onDraft = (evt) => {
      if (Number(evt?.gameId) !== Number(gameId)) return;
      if (evt?.draft) setDraft(evt.draft);
      else if (evt?.draftId && draftRef.current?.id === evt.draftId) {
        scheduleDraftRefresh(evt.draftId);
      }
    };
    socket.on('gl:spell_cast:draft', onDraft);
    return () => {
      socket.off('gl:spell_cast:draft', onDraft);
      unsubGame();
      release();
    };
  }, [token, gameId, enabled, scheduleDraftRefresh]);

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
