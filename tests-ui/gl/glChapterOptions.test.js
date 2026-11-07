import { describe, test, expect } from 'vitest';
import {
  buildChapterOptions,
  chapterOptionLabel,
  hasChaptersHorsPlateau,
} from '../../src/gl/utils/glChapterOptions.js';

const chapters = [
  { id: 1, title: 'Chapitre 1 — La forêt magique', plateau_number: null },
  { id: 2, title: 'test', plateau_number: null },
  { id: 4, title: 'Chapitre 2 — Aride chaud', plateau_number: 2 },
  { id: 3, title: 'Chapitre 1 — Tropiques africains', plateau_number: 1 },
];

describe('glChapterOptions', () => {
  test('seuls les plateaux, préfixés « Plateau N — », triés par numéro', () => {
    const options = buildChapterOptions(chapters);
    expect(options.map((o) => o.label)).toEqual([
      'Plateau 1 — Chapitre 1 — Tropiques africains',
      'Plateau 2 — Chapitre 2 — Aride chaud',
    ]);
    expect(chapterOptionLabel(chapters[2])).toBe('Plateau 2 — Chapitre 2 — Aride chaud');
  });

  test('« Afficher les chapitres hors plateau » révèle la démo et « test » à la suite', () => {
    const options = buildChapterOptions(chapters, { horsPlateau: true });
    expect(options.map((o) => o.id)).toEqual([3, 4, 1, 2]);
    expect(options[2].label).toBe('Chapitre 1 — La forêt magique');
    expect(hasChaptersHorsPlateau(chapters)).toBe(true);
    expect(hasChaptersHorsPlateau(chapters.slice(2))).toBe(false);
  });

  test('le chapitre déjà sélectionné reste proposé même hors plateau', () => {
    const options = buildChapterOptions(chapters, { selectedId: '2' });
    expect(options.map((o) => o.id)).toEqual([3, 4, 2]);
    expect(buildChapterOptions(null)).toEqual([]);
  });
});
