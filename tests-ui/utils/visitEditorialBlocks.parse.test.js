import { describe, test, expect } from 'vitest';
import {
  parseVisitEditorialBlocksFromJson,
  normalizeVisitEditorialBlocksForSave,
} from '../../src/utils/visitEditorialBlocks.js';

describe('parseVisitEditorialBlocksFromJson', () => {
  test('vide / JSON invalide / non-tableau → []', () => {
    expect(parseVisitEditorialBlocksFromJson('')).toEqual([]);
    expect(parseVisitEditorialBlocksFromJson('{pas du json')).toEqual([]);
    expect(parseVisitEditorialBlocksFromJson('{"a":1}')).toEqual([]);
  });
  test('parse une chaîne JSON et un tableau déjà parsé', () => {
    const raw = JSON.stringify([{ type: 'paragraph', markdown: 'Salut' }]);
    const fromStr = parseVisitEditorialBlocksFromJson(raw);
    const fromArr = parseVisitEditorialBlocksFromJson([{ type: 'paragraph', markdown: 'Salut' }]);
    expect(fromStr).toEqual(fromArr);
    expect(fromStr[0]).toMatchObject({ type: 'paragraph', markdown: 'Salut', layout: 'duo', size: 'md', align: 'center' });
    expect(fromStr[0].id).toBeTruthy();
  });
  test('media_ids : entiers >0 uniques, max 2 ; valeurs invalides bornées', () => {
    const out = parseVisitEditorialBlocksFromJson([{ type: 'image', media_ids: ['3', 3, 0, -1, 5, 9], size: 'xl', layout: 'single', align: 'left' }]);
    expect(out[0].media_ids).toEqual([3, 5]);
    expect(out[0].size).toBe('md'); // 'xl' invalide → défaut md
    expect(out[0].layout).toBe('single');
    expect(out[0].align).toBe('left');
  });
});

describe('normalizeVisitEditorialBlocksForSave', () => {
  test('non-tableau → []', () => {
    expect(normalizeVisitEditorialBlocksForSave(null)).toEqual([]);
  });
  test('garde image (avec media), heading (avec texte), paragraph (avec markdown) ; filtre les vides', () => {
    const out = normalizeVisitEditorialBlocksForSave([
      { id: 'a', type: 'image', media_ids: [2, 2, 0, 7] },
      { id: 'b', type: 'image', media_ids: [] },        // vide → filtré
      { id: 'c', type: 'heading', text: '  Titre  ', level: 2 },
      { id: 'd', type: 'heading', text: '   ' },          // vide → filtré
      { id: 'e', type: 'paragraph', markdown: 'Texte' },
      { id: 'f', type: 'paragraph', markdown: '   ' },    // vide → filtré
    ]);
    expect(out.map((b) => b.type)).toEqual(['image', 'heading', 'paragraph']);
    expect(out[0].media_ids).toEqual([2, 7]);
    expect(out[1]).toEqual({ id: 'c', type: 'heading', text: 'Titre', level: 2 });
  });
});
