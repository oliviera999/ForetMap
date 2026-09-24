import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../services/api';
import {
  FORUM_READ_EVENT,
  hasUnreadForumPosts,
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
 * Rafraîchi par l'événement temps réel `forum`, au retour de l'onglet navigateur au premier
 * plan, et par une relève lente quand le socket n'est pas vivant. Tant que l'onglet Forum
 * est ouvert, tout ce qui arrive est considéré comme lu.
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
  const [latestPostId, setLatestPostId] = useState('');
  const [cursor, setCursor] = useState(() => readForumReadCursor(userType, userId));
  const debounceRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    setCursor(readForumReadCursor(userType, userId));
  }, [userType, userId]);

  const reload = useCallback(async () => {
    if (!enabled) return;
    try {
      const data = await api('/api/forum/unread-marker');
      if (!mountedRef.current) return;
      setLatestPostId(String(data?.latest_post_id || ''));
    } catch (_) {
      /* indicateur non critique : on garde le dernier état connu */
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setLatestPostId('');
      return;
    }
    if (isTabVisible) reload();
  }, [enabled, isTabVisible, reload]);

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
      setCursor(typeof next === 'string' ? next : readForumReadCursor(userType, userId));
    };
    window.addEventListener(FORUM_READ_EVENT, onRead);
    return () => window.removeEventListener(FORUM_READ_EVENT, onRead);
  }, [userType, userId]);

  useEffect(() => {
    if (!enabled || !isForumOpen || !latestPostId || latestPostId === cursor) return;
    setCursor(writeForumReadCursor(userType, userId, latestPostId));
  }, [enabled, isForumOpen, latestPostId, cursor, userType, userId]);

  return {
    hasUnread: enabled && !isForumOpen && hasUnreadForumPosts(latestPostId, cursor),
    reload,
  };
}
