import { useCallback, useEffect, useState } from 'react';
import {
  initialThreadReadState,
  isThreadUnread,
  markThreadRead,
  readThreadReadState,
  sameForumId,
  writeThreadReadState,
} from './forumHelpers.js';

/**
 * Pastilles « non lu » par sujet, mémorisées sur l'appareil (clé par produit et par compte).
 *
 * - À la toute première ouverture (aucun état stocké), tout ce qui est visible est lu.
 * - Le sujet en cours de lecture (`activeThreadId`) est marqué lu à chaque rafraîchissement de
 *   la liste : un message arrivé pendant qu'on lit la discussion ne rallume pas sa pastille.
 * - Chaque écriture fusionne avec l'état déjà enregistré, et un changement fait dans un autre
 *   onglet est relu : deux onglets ne s'effacent plus leurs lectures.
 *
 * @param {{ storageKey: string, threads: object[], loaded: boolean, activeThreadId?: string|number|null }} params
 */
export function useForumThreadUnread({ storageKey, threads, loaded, activeThreadId }) {
  const [state, setState] = useState(() => readThreadReadState(storageKey));

  useEffect(() => {
    setState(readThreadReadState(storageKey));
    if (!storageKey || typeof window === 'undefined') return undefined;
    const onStorage = (event) => {
      if (event?.key === storageKey) setState(readThreadReadState(storageKey));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || !loaded || state) return;
    setState(writeThreadReadState(storageKey, initialThreadReadState(threads)));
  }, [loaded, state, storageKey, threads]);

  useEffect(() => {
    if (!storageKey || !state || activeThreadId == null || activeThreadId === '') return;
    const thread = threads.find((t) => sameForumId(t.id, activeThreadId));
    if (!thread) return;
    const next = markThreadRead(state, thread);
    if (next === state) return;
    setState(writeThreadReadState(storageKey, next));
  }, [activeThreadId, state, storageKey, threads]);

  const isUnread = useCallback(
    (thread) => !sameForumId(thread?.id, activeThreadId) && isThreadUnread(thread, state),
    [activeThreadId, state],
  );

  return { isUnread };
}
