import { describe, test, expect } from 'vitest';
import {
  isNotificationActionable,
  isServerNotificationId,
  notificationActionLabel,
  notificationFromServer,
  serverIdFromNotificationId,
  sortNotificationsByDateDesc,
  targetActionLabel,
} from '../../src/utils/notificationTargets.js';

describe('notificationFromServer', () => {
  test('niveau et catégorie selon le type ; cible conservée', () => {
    const item = notificationFromServer({
      id: 12,
      kind: 'task_overdue',
      title: '« Semis » est en retard depuis le 20/09',
      body: 'Mare — Pensez à la marquer faite une fois terminée.',
      target: { type: 'task', id: '5', mapId: 'foret', filter: 'overdue' },
      read: false,
      created_at: '2026-09-24T08:00:00.000Z',
    });
    expect(item).toMatchObject({
      id: 'srv-12',
      serverId: 12,
      level: 'critical',
      category: 'deadlines',
      message: 'Mare — Pensez à la marquer faite une fois terminée.',
      target: { type: 'task', id: '5', filter: 'overdue' },
      read: false,
    });
  });

  test('type inconnu : info, « Mes tâches »', () => {
    const item = notificationFromServer({ id: 1, kind: 'autre', title: 'x' });
    expect(item.level).toBe('info');
    expect(item.category).toBe('tasks');
  });
});

describe('identifiants serveur', () => {
  test('préfixe srv-', () => {
    expect(isServerNotificationId('srv-3')).toBe(true);
    expect(isServerNotificationId('171-abc')).toBe(false);
    expect(serverIdFromNotificationId('srv-3')).toBe('3');
    expect(serverIdFromNotificationId('171-abc')).toBeNull();
  });
});

describe('libellés d’action', () => {
  test.each([
    [{ type: 'task', id: '1' }, 'Voir la tâche'],
    [{ type: 'task', id: '1', filter: 'to_validate' }, 'Voir la tâche à valider'],
    [{ type: 'task', filter: 'to_validate' }, 'Voir les tâches à valider'],
    [{ type: 'task', filter: 'overdue' }, 'Voir les tâches en retard'],
    [{ type: 'task' }, 'Voir mes tâches'],
    [{ type: 'place', id: 'z1', kind: 'zone' }, 'Voir le lieu et ses messages'],
    [{ type: 'thread', id: 't1', postId: 'p1' }, 'Voir la réponse'],
    [{ type: 'thread', id: 't1' }, 'Ouvrir le sujet'],
    [{ type: 'settings', section: 'accueil' }, 'Ouvrir les réglages'],
  ])('%j → %s', (target, label) => {
    expect(targetActionLabel(target)).toBe(label);
  });

  test('avis local : relance de session et onglet', () => {
    expect(notificationActionLabel({ action: { type: 'retryStudentValidation' } })).toBe(
      'Réessayer',
    );
    expect(notificationActionLabel({ action: { tab: 'stats' } })).toBe('Ouvrir');
    expect(notificationActionLabel({})).toBe('');
  });

  test('isNotificationActionable', () => {
    expect(isNotificationActionable({ target: { type: 'task' } })).toBe(true);
    expect(isNotificationActionable({ action: { tab: 'map' } })).toBe(true);
    expect(isNotificationActionable({ action: null })).toBe(false);
    expect(isNotificationActionable(null)).toBe(false);
  });
});

test('sortNotificationsByDateDesc : plus récentes en tête', () => {
  const out = sortNotificationsByDateDesc([
    { id: 'a', createdAt: '2026-09-20T00:00:00Z' },
    { id: 'b', createdAt: '2026-09-24T00:00:00Z' },
  ]);
  expect(out.map((i) => i.id)).toEqual(['b', 'a']);
});
