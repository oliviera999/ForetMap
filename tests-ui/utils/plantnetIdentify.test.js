import { describe, test, expect } from 'vitest';
import {
  filterNonEmptyIdentifySlots,
  buildPlantnetIdentifyImages,
  derivePlantnetNameUpdate,
} from '../../src/utils/plantnetIdentify.js';

describe('filterNonEmptyIdentifySlots', () => {
  test('ne garde que les slots à imageData non vide (après trim)', () => {
    const slots = [
      { key: 'a', imageData: 'data:1' },
      { key: 'b', imageData: '   ' },
      { key: 'c', imageData: '' },
      { key: 'd' },
      { key: 'e', imageData: 'data:2' },
    ];
    expect(filterNonEmptyIdentifySlots(slots).map((s) => s.key)).toEqual(['a', 'e']);
  });
  test('entrée non-tableau → []', () => {
    expect(filterNonEmptyIdentifySlots(null)).toEqual([]);
    expect(filterNonEmptyIdentifySlots(undefined)).toEqual([]);
  });
});

describe('buildPlantnetIdentifyImages', () => {
  test('mappe { organ, imageData } ; organ par défaut « auto »', () => {
    const slots = [
      { organ: 'leaf', imageData: 'd1' },
      { imageData: 'd2' },
      { organ: 'flower', imageData: '  ' },
    ];
    expect(buildPlantnetIdentifyImages(slots)).toEqual([
      { organ: 'leaf', imageData: 'd1' },
      { organ: 'auto', imageData: 'd2' },
    ]);
  });
  test('aucun slot exploitable → []', () => {
    expect(buildPlantnetIdentifyImages([{ imageData: '' }])).toEqual([]);
  });
});

describe('derivePlantnetNameUpdate', () => {
  const form = { scientific_name: 'Ancien sci', name: 'Ancien nom' };
  test('prédiction invalide → {} (no-op)', () => {
    expect(derivePlantnetNameUpdate(null, form)).toEqual({});
    expect(derivePlantnetNameUpdate('x', form)).toEqual({});
  });
  test('nom scientifique + nom usuel « à consonance FR » (accent) depuis commonNames', () => {
    // pickPlantnetVernacularName privilégie un nom à consonance française (accents / articles
    // élidés) ; « Néflier » (accent é) est retenu plutôt que « Apple ».
    const out = derivePlantnetNameUpdate(
      { scientificName: 'Malus domestica L.', commonNames: ['Apple', 'Néflier'] },
      form,
    );
    expect(out.scientific_name).toBe('Malus domestica L.');
    expect(out.name).toBe('Néflier');
  });
  test('sans nom usuel → repli sur scientificNameWithoutAuthor', () => {
    const out = derivePlantnetNameUpdate(
      { scientificNameWithoutAuthor: 'Malus domestica', commonNames: [] },
      form,
    );
    expect(out.scientific_name).toBe('Malus domestica');
    expect(out.name).toBe('Malus domestica');
  });
  test('prédiction vide → conserve les valeurs courantes du formulaire', () => {
    expect(derivePlantnetNameUpdate({}, form)).toEqual({
      scientific_name: 'Ancien sci',
      name: 'Ancien nom',
    });
  });
  test('troncature à 200 caractères', () => {
    const long = 'x'.repeat(250);
    const out = derivePlantnetNameUpdate(
      { scientificName: long, scientificNameWithoutAuthor: long },
      form,
    );
    expect(out.scientific_name).toHaveLength(200);
    expect(out.name).toHaveLength(200);
  });
});
