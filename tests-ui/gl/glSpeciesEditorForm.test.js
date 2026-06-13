import { describe, test, expect } from 'vitest';
import {
  TEXTAREA_FIELDS,
  EMPTY_FORM,
  speciesToForm,
  formToPayload,
  filterSpeciesItems,
} from '../../src/gl/utils/glSpeciesEditorForm.js';

describe('glSpeciesEditorForm - constantes', () => {
  test('EMPTY_FORM a les valeurs par défaut attendues', () => {
    expect(EMPTY_FORM.type).toBe('faune');
    expect(EMPTY_FORM.statut).toBe('actif');
    expect(EMPTY_FORM.species_code).toBe('');
  });

  test('TEXTAREA_FIELDS contient les champs multilignes', () => {
    expect(TEXTAREA_FIELDS.has('role_ecologique')).toBe(true);
    expect(TEXTAREA_FIELDS.has('anecdote')).toBe(true);
    expect(TEXTAREA_FIELDS.has('nom_commun')).toBe(false);
  });
});

describe('glSpeciesEditorForm - speciesToForm', () => {
  test('renvoie un formulaire vierge (copie) pour une entrée nulle', () => {
    const form = speciesToForm(null);
    expect(form).toEqual(EMPTY_FORM);
    expect(form).not.toBe(EMPTY_FORM);
  });

  test('convertit chaque colonne en chaîne et vide les valeurs nulles', () => {
    const form = speciesToForm({
      species_code: 42,
      nom_commun: 'Loup',
      present_dans_qcm: 1,
      statut_iucn: null,
    });
    expect(form.species_code).toBe('42');
    expect(form.nom_commun).toBe('Loup');
    expect(form.present_dans_qcm).toBe('1');
    expect(form.statut_iucn).toBe('');
  });

  test('ignore les clés inconnues de la fiche', () => {
    const form = speciesToForm({ nom_commun: 'Renard', inconnu: 'x' });
    expect(form).not.toHaveProperty('inconnu');
  });
});

describe('glSpeciesEditorForm - formToPayload', () => {
  test('retire species_code quand il est vide', () => {
    const payload = formToPayload({ ...EMPTY_FORM, nom_commun: 'A' });
    expect(payload).not.toHaveProperty('species_code');
    expect(payload.nom_commun).toBe('A');
  });

  test('retire species_code composé uniquement d’espaces', () => {
    const payload = formToPayload({ ...EMPTY_FORM, species_code: '   ' });
    expect(payload).not.toHaveProperty('species_code');
  });

  test('conserve species_code renseigné et ne mute pas la source', () => {
    const form = { ...EMPTY_FORM, species_code: 'SP1' };
    const payload = formToPayload(form);
    expect(payload.species_code).toBe('SP1');
    expect(form.species_code).toBe('SP1');
    expect(payload).not.toBe(form);
  });
});

describe('glSpeciesEditorForm - filterSpeciesItems', () => {
  const items = [
    { species_code: 'F1', type: 'faune', nom_commun: 'Loup gris' },
    { species_code: 'F2', type: 'flore', nom_commun: 'Chêne vert' },
    { species_code: 'F3', type: 'faune', nom_commun: 'Renard roux' },
  ];

  test('renvoie tout sans filtre', () => {
    expect(filterSpeciesItems(items)).toHaveLength(3);
  });

  test('filtre par type', () => {
    const out = filterSpeciesItems(items, { type: 'faune' });
    expect(out.map((r) => r.species_code)).toEqual(['F1', 'F3']);
  });

  test('filtre par recherche texte (nom commun, insensible à la casse)', () => {
    const out = filterSpeciesItems(items, { q: 'CHÊNE' });
    expect(out).toHaveLength(1);
    expect(out[0].species_code).toBe('F2');
  });

  test('filtre par recherche texte sur le code', () => {
    const out = filterSpeciesItems(items, { q: 'f3' });
    expect(out.map((r) => r.species_code)).toEqual(['F3']);
  });

  test('combine type et recherche', () => {
    const out = filterSpeciesItems(items, { type: 'faune', q: 'renard' });
    expect(out.map((r) => r.species_code)).toEqual(['F3']);
  });

  test('tolère une entrée non tableau', () => {
    expect(filterSpeciesItems(null)).toEqual([]);
    expect(filterSpeciesItems(undefined, { q: 'x' })).toEqual([]);
  });
});
