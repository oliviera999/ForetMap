import { describe, test, expect } from 'vitest';
import {
  pickPlantnetVernacularName,
  prefillPhotoSlotKey,
  findFirstBiodivHeroPhotoCandidate,
} from '../../src/utils/biodivPlantForm.js';

describe('pickPlantnetVernacularName', () => {
  test('liste vide / non-tableau → ""', () => {
    expect(pickPlantnetVernacularName([])).toBe('');
    expect(pickPlantnetVernacularName(null)).toBe('');
    expect(pickPlantnetVernacularName(['  ', ''])).toBe('');
  });
  test('privilégie un nom à consonance française (accents)', () => {
    expect(pickPlantnetVernacularName(['Common daisy', 'Pâquerette'])).toBe('Pâquerette');
  });
  test('privilégie un nom avec article élidé', () => {
    expect(pickPlantnetVernacularName(['Dandelion', "Pissenlit d'automne"])).toBe(
      "Pissenlit d'automne",
    );
  });
  test('sinon le premier de la liste (trim)', () => {
    expect(pickPlantnetVernacularName([' Nettle ', 'Stinging nettle'])).toBe('Nettle');
  });
});

describe('prefillPhotoSlotKey', () => {
  test('compose field:idx (trim + Number)', () => {
    expect(prefillPhotoSlotKey(' photo_leaf ', 2)).toBe('photo_leaf:2');
    expect(prefillPhotoSlotKey('photo', '0')).toBe('photo:0');
  });
});

describe('findFirstBiodivHeroPhotoCandidate', () => {
  test('photo directe (http) prioritaire', () => {
    expect(findFirstBiodivHeroPhotoCandidate({ photo: 'https://x.fr/a.jpg' })).toEqual({
      kind: 'direct',
      src: 'https://x.fr/a.jpg',
    });
  });
  test('page fichier Commons en .jpg → direct (URL brute, extension image détectée avant)', () => {
    const url = 'https://commons.wikimedia.org/wiki/File:Rosa.jpg';
    expect(findFirstBiodivHeroPhotoCandidate({ photo: url })).toEqual({ kind: 'direct', src: url });
  });
  test('page fichier Commons sans extension image → conversion Special:FilePath', () => {
    expect(
      findFirstBiodivHeroPhotoCandidate({
        photo: 'https://commons.wikimedia.org/wiki/File:Rosa_canina',
      }),
    ).toEqual({
      kind: 'direct',
      src: 'https://commons.wikimedia.org/wiki/Special:FilePath/Rosa_canina',
    });
  });
  test('catégorie Commons → categoryUrl', () => {
    const url = 'https://commons.wikimedia.org/wiki/Category:Rosa';
    expect(findFirstBiodivHeroPhotoCandidate({ photo: url })).toEqual({
      kind: 'category',
      categoryUrl: url,
    });
  });
  test('priorité photo puis photo_species ; null si rien d’exploitable', () => {
    expect(
      findFirstBiodivHeroPhotoCandidate({ photo: 'pas une url', photo_species: '/uploads/x.png' }),
    ).toEqual({ kind: 'direct', src: '/uploads/x.png' });
    expect(findFirstBiodivHeroPhotoCandidate({ photo: 'texte', photo_species: '' })).toBe(null);
  });
});
