import { describe, expect, test } from 'vitest';
import { buildJournalExport } from '../../../src/shared/journal/journalExport.js';

const importTypeMeta = (t) => ({ label: t === 'plant' ? 'Espèce' : 'Ressource' });

describe('buildJournalExport (export Markdown du carnet, commun ForetMap / G&L)', () => {
  test('en-tête, comptages, articles datés, imports datés', () => {
    const md = buildJournalExport({
      subjectLabel: 'Éva Test',
      articles: [
        {
          id: 1,
          title: 'Renards',
          bodyMarkdown: 'texte',
          createdAt: '2026-05-01T10:00:00Z',
          zoneName: 'Mare',
        },
        { id: 2, title: '', bodyMarkdown: '' },
      ],
      imports: [
        { id: 3, resourceType: 'plant', title: 'Noisetier', createdAt: '2026-05-02T10:00:00Z' },
      ],
      importTypeMeta,
      articleExtraLine: (a) => (a.zoneName ? `Zone : ${a.zoneName}` : null),
    });
    expect(md).toContain('# Carnet de Éva Test');
    expect(md).toContain('_2 article(s) · 1 import(s)_');
    expect(md).toContain('### Renards');
    expect(md).toMatch(/_créé le .+_/);
    expect(md).toContain('_Zone : Mare_');
    expect(md).toContain('### Article sans titre');
    expect(md).toContain('_(sans texte)_');
    expect(md).toContain('## Éléments importés');
    expect(md).toMatch(/- Espèce — Noisetier \(importé le .+\)/);
  });

  test('carnet vide : en-tête et comptages seulement', () => {
    const md = buildJournalExport({ subjectLabel: 'X', importTypeMeta });
    expect(md.trim().split('\n')).toEqual(['# Carnet de X', '', '_0 article(s) · 0 import(s)_']);
  });
});
