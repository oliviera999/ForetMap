import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useDebouncedAutoSave } from '../hooks/useDebouncedAutoSave.js';
import { withAppBase } from '../appBase.js';
import { migrateState } from './fresqueCore.js';

/** Enregistrement différé : 500 ms après la dernière modification (cahier des charges § 4.8). */
export const FRESQUE_SAVE_DEBOUNCE_MS = 500;
export const FRESQUE_MIRROR_PREFIX = 'fm:fresque:';

export function mirrorKey(boardId) {
  return `${FRESQUE_MIRROR_PREFIX}${boardId}`;
}

export function readMirror(boardId, storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(mirrorKey(boardId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.state) return null;
    return {
      clientSeq: Number(parsed.clientSeq) || 0,
      baseRevision: Number(parsed.baseRevision) || 0,
      state: parsed.state,
      at: parsed.at || null,
    };
  } catch {
    return null;
  }
}

export function writeMirror(boardId, state, baseRevision, storage = globalThis.localStorage) {
  try {
    storage?.setItem(
      mirrorKey(boardId),
      JSON.stringify({
        clientSeq: Number(state?.clientSeq) || 0,
        baseRevision: Number(baseRevision) || 0,
        state,
        at: new Date().toISOString(),
      }),
    );
  } catch {
    /* quota, mode privé : le serveur reste la référence */
  }
}

export function clearMirror(boardId, storage = globalThis.localStorage) {
  try {
    storage?.removeItem(mirrorKey(boardId));
  } catch {
    /* ignore */
  }
}

/**
 * État initial : l'état serveur, sauf si le miroir local est plus récent (même révision de
 * base, `clientSeq` supérieur) — cas d'un onglet fermé avant la fin de l'enregistrement.
 */
export function pickInitialState(board, storage) {
  const server = migrateState(board?.state) || null;
  const mirror = readMirror(board?.id, storage);
  if (
    server &&
    mirror &&
    mirror.baseRevision === (Number(board?.revision) || 0) &&
    mirror.clientSeq > (Number(server.clientSeq) || 0)
  ) {
    const restored = migrateState(mirror.state);
    if (restored) return { state: restored, fromMirror: true, server };
  }
  return { state: server, fromMirror: false, server };
}

function isConflictError(err) {
  return err?.status === 409 && err?.body?.code === 'edit_conflict';
}

function isOfflineError(err) {
  return (
    !err?.status ||
    err?.code === 'NETWORK_UNREACHABLE' ||
    (typeof navigator !== 'undefined' && navigator.onLine === false)
  );
}

/**
 * État d'un plateau de fresque côté client : miroir local immédiat, enregistrement différé,
 * vidage immédiat quand la page se cache, verrou optimiste (409 → dialogue de conflit),
 * reprise et signal temps réel.
 *
 * L'appel réseau est injecté (`api(path, method, body)` qui lève une erreur portant `status`
 * et `body`, comme `src/services/api.js`), ainsi que `getAuthToken` pour l'envoi `keepalive`
 * de dernière chance : ce hook ne dépend d'aucun code produit.
 *
 * @param {object} options
 * @param {(path: string, method?: string, body?: object) => Promise<object>} options.api
 * @param {() => string|null} [options.getAuthToken]
 * @param {object} options.board plateau sérialisé par l'API (`id`, `revision`, `state`, `readOnly`)
 * @param {boolean} [options.readOnly]
 * @param {(rewards: object[]) => void} [options.onRewards]
 * @param {(result: object) => void} [options.onCompleted]
 * @param {(message: string) => void} [options.onToast]
 */
export function useFresqueBoardState({
  api,
  getAuthToken = null,
  board,
  readOnly = false,
  onRewards = null,
  onCompleted = null,
  onToast = null,
}) {
  const boardId = board?.id || null;
  const initial = useMemo(() => pickInitialState(board), [board]);
  const [state, setState] = useState(initial.state);
  const stateRef = useRef(state);
  stateRef.current = state;
  const [revision, setRevision] = useState(Number(board?.revision) || 0);
  const revisionRef = useRef(revision);
  revisionRef.current = revision;
  const [conflict, setConflict] = useState(null);
  const conflictRef = useRef(conflict);
  conflictRef.current = conflict;
  const [offline, setOffline] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const callbacksRef = useRef({ onRewards, onCompleted, onToast, api, getAuthToken });
  callbacksRef.current = { onRewards, onCompleted, onToast, api, getAuthToken };

  /** Modification locale : nouvel état, `clientSeq` incrémenté, miroir écrit aussitôt. */
  const update = useCallback(
    (mutator) => {
      if (readOnly || !boardId) return;
      setState((prev) => {
        const next = typeof mutator === 'function' ? mutator(prev) : mutator;
        if (!next || next === prev) return prev;
        const stamped = { ...next, clientSeq: (Number(prev?.clientSeq) || 0) + 1 };
        writeMirror(boardId, stamped, revisionRef.current);
        return stamped;
      });
    },
    [boardId, readOnly],
  );

  const doSave = useCallback(async () => {
    const snapshot = stateRef.current;
    if (!snapshot || !boardId) return snapshot;
    const { api: request, onRewards: rewards, onCompleted: completed } = callbacksRef.current;
    try {
      const res = await request(`/api/fresques/boards/${boardId}`, 'PUT', {
        state: snapshot,
        expected_revision: revisionRef.current,
        clientSeq: snapshot.clientSeq,
      });
      const nextRevision = Number(res?.revision);
      if (Number.isFinite(nextRevision)) {
        revisionRef.current = nextRevision;
        setRevision(nextRevision);
      }
      writeMirror(boardId, snapshot, revisionRef.current);
      setOffline(false);
      setLastSavedAt(new Date().toISOString());
      if (Array.isArray(res?.rewards) && res.rewards.length) rewards?.(res.rewards);
      if (res?.completed) completed?.(res);
      return snapshot;
    } catch (err) {
      if (isConflictError(err)) {
        setConflict({ currentRevision: Number(err.body.current_revision) || 0, remote: false });
        throw new Error('Ta fresque a été modifiée sur un autre appareil');
      }
      if (isOfflineError(err)) {
        setOffline(true);
        throw new Error('Hors ligne : gardé sur cet appareil');
      }
      throw err;
    }
  }, [boardId]);

  const autosave = useDebouncedAutoSave({
    value: state,
    resetKey: boardId,
    enabled: !readOnly && !conflict && Boolean(boardId),
    debounceMs: FRESQUE_SAVE_DEBOUNCE_MS,
    onSave: doSave,
    isEqual: (a, b) => (Number(a?.clientSeq) || 0) === (Number(b?.clientSeq) || 0),
  });
  const { resetBaseline, flush, isDirty, status: saveStatus, error: saveError } = autosave;

  // Miroir plus récent que le serveur : la ligne de base reste l'état serveur, pour que le
  // miroir soit renvoyé.
  useEffect(() => {
    if (initial.fromMirror && initial.server) resetBaseline(initial.server);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  // Retour du réseau : on retente aussitôt.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onOnline = () => {
      if (!readOnly && !conflictRef.current) void flush();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [flush, readOnly]);

  /** Dernière chance (onglet caché, page fermée) : requête `keepalive` avec l'état courant. */
  const sendKeepalive = useCallback(() => {
    if (readOnly || !boardId || typeof fetch !== 'function') return;
    const snapshot = stateRef.current;
    if (!snapshot) return;
    const token = callbacksRef.current.getAuthToken?.();
    try {
      void fetch(withAppBase(`/api/fresques/boards/${boardId}`), {
        method: 'PUT',
        keepalive: true,
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          state: snapshot,
          expected_revision: revisionRef.current,
          clientSeq: snapshot.clientSeq,
        }),
      }).catch(() => {});
    } catch {
      /* le miroir local reprendra au prochain chargement */
    }
  }, [boardId, readOnly]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const onHide = () => {
      if (conflictRef.current) return;
      if (!isDirty) return;
      sendKeepalive();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') onHide();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onHide);
    };
  }, [isDirty, sendKeepalive]);

  /** Recharge l'état serveur (reprise, conflit résolu côté serveur, signal temps réel). */
  const reload = useCallback(async () => {
    if (!boardId) return null;
    const res = await callbacksRef.current.api(`/api/fresques/boards/${boardId}`);
    const fresh = migrateState(res?.board?.state);
    if (!fresh) return null;
    revisionRef.current = Number(res.board.revision) || 0;
    setRevision(revisionRef.current);
    setState(fresh);
    resetBaseline(fresh);
    writeMirror(boardId, fresh, revisionRef.current);
    setConflict(null);
    return fresh;
  }, [boardId, resetBaseline]);

  /**
   * Dialogue de conflit : `reload` reprend la version enregistrée ; `keep` garde celle-ci
   * (renvoyée avec la révision courante). Rien ne s'écrase en silence.
   */
  const resolveConflict = useCallback(
    async (mode) => {
      const current = conflictRef.current;
      if (!current) return;
      if (mode === 'keep') {
        revisionRef.current = current.currentRevision;
        setRevision(current.currentRevision);
        setConflict(null);
        await flush();
        return;
      }
      await reload();
    },
    [flush, reload],
  );

  /** Signal `fresque:board:changed` d'un autre client : recharge si rien n'est en attente. */
  const applyRemoteChange = useCallback(
    (payload) => {
      const remoteRevision = Number(payload?.revision);
      if (!Number.isFinite(remoteRevision) || remoteRevision <= revisionRef.current) return;
      if (isDirty || saveStatus === 'saving') {
        setConflict({ currentRevision: remoteRevision, remote: true });
        return;
      }
      void reload();
    },
    [isDirty, reload, saveStatus],
  );

  let status = 'saved';
  if (conflict) status = 'conflict';
  else if (offline) status = 'offline';
  else if (saveStatus === 'saving') status = 'saving';
  else if (saveStatus === 'pending' || isDirty) status = 'pending';
  else if (saveStatus === 'error') status = 'error';

  return {
    boardId,
    state,
    revision,
    readOnly,
    update,
    flush,
    reload,
    status,
    error: saveError,
    isDirty,
    conflict,
    resolveConflict,
    applyRemoteChange,
    lastSavedAt,
    fromMirror: initial.fromMirror,
  };
}
