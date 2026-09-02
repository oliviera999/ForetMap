// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useNotificationCenter } from '../../src/hooks/useNotificationCenter.js';

/**
 * Notifications « d'état » (serveur indisponible, temps réel hors ligne, session non
 * vérifiée) : elles doivent être closes quand la condition retombe.
 *
 * Comportement observé en production : la notification « Serveur indisponible —
 * Synchronisation ralentie » restait non lue après la reprise (persistée 7 jours en
 * localStorage) et le bandeau critique d'App.jsx — rendu précisément quand `serverDown`
 * est redevenu faux — l'affichait alors que le voyant temps réel était au vert.
 */

const STORAGE_KEY = 'foretmap_notifications_items_teacher';

function mountCenter(initialProps) {
  return renderHook((props) => useNotificationCenter(props), {
    initialProps: { isTeacher: true, isAdmin: false, ...initialProps },
  });
}

function findByKey(result, key) {
  return result.current.items.find((item) => item.key === key) || null;
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('useNotificationCenter — notifications d’état', () => {
  it('« Serveur indisponible » est émise en critique puis close au retour du serveur', () => {
    const { result, rerender } = mountCenter({ serverDown: false });
    expect(result.current.latestCritical).toBeNull();

    rerender({ isTeacher: true, isAdmin: false, serverDown: true });
    expect(result.current.latestCritical?.key).toBe('server-down');
    expect(result.current.unreadCount).toBe(1);

    rerender({ isTeacher: true, isAdmin: false, serverDown: false });
    expect(result.current.latestCritical).toBeNull();
    expect(result.current.unreadCount).toBe(0);
    // L'historique garde la trace de l'incident.
    expect(findByKey(result, 'server-down')?.read).toBe(true);
  });

  it('une « Serveur indisponible » non lue restaurée du storage est close si le serveur répond', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          id: 'old-1',
          key: 'server-down',
          level: 'critical',
          category: 'operations',
          title: 'Serveur indisponible',
          message: 'Synchronisation ralentie, réessai automatique en cours.',
          read: false,
          createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        },
      ]),
    );
    const { result } = mountCenter({ serverDown: false });
    expect(findByKey(result, 'server-down')).not.toBeNull();
    expect(result.current.latestCritical).toBeNull();
    expect(result.current.unreadCount).toBe(0);
    // La clôture est persistée : un rechargement ne ressuscite pas l'item non lu.
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    expect(stored[0].read).toBe(true);
  });

  it('une « Serveur indisponible » restaurée reste ouverte tant que le serveur est indisponible', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          id: 'old-1',
          key: 'server-down',
          level: 'critical',
          category: 'operations',
          title: 'Serveur indisponible',
          message: 'Synchronisation ralentie, réessai automatique en cours.',
          read: false,
          createdAt: new Date().toISOString(),
        },
      ]),
    );
    const { result } = mountCenter({ serverDown: true });
    expect(result.current.latestCritical?.key).toBe('server-down');
  });

  it('« Temps réel hors ligne » est close quand le socket revient', () => {
    const { result, rerender } = mountCenter({ rtStatus: 'offline' });
    expect(findByKey(result, 'teacher-realtime-offline')?.read).toBe(false);

    rerender({ isTeacher: true, isAdmin: false, rtStatus: 'live' });
    expect(findByKey(result, 'teacher-realtime-offline')?.read).toBe(true);
    expect(result.current.unreadCount).toBe(0);
  });

  it('« Session non vérifiée » (élève) est close quand la session est recollée', () => {
    const { result, rerender } = mountCenter({ isTeacher: false, sessionValidationError: true });
    expect(findByKey(result, 'student-session-unverified')?.read).toBe(false);

    rerender({ isTeacher: false, isAdmin: false, sessionValidationError: false });
    expect(findByKey(result, 'student-session-unverified')?.read).toBe(true);
  });

  it('la clôture ne touche pas aux autres notifications non lues', () => {
    const { result, rerender } = mountCenter({ serverDown: true });
    act(() => {
      result.current.addNotification({
        key: 'autre',
        level: 'info',
        title: 'Autre',
        message: 'Sans rapport.',
      });
    });
    expect(result.current.unreadCount).toBe(2);

    rerender({ isTeacher: true, isAdmin: false, serverDown: false });
    expect(result.current.unreadCount).toBe(1);
    expect(findByKey(result, 'autre')?.read).toBe(false);
  });
});
