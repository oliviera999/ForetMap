import { describe, test, expect } from 'vitest';
import {
  plantPhotoList,
  photoAttributionFor,
  formPhotosFromPlant,
  addFormPhoto,
  photosOfKind,
  formatPhotoAttribution,
} from '../../src/utils/plantPhotos.js';

// Photos d'une fiche côté client (migration 303, `plant_photos`).

describe('plantPhotoList', () => {
  test('liste du serveur : triée par emplacement, entrées invalides écartées', () => {
    const list = plantPhotoList({
      photos: [
        { kind: 'photo_leaf', url: ' https://x/l.jpg ', credit: 'A' },
        { kind: 'photo', url: 'https://x/p.jpg', licence: 'CC0' },
        { kind: 'inconnu', url: 'https://x/z.jpg' },
        { kind: 'photo', url: '' },
      ],
    });
    expect(list.map((p) => [p.kind, p.url, p.credit, p.licence])).toEqual([
      ['photo', 'https://x/p.jpg', null, 'CC0'],
      ['photo_leaf', 'https://x/l.jpg', 'A', null],
    ]);
  });

  test('sans liste : anciens champs, crédit principal sur le même fichier seulement', () => {
    const list = plantPhotoList({
      photo: 'https://x/a.jpg',
      photo_species: 'https://x/a.jpg, https://x/b.jpg',
      photo_credit: 'Anne',
      photo_licence: 'CC BY 4.0',
    });
    expect(list.map((p) => [p.kind, p.url, p.credit])).toEqual([
      ['photo', 'https://x/a.jpg', 'Anne'],
      ['photo_species', 'https://x/a.jpg', 'Anne'],
      ['photo_species', 'https://x/b.jpg', null],
    ]);
  });
});

describe('photoAttributionFor / formatPhotoAttribution', () => {
  const plant = {
    photos: [
      { kind: 'photo', url: 'https://x/a.jpg', credit: 'Anne', licence: 'CC0' },
      { kind: 'photo_leaf', url: 'https://x/a.jpg', credit: 'Autre', licence: null },
      { kind: 'photo_fruit', url: 'https://x/f.jpg' },
    ],
  };
  test('emplacement prioritaire, sinon premier lien identique ; rien si pas d’attribution', () => {
    expect(photoAttributionFor(plant, 'https://x/a.jpg', 'photo_leaf').credit).toBe('Autre');
    expect(photoAttributionFor(plant, 'https://x/a.jpg').credit).toBe('Anne');
    expect(photoAttributionFor(plant, 'https://x/f.jpg')).toBe(null);
    expect(photoAttributionFor(plant, '')).toBe(null);
  });
  test('format « Auteur — Licence »', () => {
    expect(formatPhotoAttribution({ credit: 'Anne', licence: 'CC0' })).toBe('Anne — CC0');
    expect(formatPhotoAttribution({ credit: 'Anne', licence: null })).toBe('Anne');
    expect(formatPhotoAttribution(null)).toBe('');
  });
});

describe('formPhotosFromPlant / addFormPhoto / photosOfKind', () => {
  test('valeurs texte (jamais null) pour les champs du formulaire', () => {
    expect(formPhotosFromPlant({ photos: [{ kind: 'photo', url: 'https://x/a.jpg' }] })).toEqual([
      {
        kind: 'photo',
        url: 'https://x/a.jpg',
        credit: '',
        licence: '',
        source: '',
        source_url: '',
      },
    ]);
  });

  test('ajout en tête ou en fin de l’emplacement, sans doublon, sans muter', () => {
    const base = [
      { kind: 'photo', url: 'https://x/a.jpg' },
      { kind: 'photo_leaf', url: 'https://x/l.jpg' },
    ];
    const first = addFormPhoto(base, { kind: 'photo', url: 'https://x/n.jpg' }, 'prepend');
    expect(first.map((p) => p.url)).toEqual([
      'https://x/n.jpg',
      'https://x/a.jpg',
      'https://x/l.jpg',
    ]);
    const last = addFormPhoto(base, { kind: 'photo', url: 'https://x/n.jpg', license: 'CC0' });
    expect(last.map((p) => p.url)).toEqual([
      'https://x/a.jpg',
      'https://x/n.jpg',
      'https://x/l.jpg',
    ]);
    expect(last[1].licence).toBe('CC0');
    expect(addFormPhoto(base, { kind: 'photo', url: 'https://x/a.jpg' })).toBe(base);
    expect(base).toHaveLength(2);
  });

  test('photosOfKind garde l’index dans la liste complète', () => {
    const list = [
      { kind: 'photo', url: 'a' },
      { kind: 'photo_leaf', url: 'b' },
      { kind: 'photo_leaf', url: 'c' },
    ];
    expect(photosOfKind(list, 'photo_leaf').map(({ index }) => index)).toEqual([1, 2]);
  });
});
