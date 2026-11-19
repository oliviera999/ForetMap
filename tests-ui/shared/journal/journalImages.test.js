import { describe, test, expect } from 'vitest';
import { assetsNotInBody } from '../../../src/shared/journal/journalImages.js';

describe('assetsNotInBody — vignettes sans doublon des images du texte', () => {
  const a1 = { id: 1, url: '/api/user-journal/assets/1/file' };
  const a2 = { id: 2, url: '/api/user-journal/assets/2/file' };

  test('retire les illustrations déjà affichées dans le texte', () => {
    const body = 'Vu ce matin\n\n<img src="/api/user-journal/assets/1/file" alt="mare">';
    expect(assetsNotInBody([a1, a2], body)).toEqual([a2]);
  });

  test('garde tout quand le texte est vide (anciennes observations reprises)', () => {
    expect(assetsNotInBody([a1, a2], '')).toEqual([a1, a2]);
  });

  test('ignore la requête d’une URL signée (G&L)', () => {
    const signed = { id: 3, url: '/uploads/gl-player-journal/7/x.jpg?exp=2&sig=new' };
    const body = '<img src="/uploads/gl-player-journal/7/x.jpg?exp=1&sig=old">';
    expect(assetsNotInBody([signed], body)).toEqual([]);
  });

  test('tolère une liste absente', () => {
    expect(assetsNotInBody(undefined, 'x')).toEqual([]);
  });
});
