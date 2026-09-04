import { describe, expect, test } from 'vitest';

import {
  countUnreadNotifications,
  formatNotificationDateFr,
  groupNotificationsByCategory,
  notificationLevelClass,
} from '../../src/shared/notifications/notificationCenterCore.js';

describe('notificationLevelClass', () => {
  test('niveaux connus, et repli « info » pour tout le reste', () => {
    expect(notificationLevelClass('critical')).toBe('critical');
    expect(notificationLevelClass('important')).toBe('important');
    expect(notificationLevelClass('info')).toBe('info');
    expect(notificationLevelClass('inconnu')).toBe('info');
    expect(notificationLevelClass(null)).toBe('info');
  });
});

describe('formatNotificationDateFr', () => {
  const now = Date.parse('2026-09-03T12:00:00Z');

  test('paliers : instant, minutes, heures, puis date courte', () => {
    expect(formatNotificationDateFr(now - 10_000, now)).toBe('à l’instant');
    expect(formatNotificationDateFr(now - 5 * 60_000, now)).toBe('il y a 5 min');
    expect(formatNotificationDateFr(now - 3 * 3_600_000, now)).toBe('il y a 3 h');
    expect(formatNotificationDateFr(now - 5 * 86_400_000, now)).toMatch(/\d{2}/);
  });

  test('accepte une chaîne ISO, un horodatage et un objet Date', () => {
    expect(formatNotificationDateFr('2026-09-03T11:59:30Z', now)).toBe('à l’instant');
    expect(formatNotificationDateFr(new Date(now - 60_000), now)).toBe('il y a 1 min');
  });

  test('date illisible : chaîne vide ; date future : « à l’instant »', () => {
    expect(formatNotificationDateFr('pas une date', now)).toBe('');
    expect(formatNotificationDateFr(null, now)).toBe('');
    expect(formatNotificationDateFr(now + 60_000, now)).toBe('à l’instant');
  });
});

describe('groupNotificationsByCategory', () => {
  const items = [
    { id: 1, category: 'market', read: true },
    { id: 2, category: 'game_event', read: false },
    { id: 3, category: 'market', read: false },
    { id: 4, read: false },
  ];

  test('regroupe, compte les non-lues et conserve l’ordre d’arrivée dans un groupe', () => {
    const groups = groupNotificationsByCategory(items, { market: 'Marché' });
    const market = groups.find((g) => g.category === 'market');
    expect(market.label).toBe('Marché');
    expect(market.items.map((i) => i.id)).toEqual([1, 3]);
    expect(market.unread).toBe(1);
    expect(groups.find((g) => g.category === 'autre').items).toHaveLength(1);
  });

  test('les groupes qui portent le plus de non-lues passent devant', () => {
    const groups = groupNotificationsByCategory(
      [
        { category: 'a', read: true },
        { category: 'b', read: false },
        { category: 'b', read: false },
      ],
      {},
    );
    expect(groups.map((g) => g.category)).toEqual(['b', 'a']);
  });

  test('liste vide ou absente : aucun groupe', () => {
    expect(groupNotificationsByCategory([], {})).toEqual([]);
    expect(groupNotificationsByCategory(null)).toEqual([]);
  });
});

describe('countUnreadNotifications', () => {
  test('compte les non-lues, tolère les entrées bancales', () => {
    expect(countUnreadNotifications([{ read: true }, { read: false }, {}])).toBe(2);
    expect(countUnreadNotifications(null)).toBe(0);
  });
});
