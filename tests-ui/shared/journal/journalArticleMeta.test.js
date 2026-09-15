import { describe, test, expect } from 'vitest';
import { buildEditorMetaParts } from '../../../src/shared/journal/journalArticleMeta.js';

describe('journalArticleMeta', () => {
  test('une seule date principale ; compteur seulement près de la limite', () => {
    const parts = buildEditorMetaParts({
      updatedAt: '2026-05-02T10:00:00Z',
      createdAt: '2026-05-01T10:00:00Z',
      maxChars: 100,
      charCount: 50,
    });
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatch(/02/);

    const near = buildEditorMetaParts({
      updatedAt: '2026-05-02T10:00:00Z',
      maxChars: 100,
      charCount: 90,
    });
    expect(near.some((p) => p.includes('90 / 100'))).toBe(true);
  });

  test('zone optionnelle ; compteur aussi au-delà de la limite', () => {
    const withZone = buildEditorMetaParts({
      createdAt: '2026-05-01T10:00:00Z',
      zoneName: 'Mare',
      includeZone: true,
    });
    expect(withZone).toContain('Mare');

    const over = buildEditorMetaParts({
      maxChars: 10,
      charCount: 12,
    });
    expect(over.some((p) => p.includes('12 / 10'))).toBe(true);
  });
});
