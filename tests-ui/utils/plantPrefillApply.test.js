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

describe('applyPrefillToForm — photos', () => {
  const grouped = {
    photo_species: [
      { url: 'https://x/a.jpg', source_url: 'https://src/a' },
      { url: 'https://x/b.jpg', source_url: 'https://src/b' },
    ],
  };

  test('photo cochée → écrite dans le champ cible (assignTo valide) + source_url dans sources', () => {
    const out = applyPrefillToForm(
      { photo_leaf: '', sources: '' },
      base({
        groupedPrefillPhotos: grouped,
        prefillPhotoSelections: { 'photo_species:0': { checked: true, assignTo: 'photo_leaf' } },
      }),
    );
    expect(out.photo_leaf).toBe('https://x/a.jpg');
    expect(out.sources).toBe('https://src/a');
  });

  test('assignTo hors PHOTO_FIELD_KEYS → repli sur le champ source', () => {
    const out = applyPrefillToForm(
      { photo_species: '', sources: '' },
      base({
        groupedPrefillPhotos: grouped,
        prefillPhotoSelections: { 'photo_species:1': { checked: true, assignTo: 'inconnu' } },
      }),
    );
    expect(out.photo_species).toBe('https://x/b.jpg');
  });

  test('champ cible déjà rempli + !overwrite → fusion sans doublon', () => {
    const out = applyPrefillToForm(
      { photo_species: 'https://x/a.jpg\nhttps://x/z.jpg', sources: '' },
      base({
        groupedPrefillPhotos: grouped,
        prefillPhotoSelections: {
          'photo_species:0': { checked: true, assignTo: 'photo_species' },
          'photo_species:1': { checked: true, assignTo: 'photo_species' },
        },
      }),
    );
    // a.jpg déjà présent (pas de doublon), b.jpg ajouté
    expect(out.photo_species).toBe('https://x/a.jpg\nhttps://x/z.jpg\nhttps://x/b.jpg');
  });

  test('overwriteFilled → remplace le champ cible', () => {
    const out = applyPrefillToForm(
      { photo_species: 'https://x/old.jpg', sources: '' },
      base({
        overwriteFilled: true,
        groupedPrefillPhotos: grouped,
        prefillPhotoSelections: { 'photo_species:0': { checked: true, assignTo: 'photo_species' } },
      }),
    );
    expect(out.photo_species).toBe('https://x/a.jpg');
  });

  test('sélection non cochée / index invalide / url absente → ignorées', () => {
    const out = applyPrefillToForm(
      { photo_species: '', sources: '' },
      base({
        groupedPrefillPhotos: grouped,
        prefillPhotoSelections: {
          'photo_species:0': { checked: false, assignTo: 'photo_species' },
          'photo_species:9': { checked: true, assignTo: 'photo_species' },
          badkey: { checked: true, assignTo: 'photo_species' },
        },
      }),
    );
    expect(out.photo_species).toBe('');
    expect(out.sources).toBe('');
  });
});

describe('applyPrefillToForm — pureté', () => {
  test('ne mute pas le formulaire d’origine', () => {
    const prev = { name: '', photo_species: '' };
    applyPrefillToForm(
      prev,
      base({ prefillResult: { fields: { name: 'X' } }, selectedFields: { name: true } }),
    );
    expect(prev).toEqual({ name: '', photo_species: '' });
  });
});
