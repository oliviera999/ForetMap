import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../services/api';
import {
  EMPTY_FORUM_MARKER,
  FORUM_READ_EVENT,
  forumReadCursorKey,
  hasUnreadForumPosts,
  normalizeForumMarker,
  readForumReadCursor,
  writeForumReadCursor,
} from '../utils/forumUnread.js';

/** Fenêtre de regroupement des rafraîchissements déclenchés par le temps réel. */
const REALTIME_DEBOUNCE_MS = 1500;
/** Relève périodique quand le socket temps réel n'est pas vivant. */
const POLL_INTERVAL_MS = 120_000;

/**
 * Point rouge « messages non lus » sur l'onglet Forum.
 *
 * Rafraîchi par l'événement temps réel `forum`, à l'ouverture de l'onglet Forum, au retour de
 * l'onglet navigateur au premier plan, et par une relève lente quand le socket n'est pas vivant.
 * Tant que l'onglet Forum est ouvert, tout ce qui arrive est considéré comme lu.
 *
 * Première consultation sur l'appareil (aucun curseur) : ce qui existe déjà compte comme lu,
 * comme pour les pastilles par sujet — sinon le point s'allumait sans qu'aucun sujet ne soit
 * signalé dans la liste.
 *
 * @param {{
 *   enabled: boolean,
 *   userType?: string,
 *   userId?: string,
 *   isForumOpen: boolean,
 *   rtStatus?: string,
 *   isTabVisible?: boolean,
 * }} params
 */
export function useForumUnread({
  enabled,
  userType,
  userId,
  isForumOpen,
  rtStatus,
  isTabVisible = true,
}) {
  const [latest, setLatest] = useState(EMPTY_FORUM_MARKER);
  const [cursor, setCursor] = useState(() => readForumReadCursor(userType, userId));
  const debounceRef = useRef(null);
  const mountedRef = useRef(true);
  const requestSeqRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    requestSeqRef.current += 1;
    setLatest(EMPTY_FORUM_MARKER);
    setCursor(readForumReadCursor(userType, userId));
  }, [userType, userId]);

  const reload = useCallback(async () => {
    if (!enabled) return;
    const seq = ++requestSeqRef.current;
    try {
      const data = await api('/api/forum/unread-marker');
      // Réponse d'un compte précédent ou dépassée par une relève plus récente.
      if (!mountedRef.current || seq !== requestSeqRef.current) return;
      const next = normalizeForumMarker(data);
      if (next.id && !readForumReadCursor(userType, userId).id) {
        setCursor(writeForumReadCursor(userType, userId, next));
      }
      setLatest(next);
    } catch (_) {
      /* indicateur non critique : on garde le dernier état connu */
    }
  }, [enabled, userType, userId]);

  useEffect(() => {
    if (!enabled) {
      setLatest(EMPTY_FORUM_MARKER);
      return;
    }
    if (isTabVisible) reload();
  }, [enabled, isTabVisible, reload]);

  useEffect(() => {
    if (enabled && isForumOpen) reload();
  }, [enabled, isForumOpen, reload]);

  useEffect(() => {
    if (!enabled) return undefined;
    const onRealtime = (event) => {
      if (event?.detail?.domain !== 'forum') return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        reload();
      }, REALTIME_DEBOUNCE_MS);
    };
    window.addEventListener('foretmap_realtime', onRealtime);
    return () => window.removeEventListener('foretmap_realtime', onRealtime);
  }, [enabled, reload]);

  useEffect(() => {
    if (!enabled || !isTabVisible || rtStatus === 'live') return undefined;
    const timer = setInterval(reload, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [enabled, isTabVisible, rtStatus, reload]);

  useEffect(() => {
    const onRead = (event) => {
      const next = event?.detail?.marker;
      setCursor(next ? normalizeForumMarker(next) : readForumReadCursor(userType, userId));
    };
    // Autre onglet (ou application installée) : le stockage change sans événement local.
    const key = forumReadCursorKey(userType, userId);
    const onStorage = (event) => {
      if (event?.key === key) setCursor(readForumReadCursor(userType, userId));
    };
    window.addEventListener(FORUM_READ_EVENT, onRead);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(FORUM_READ_EVENT, onRead);
      window.removeEventListener('storage', onStorage);
    };
  }, [userType, userId]);

  const unread = hasUnreadForumPosts(latest, cursor);

  useEffect(() => {
    if (!enabled || !isForumOpen || !unread) return;
    setCursor(writeForumReadCursor(userType, userId, latest));
  }, [enabled, isForumOpen, unread, latest, userType, userId]);

  return {
    hasUnread: enabled && !isForumOpen && unread,
    reload,
  };
}
