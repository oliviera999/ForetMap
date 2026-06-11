import { describe, test, expect } from 'vitest';
import {
  newPlantnetIdentifySlot,
  pickPlantnetVernacularName,
  PLANTNET_IDENTIFY_ORGAN_OPTIONS,
} from '../../src/utils/plantnetHelpers.js';

describe('newPlantnetIdentifySlot', () => {
  test('retourne un objet avec les propriétés attendues', () => {
    const slot = newPlantnetIdentifySlot();
    expect(slot).toHaveProperty('key');
    expect(slot).toHaveProperty('organ', 'auto');
    expect(slot).toHaveProperty('imageData', '');
    expect(slot).toHaveProperty('fileName', '');
  });

  test('chaque appel génère une clé unique', () => {
    const s1 = newPlantnetIdentifySlot();
    const s2 = newPlantnetIdentifySlot();
    expect(s1.key).not.toBe(s2.key);
  });

  test('la clé est une chaîne non vide', () => {
    const slot = newPlantnetIdentifySlot();
    expect(typeof slot.key).toBe('string');
    expect(slot.key.length).toBeGreaterThan(0);
  });
});

describe('pickPlantnetVernacularName', () => {
  test('liste vide → chaîne vide', () => {
    expect(pickPlantnetVernacularName([])).toBe('');
    expect(pickPlantnetVernacularName(null)).toBe('');
    expect(pickPlantnetVernacularName(undefined)).toBe('');
  });

  test('liste non-tableau → chaîne vide', () => {
    expect(pickPlantnetVernacularName('not a list')).toBe('');
    expect(pickPlantnetVernacularName(42)).toBe('');
  });

  test('préfère un nom contenant des lettres accentuées FR', () => {
    // « Tométo » a un accent → score 2, « Tomato » → score 0
    const names = ['Tomato', 'Tométo'];
    expect(pickPlantnetVernacularName(names)).toBe('Tométo');
  });

  test("préfère un nom avec articles FR (de la, le, la…)", () => {
    const names = ['Wild carrot', 'Carotte des champs'];
    expect(pickPlantnetVernacularName(names)).toBe('Carotte des champs');
  });

  test("préfère un nom avec l' ou d'", () => {
    const names = ['Oak', "Chêne de l'Atlantique"];
    expect(pickPlantnetVernacularName(names)).toBe("Chêne de l'Atlantique");
  });

  test('sans indice FR, retourne le premier élément', () => {
    const names = ['Tomato', 'Love apple'];
    expect(pickPlantnetVernacularName(names)).toBe('Tomato');
  });

  test('liste avec un seul élément → cet élément', () => {
    expect(pickPlantnetVernacularName(['Tomate'])).toBe('Tomate');
  });

  test('les valeurs nulles/vides dans la liste sont filtrées', () => {
    expect(pickPlantnetVernacularName([null, '', 'Tomate'])).toBe('Tomate');
  });

  test('les éléments non-chaîne sont convertis en chaîne', () => {
    // Ni '42' ni 'Tomate' n'ont d'indice FR → score 0 pour les deux → premier élément retourné
    const result = pickPlantnetVernacularName([42, 'Tomate']);
    expect(result).toBe('42');
  });

  test('élément non-chaîne avec accent retourne bien cet élément', () => {
    // 'Tométo' a un accent → score 2 vs '42' score 0
    const result = pickPlantnetVernacularName([42, 'Tométo']);
    expect(result).toBe('Tométo');
  });
});

describe('PLANTNET_IDENTIFY_ORGAN_OPTIONS', () => {
  test('contient au moins les organes fondamentaux', () => {
    const ids = PLANTNET_IDENTIFY_ORGAN_OPTIONS.map((o) => o.id);
    expect(ids).toContain('auto');
    expect(ids).toContain('leaf');
    expect(ids).toContain('flower');
    expect(ids).toContain('fruit');
  });

  test('chaque option a un id et un label', () => {
    for (const opt of PLANTNET_IDENTIFY_ORGAN_OPTIONS) {
      expect(typeof opt.id).toBe('string');
      expect(typeof opt.label).toBe('string');
    }
  });
});
