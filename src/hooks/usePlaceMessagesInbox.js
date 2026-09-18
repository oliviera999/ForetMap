import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { api } from '../services/api';
import {
  PLACE_MESSAGES_SEEN_EVENT,
  newestPlaceMessageDate,
  readPlaceMessagesLastSeen,
  unreadPlaceMessages,
  writePlaceMessagesLastSeen,
} from '../utils/placeMessagesInbox.js';

/** Fenêtre de regroupement des rafraîchissements déclenchés par le temps réel. */
const REALTIME_DEBOUNCE_MS = 1500;

/**
 * Messages reçus sur les lieux (zones et repères), pour la console.
 *
 * Une seule requête au montage, puis un rafraîchissement **poussé par le temps réel** :
 * `context-comments:changed` est déjà émis à chaque commentaire créé, il n'y a donc rien à
 * interroger en boucle. Un onglet sans socket vivant voit la liste au prochain montage — ce
 * qui est le comportement attendu d'un journal, pas d'une messagerie.
 *
 * @param {{ enabled?: boolean, limit?: number }} [options]
 */
export function usePlaceMessagesInbox({ enabled = false, limit = 30 } = {}) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastSeenAt, setLastSeenAt] = useState(() => readPlaceMessagesLastSeen());
  const debounceRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const data = await api(`/api/context-comments/recent?limit=${encodeURIComponent(limit)}`);
      if (!mountedRef.current) return;
      setItems(Array.isArray(data?.items) ? data.items : []);
      setTotal(Number(data?.total || 0));
      setError('');
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err?.message || 'Chargement des messages impossible.');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [enabled, limit]);

  useEffect(() => {
    if (!enabled) {
      setItems([]);
      setTotal(0);
      setError('');
      return undefined;
    }
    reload();
    return undefined;
  }, [enabled, reload]);

  // Temps réel : un commentaire créé n'importe où dans l'application redemande la liste, une
  // fois la rafale passée (une classe entière peut commenter la même zone en même temps).
  useEffect(() => {
    if (!enabled) return undefined;
    const onRealtime = (event) => {
      if (event?.detail?.domain !== 'context_comments') return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        reload();
      }, REALTIME_DEBOUNCE_MS);
    };
    window.addEventListener('foretmap_realtime', onRealtime);
    return () => window.removeEventListener('foretmap_realtime', onRealtime);
  }, [enabled, reload]);

  // L'autre lecteur du même repère (panneau ↔ centre de notifications) l'a déplacé.
  useEffect(() => {
    const onSeen = (event) => {
      const next = event?.detail?.at;
      setLastSeenAt(typeof next === 'string' ? next : readPlaceMessagesLastSeen());
    };
    window.addEventListener(PLACE_MESSAGES_SEEN_EVENT, onSeen);
    return () => window.removeEventListener(PLACE_MESSAGES_SEEN_EVENT, onSeen);
  }, []);

  const unreadItems = useMemo(() => unreadPlaceMessages(items, lastSeenAt), [items, lastSeenAt]);

  /**
   * Pose le repère sur le message le plus récent **connu** : marquer « lu » ce qu'on n'a pas
   * reçu masquerait un message arrivé entre deux chargements.
   */
  const markAllRead = useCallback(() => {
    const newest = newestPlaceMessageDate(items);
    if (!newest) return;
    setLastSeenAt(writePlaceMessagesLastSeen(newest));
  }, [items]);

  /** Premier usage : on part de maintenant, sans déclarer tout l'historique non lu. */
  useEffect(() => {
    if (!enabled || lastSeenAt || items.length === 0) return;
    setLastSeenAt(writePlaceMessagesLastSeen(newestPlaceMessageDate(items)));
  }, [enabled, items, lastSeenAt]);

  return {
    items,
    total,
    loading,
    error,
    lastSeenAt,
    unreadItems,
    unreadCount: unreadItems.length,
    reload,
    markAllRead,
  };
}
