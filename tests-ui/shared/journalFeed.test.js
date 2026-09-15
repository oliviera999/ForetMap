import { describe, expect, test } from 'vitest';
import { buildJournalTimeline, timeValue } from '../../src/shared/journal/journalFeed.js';

const articles = [
  { id: 1, title: 'Renards du bois', bodyMarkdown: 'texte', createdAt: '2026-05-01T10:00:00Z' },
  {
    id: 2,
    title: 'Vieux',
    bodyMarkdown: 'ancien',
    createdAt: '2026-01-01T10:00:00Z',
    pinned: true,
  },
];
const imports = [
  {
    id: 3,
    resourceType: 'glossary',
    resourceRef: 'GL1',
    title: 'Photosynthèse',
    createdAt: '2026-05-02T10:00:00Z',
  },
];

describe('buildJournalTimeline (fil du carnet, commun ForetMap / G&L)', () => {
  test('épinglés d’abord, puis du plus récent au plus ancien', () => {
    const items = buildJournalTimeline({ articles, imports });
    expect(items.map((it) => it.data.id)).toEqual([2, 3, 1]);
  });

  test('ordre « plus ancien d’abord » garde les épinglés en tête', () => {
    const items = buildJournalTimeline({ articles, imports, sortOrder: 'oldest' });
    expect(items.map((it) => it.data.id)).toEqual([2, 1, 3]);
  });

  test('filtre par type', () => {
    expect(
      buildJournalTimeline({ articles, imports, kindFilter: 'import' }).map((it) => it.data.id),
    ).toEqual([3]);
    expect(buildJournalTimeline({ articles, imports, kindFilter: 'article' })).toHaveLength(2);
  });

  test('recherche : titre ou corps pour un article, titre ou référence pour un import', () => {
    expect(
      buildJournalTimeline({ articles, imports, search: 'renard' }).map((it) => it.data.id),
    ).toEqual([1]);
    expect(
      buildJournalTimeline({ articles, imports, search: 'ANCIEN' }).map((it) => it.data.id),
    ).toEqual([2]);
    expect(
      buildJournalTimeline({ articles, imports, search: 'gl1' }).map((it) => it.data.id),
    ).toEqual([3]);
    expect(buildJournalTimeline({ articles, imports, search: 'zzz' })).toEqual([]);
  });

  test('timeValue tolère les dates absentes ou invalides', () => {
    expect(timeValue(null)).toBe(0);
    expect(timeValue('pas une date')).toBe(0);
    expect(timeValue('2026-05-01T10:00:00Z')).toBeGreaterThan(0);
  });
});
