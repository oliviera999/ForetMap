import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'gl_notifications';
const MAX_NOTIFICATIONS = 50;

function safeRead() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function safeWrite(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (_) {
    // noop
  }
}

export function useGLNotificationCenter() {
  const [items, setItems] = useState(() => safeRead());

  useEffect(() => {
    safeWrite(items);
  }, [items]);

  const push = useCallback((notif) => {
    if (!notif || typeof notif !== 'object') return;
    const next = {
      id: notif.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      category: String(notif.category || 'game_event'),
      title: String(notif.title || ''),
      body: String(notif.body || ''),
      ts: Number(notif.ts) || Date.now(),
      read: false,
    };
    setItems((prev) => {
      const merged = [next, ...prev.filter((item) => item.id !== next.id)];
      return merged.slice(0, MAX_NOTIFICATIONS);
    });
  }, []);

  const markAllRead = useCallback(() => {
    setItems((prev) => prev.map((item) => ({ ...item, read: true })));
  }, []);

  const clear = useCallback(() => {
    setItems([]);
  }, []);

  const unreadCount = items.reduce((acc, item) => acc + (item.read ? 0 : 1), 0);

  return { items, push, markAllRead, clear, unreadCount };
}
