import { describe, test, expect } from 'vitest';
import { applyPrefillToForm } from '../../src/utils/plantPrefillApply.js';

const SPECIES_FIELDS = ['name', 'scientific_name', 'description'];
const PHOTO_KEYS = new Set(['photo', 'photo_species', 'photo_leaf']);

function base(extra = {}) {
  return {
    prefillResult: { fields: {} },
    selectedFields: {},
    prefillPhotoSelections: {},
    groupedPrefillPhotos: {},
    overwriteFilled: false,
    speciesPrefillFields: SPECIES_FIELDS,
    photoFieldKeys: PHOTO_KEYS,
    ...extra,
  };
}

describe('applyPrefillToForm — champs texte', () => {
  test('champ sélectionné et vide → écrit ; non sélectionné → ignoré', () => {
    const out = applyPrefillToForm(
      { name: '', scientific_name: '' },
      base({
        prefillResult: { fields: { name: 'Pommier', scientific_name: 'Malus' } },
        selectedFields: { name: true },
      }),
    );
    expect(out.name).toBe('Pommier');
    expect(out.scientific_name).toBe('');
  });

  test('champ déjà rempli + !overwriteFilled → conservé', () => {
    const out = applyPrefillToForm(
      { name: 'Déjà là' },
      base({ prefillResult: { fields: { name: 'Pommier' } }, selectedFields: { name: true } }),
    );
    expect(out.name).toBe('Déjà là');
  });

  test('champ déjà rempli + overwriteFilled → écrasé', () => {
    const out = applyPrefillToForm(
      { name: 'Déjà là' },
      base({
        prefillResult: { fields: { name: 'Pommier' } },
        selectedFields: { name: true },
        overwriteFilled: true,
      }),
    );
    expect(out.name).toBe('Pommier');
  });

  test('valeur de pré-saisie vide/espaces → ignorée', () => {
    const out = applyPrefillToForm(
      { description: '' },
      base({
        prefillResult: { fields: { description: '   ' } },
        selectedFields: { description: true },
      }),
    );
    expect(out.description).toBe('');
  });
});

describe('applyPrefillToForm — autres noms (migration 304)', () => {
  test('le « deuxième nom » proposé remplit les autres noms du formulaire', () => {
    const out = applyPrefillToForm(
      { secondary_names: '' },
      base({
        speciesPrefillFields: ['second_name'],
        prefillResult: { fields: { second_name: 'Dent-de-lion' } },
        selectedFields: { second_name: true },
      }),
    );
    expect(out.secondary_names).toBe('Dent-de-lion');
    expect(out).not.toHaveProperty('second_name');
  });
});

describe('applyPrefillToForm — photos', () => {
  const grouped = {
    photo_species: [
      {
        url: 'https://x/a.jpg',
        source_url: 'https://src/a',
        credit: 'Anne',
        license: 'CC BY-SA 4.0',
        source: 'wikipedia',
      },
      { url: 'https://x/b.jpg', source_url: 'https://src/b' },
    ],
  };
  const urlsOf = (out, kind) => out.photos.filter((p) => p.kind === kind).map((p) => p.url);

  test('photo cochée → liste de photos, emplacement cible, AVEC auteur et licence ; source_url dans sources', () => {
    const out = applyPrefillToForm(
      { photos: [], sources: '' },
      base({
        groupedPrefillPhotos: grouped,
        prefillPhotoSelections: { 'photo_species:0': { checked: true, assignTo: 'photo_leaf' } },
      }),
    );
    expect(out.photos).toEqual([
      {
        kind: 'photo_leaf',
        url: 'https://x/a.jpg',
        credit: 'Anne',
        licence: 'CC BY-SA 4.0',
        source: 'wikipedia',
        source_url: 'https://src/a',
      },
    ]);
    expect(out.sources).toBe('https://src/a');
  });

  test('assignTo hors PHOTO_FIELD_KEYS → repli sur le champ source', () => {
    const out = applyPrefillToForm(
      { photos: [], sources: '' },
      base({
        groupedPrefillPhotos: grouped,
        prefillPhotoSelections: { 'photo_species:1': { checked: true, assignTo: 'inconnu' } },
      }),
    );
    expect(urlsOf(out, 'photo_species')).toEqual(['https://x/b.jpg']);
  });

  test('emplacement déjà rempli + !overwrite → fusion sans doublon', () => {
    const out = applyPrefillToForm(
      {
        photos: [
          { kind: 'photo_species', url: 'https://x/a.jpg', credit: 'Déjà' },
          { kind: 'photo_species', url: 'https://x/z.jpg' },
        ],
        sources: '',
      },
      base({
        groupedPrefillPhotos: grouped,
        prefillPhotoSelections: {
          'photo_species:0': { checked: true, assignTo: 'photo_species' },
          'photo_species:1': { checked: true, assignTo: 'photo_species' },
        },
      }),
    );
    // a.jpg déjà présent (pas de doublon, attribution existante gardée), b.jpg ajouté
    expect(urlsOf(out, 'photo_species')).toEqual([
      'https://x/a.jpg',
      'https://x/z.jpg',
      'https://x/b.jpg',
    ]);
    expect(out.photos[0].credit).toBe('Déjà');
  });

  test('overwriteFilled → remplace l’emplacement cible', () => {
    const out = applyPrefillToForm(
      {
        photos: [
          { kind: 'photo_species', url: 'https://x/old.jpg' },
          { kind: 'photo', url: 'https://x/main.jpg' },
        ],
        sources: '',
      },
      base({
        overwriteFilled: true,
        groupedPrefillPhotos: grouped,
        prefillPhotoSelections: { 'photo_species:0': { checked: true, assignTo: 'photo_species' } },
      }),
    );
    expect(urlsOf(out, 'photo_species')).toEqual(['https://x/a.jpg']);
    expect(urlsOf(out, 'photo')).toEqual(['https://x/main.jpg']);
  });

  test('sélection non cochée / index invalide / url absente → ignorées', () => {
    const out = applyPrefillToForm(
      { photos: [], sources: '' },
      base({
        groupedPrefillPhotos: grouped,
        prefillPhotoSelections: {
          'photo_species:0': { checked: false, assignTo: 'photo_species' },
          'photo_species:9': { checked: true, assignTo: 'photo_species' },
          badkey: { checked: true, assignTo: 'photo_species' },
        },
      }),
    );
    expect(out.photos).toEqual([]);
    expect(out.sources).toBe('');
  });
});

describe('applyPrefillToForm — pureté', () => {
  test('ne mute pas le formulaire d’origine', () => {
    const prev = { name: '', photos: [] };
    applyPrefillToForm(
      prev,
      base({ prefillResult: { fields: { name: 'X' } }, selectedFields: { name: true } }),
    );
    expect(prev).toEqual({ name: '', photos: [] });
  });
});
