import { describe, test, expect } from 'vitest';
import {
  buildNewEditorialBlock,
  updateEditorialBlockById,
  moveEditorialBlockById,
  removeEditorialBlockById,
} from '../../src/utils/visitEditorialBlocks.js';

describe('buildNewEditorialBlock', () => {
  test('paragraph (type inconnu inclus) → bloc paragraphe vide', () => {
    expect(buildNewEditorialBlock('paragraph', 'p1')).toEqual({
      id: 'p1',
      type: 'paragraph',
      markdown: '',
    });
    // tout type non heading/image retombe sur paragraphe (comportement historique)
    expect(buildNewEditorialBlock('autre', 'x1')).toEqual({
      id: 'x1',
      type: 'paragraph',
      markdown: '',
    });
  });
  test('heading → niveau 3 + texte « Intertitre »', () => {
    expect(buildNewEditorialBlock('heading', 'h1')).toEqual({
      id: 'h1',
      type: 'heading',
      level: 3,
      text: 'Intertitre',
    });
  });
  test('image → défauts single/md/center, media_ids vide, légende vide', () => {
    expect(buildNewEditorialBlock('image', 'i1')).toEqual({
      id: 'i1',
      type: 'image',
      media_ids: [],
      layout: 'single',
      size: 'md',
      align: 'center',
      caption: '',
    });
  });
});

describe('updateEditorialBlockById', () => {
  const blocks = [
    { id: 'a', type: 'paragraph', markdown: 'x' },
    { id: 'b', type: 'heading', level: 3, text: 'T' },
  ];
  test('applique le patch uniquement au bloc ciblé (merge superficiel)', () => {
    const out = updateEditorialBlockById(blocks, 'b', { text: 'Nouveau' });
    expect(out[1]).toEqual({ id: 'b', type: 'heading', level: 3, text: 'Nouveau' });
    expect(out[0]).toBe(blocks[0]); // bloc non ciblé conservé par référence
  });
  test('id introuvable → tableau inchangé (mêmes valeurs)', () => {
    expect(updateEditorialBlockById(blocks, 'zzz', { text: 'X' })).toEqual(blocks);
  });
});

describe('moveEditorialBlockById', () => {
  const blocks = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  test('descend (delta +1)', () => {
    expect(moveEditorialBlockById(blocks, 'a', 1).map((b) => b.id)).toEqual(['b', 'a', 'c']);
  });
  test('monte (delta -1)', () => {
    expect(moveEditorialBlockById(blocks, 'c', -1).map((b) => b.id)).toEqual(['a', 'c', 'b']);
  });
  test('borné en tête : monter le 1er = no-op (référence identique)', () => {
    expect(moveEditorialBlockById(blocks, 'a', -1)).toBe(blocks);
  });
  test('borné en queue : descendre le dernier = no-op (référence identique)', () => {
    expect(moveEditorialBlockById(blocks, 'c', 1)).toBe(blocks);
  });
  test('delta dépassant les bornes → clampé au bord', () => {
    expect(moveEditorialBlockById(blocks, 'a', 99).map((b) => b.id)).toEqual(['b', 'c', 'a']);
    expect(moveEditorialBlockById(blocks, 'c', -99).map((b) => b.id)).toEqual(['c', 'a', 'b']);
  });
  test('id introuvable → no-op (référence identique)', () => {
    expect(moveEditorialBlockById(blocks, 'zzz', 1)).toBe(blocks);
  });
});

describe('removeEditorialBlockById', () => {
  const blocks = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  test('retire le bloc ciblé', () => {
    expect(removeEditorialBlockById(blocks, 'b').map((b) => b.id)).toEqual(['a', 'c']);
  });
  test('id introuvable → copie sans suppression', () => {
    expect(removeEditorialBlockById(blocks, 'zzz').map((b) => b.id)).toEqual(['a', 'b', 'c']);
  });
});
