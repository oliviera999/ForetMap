// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const apiMock = vi.hoisted(() => vi.fn(async () => ({ items: [] })));
vi.mock('../../src/services/api', () => ({ api: apiMock }));

const { useNotificationCenter } = await import('../../src/hooks/useNotificationCenter.js');

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

describe('useNotificationCenter — échéances n3beur', () => {
  const student = { id: 's1', first_name: 'Lina', last_name: 'B' };
  const STUDENT_STORAGE_KEY = 'foretmap_notifications_items_student';

  function isoDaysFromToday(days) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function mountStudent(tasks) {
    return renderHook((props) => useNotificationCenter(props), {
      initialProps: { isTeacher: false, isAdmin: false, student, tasksForActiveMap: tasks },
    });
  }

  function taskDue(id, offsetDays) {
    return {
      id,
      status: 'in_progress',
      due_date: isoDaysFromToday(offsetDays),
      assignments: [{ student_id: 's1' }],
    };
  }

  beforeEach(() => {
    window.localStorage.removeItem(STUDENT_STORAGE_KEY);
  });

  it('une tâche due AUJOURD’HUI est « proche », pas « en retard »', () => {
    const { result } = mountStudent([taskDue('t1', 0)]);
    expect(findByKey(result, 'student-deadline-soon')?.read).toBe(false);
    expect(findByKey(result, 'student-deadline-overdue')).toBeNull();
  });

  it('une tâche dépassée déclenche « en retard »', () => {
    const { result } = mountStudent([taskDue('t1', -1)]);
    expect(findByKey(result, 'student-deadline-overdue')?.read).toBe(false);
  });

  it('la notification est CLOSE quand plus aucune échéance ne la justifie', () => {
    const { result, rerender } = mountStudent([taskDue('t1', -1)]);
    expect(result.current.unreadCount).toBe(1);

    rerender({
      isTeacher: false,
      isAdmin: false,
      student,
      tasksForActiveMap: [taskDue('t1', 10)],
    });
    expect(findByKey(result, 'student-deadline-overdue')?.read).toBe(true);
    expect(result.current.unreadCount).toBe(0);
  });

  it('la clé est stable : un changement de compte n’empile pas un second item', () => {
    const { result, rerender } = mountStudent([taskDue('t1', -1)]);
    rerender({
      isTeacher: false,
      isAdmin: false,
      student,
      tasksForActiveMap: [taskDue('t1', -1), taskDue('t2', -2)],
    });
    const overdueItems = result.current.items.filter(
      (item) => item.key === 'student-deadline-overdue',
    );
    expect(overdueItems).toHaveLength(1);
  });
});

/**
 * Avis d'état à clé stable : un seul élément, mis à jour en place, avec une cible précise.
 * Avant : une clé par valeur du compteur (`teacher-pending-3`, `-4`…) empilait les avis.
 */
describe('useNotificationCenter — avis d’état ciblés', () => {
  it('validations en attente : clé stable, compte mis à jour, cible « à valider »', () => {
    const { result, rerender } = mountCenter({ teacherPendingValidationCount: 2 });
    let item = findByKey(result, 'teacher-pending');
    expect(item?.message).toBe('2 tâches terminées attendent votre validation.');
    expect(item?.target).toEqual({ type: 'task', filter: 'to_validate' });

    rerender({ isTeacher: true, isAdmin: false, teacherPendingValidationCount: 3 });
    const pending = result.current.items.filter((i) => i.key === 'teacher-pending');
    expect(pending).toHaveLength(1);
    expect(pending[0].message).toBe('3 tâches terminées attendent votre validation.');

    rerender({ isTeacher: true, isAdmin: false, teacherPendingValidationCount: 0 });
    item = findByKey(result, 'teacher-pending');
    expect(item?.read).toBe(true);
  });

  it('un avis lu et inchangé ne redevient pas non lu', () => {
    const { result, rerender } = mountCenter({ teacherPendingValidationCount: 1 });
    act(() => result.current.markAsRead(findByKey(result, 'teacher-pending').id));
    rerender({ isTeacher: true, isAdmin: false, teacherPendingValidationCount: 1 });
    expect(findByKey(result, 'teacher-pending')?.read).toBe(true);
  });

  it('modules désactivés (admin) : les modules sont nommés, cible Réglages', () => {
    const { result } = renderHook(() =>
      useNotificationCenter({
        isTeacher: true,
        isAdmin: true,
        publicSettings: { modules: { visit_enabled: false, stats_enabled: false } },
      }),
    );
    const item = findByKey(result, 'admin-modules-disabled');
    expect(item?.message).toBe('Désactivés : Visite, Statistiques.');
    expect(item?.target).toEqual({ type: 'settings', section: 'accueil' });
  });

  it('élève : une seule tâche en retard mène directement à elle', () => {
    const d = new Date();
    d.setDate(d.getDate() - 2);
    const due = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const { result } = renderHook(() =>
      useNotificationCenter({
        isTeacher: false,
        isAdmin: false,
        student: { id: 's1', first_name: 'Lina', last_name: 'B' },
        tasksForActiveMap: [
          {
            id: 't9',
            title: 'Arroser les fraisiers',
            status: 'available',
            due_date: due,
            assignments: [{ student_id: 's1' }],
          },
        ],
      }),
    );
    const item = findByKey(result, 'student-deadline-overdue');
    expect(item?.message).toBe('« Arroser les fraisiers » est en retard.');
    expect(item?.target).toEqual({ type: 'task', id: 't9', filter: 'overdue' });
  });
});

/**
 * Notifications serveur : chargées pour le compte connecté, rechargées à l'arrivée d'un
 * événement temps réel personnel, « lu » enregistré côté serveur.
 */
describe('useNotificationCenter — notifications serveur', () => {
  const serverRow = {
    id: 7,
    kind: 'place_message',
    title: 'Message sur « Mare » (Forêt)',
    body: 'Léa M. : la bâche est déchirée',
    target: { type: 'place', id: 'z1', mapId: 'foret', kind: 'zone' },
    read: false,
    created_at: new Date().toISOString(),
  };

  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockImplementation(async (url) => {
      if (String(url).startsWith('/api/notifications?')) {
        return { items: [serverRow], unread_count: 1 };
      }
      return { ok: true };
    });
  });

  it('charge les notifications du compte et les fusionne aux avis locaux', async () => {
    const { result } = mountCenter({ serverEnabled: true });
    await waitFor(() => expect(result.current.items.some((i) => i.id === 'srv-7')).toBe(true));
    const item = result.current.items.find((i) => i.id === 'srv-7');
    expect(item.title).toBe('Message sur « Mare » (Forêt)');
    expect(item.message).toBe('Léa M. : la bâche est déchirée');
    expect(item.target).toEqual(serverRow.target);
    expect(result.current.unreadCount).toBe(1);
  });

  it('« lu » est envoyé au serveur', async () => {
    const { result } = mountCenter({ serverEnabled: true });
    await waitFor(() => expect(result.current.unreadCount).toBe(1));
    act(() => result.current.markAsRead('srv-7'));
    expect(result.current.unreadCount).toBe(0);
    expect(apiMock).toHaveBeenCalledWith('/api/notifications/7/read', 'POST');
  });

  it('un événement temps réel personnel recharge la liste', async () => {
    mountCenter({ serverEnabled: true });
    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(1));
    act(() => {
      window.dispatchEvent(new CustomEvent('foretmap_notifications_new', { detail: {} }));
    });
    await waitFor(() => expect(apiMock).toHaveBeenCalledTimes(2));
  });

  it('sans session (visite), aucun appel serveur', () => {
    mountCenter({ serverEnabled: false });
    expect(apiMock).not.toHaveBeenCalled();
  });
});
