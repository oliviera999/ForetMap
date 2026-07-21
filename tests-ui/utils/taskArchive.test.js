import { describe, test, expect } from 'vitest';
import { isArchived, partitionByArchived } from '../../src/utils/taskArchive';
import { isEntityArchived } from '../../src/utils/badges';

describe('taskArchive — détection d’archivage', () => {
  test('isArchived : vrai seulement si archived_at renseigné', () => {
    expect(isArchived({ archived_at: '2026-07-20 10:00:00' })).toBe(true);
    expect(isArchived({ archived_at: new Date() })).toBe(true);
    expect(isArchived({ archived_at: null })).toBe(false);
    expect(isArchived({ archived_at: '' })).toBe(false);
    expect(isArchived({})).toBe(false);
    expect(isArchived(null)).toBe(false);
  });

  test('isEntityArchived (badges) : même logique, réutilisable côté tuiles', () => {
    expect(isEntityArchived({ archived_at: '2026-01-01 00:00:00' })).toBe(true);
    expect(isEntityArchived({ archived_at: null })).toBe(false);
    expect(isEntityArchived(undefined)).toBe(false);
  });
});

describe('taskArchive — partitionByArchived', () => {
  test('sépare actifs et archivés en conservant l’ordre', () => {
    const list = [
      { id: 'a', archived_at: null },
      { id: 'b', archived_at: '2026-07-20 10:00:00' },
      { id: 'c' },
      { id: 'd', archived_at: '2026-07-19 09:00:00' },
    ];
    const { active, archived } = partitionByArchived(list);
    expect(active.map((t) => t.id)).toEqual(['a', 'c']);
    expect(archived.map((t) => t.id)).toEqual(['b', 'd']);
  });

  test('entrée non-tableau → deux listes vides', () => {
    expect(partitionByArchived(null)).toEqual({ active: [], archived: [] });
    expect(partitionByArchived(undefined)).toEqual({ active: [], archived: [] });
  });
});
