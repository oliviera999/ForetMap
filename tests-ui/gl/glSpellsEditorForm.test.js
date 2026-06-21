import { describe, test, expect } from 'vitest';
import {
  EMPTY_FORM,
  FORM_FIELDS,
  TEXTAREA_FIELDS,
  filterSpells,
  formToPayload,
  spellToForm,
} from '../../src/gl/utils/glSpellsEditorForm.js';

describe('glSpellsEditorForm — constantes', () => {
  test('FORM_FIELDS couvre exactement les clés de EMPTY_FORM', () => {
    expect([...FORM_FIELDS].sort()).toEqual(Object.keys(EMPTY_FORM).sort());
  });

  test('TEXTAREA_FIELDS contient les champs multi-lignes', () => {
    expect(TEXTAREA_FIELDS.has('effet_court')).toBe(true);
    expect(TEXTAREA_FIELDS.has('effet_detaille')).toBe(true);
    expect(TEXTAREA_FIELDS.has('notes_pedagogiques')).toBe(true);
    expect(TEXTAREA_FIELDS.has('nom')).toBe(false);
  });
});

describe('spellToForm', () => {
  test('sans fiche : renvoie une copie de EMPTY_FORM', () => {
    const form = spellToForm(null);
    expect(form).toEqual(EMPTY_FORM);
    expect(form).not.toBe(EMPTY_FORM);
  });

  test('convertit toutes les valeurs en chaînes', () => {
    const form = spellToForm({ nom: 'Aguamenti', cout_total_eq: 42 });
    expect(form.nom).toBe('Aguamenti');
    expect(form.cout_total_eq).toBe('42');
  });

  test('coûts manquants reviennent à "0"', () => {
    const form = spellToForm({ nom: 'X' });
    expect(form.cout_gemmes).toBe('0');
    expect(form.cout_coeurs).toBe('0');
  });

  test('coûts numériques sont stringifiés', () => {
    const form = spellToForm({ cout_gemmes: 3, cout_coeurs: 0 });
    expect(form.cout_gemmes).toBe('3');
    expect(form.cout_coeurs).toBe('0');
  });

  test('valeurs nulles → chaîne vide pour les champs non-coût', () => {
    const form = spellToForm({ nom: null, portee: undefined });
    expect(form.nom).toBe('');
    expect(form.portee).toBe('');
  });

  test('cree_le tronqué à AAAA-MM-JJ', () => {
    const form = spellToForm({ cree_le: '2026-06-13T12:34:56.000Z' });
    expect(form.cree_le).toBe('2026-06-13');
  });

  test('ignore les clés inconnues de la fiche', () => {
    const form = spellToForm({ inconnu: 'zzz', nom: 'Y' });
    expect(form.inconnu).toBeUndefined();
    expect(form.nom).toBe('Y');
  });
});

describe('formToPayload', () => {
  test('coûts convertis en nombres', () => {
    const payload = formToPayload({ ...EMPTY_FORM, cout_gemmes: '5', cout_coeurs: '2' });
    expect(payload.cout_gemmes).toBe(5);
    expect(payload.cout_coeurs).toBe(2);
  });

  test('coûts non numériques → 0', () => {
    const payload = formToPayload({ ...EMPTY_FORM, cout_gemmes: 'abc', cout_coeurs: '' });
    expect(payload.cout_gemmes).toBe(0);
    expect(payload.cout_coeurs).toBe(0);
  });

  test("spell_code épuré sert aussi d'id", () => {
    const payload = formToPayload({ ...EMPTY_FORM, spell_code: '  AGUA  ' });
    expect(payload.spell_code).toBe('AGUA');
    expect(payload.id).toBe('AGUA');
  });

  test('spell_code vide → spell_code et id undefined', () => {
    const payload = formToPayload({ ...EMPTY_FORM, spell_code: '   ' });
    expect(payload.spell_code).toBeUndefined();
    expect(payload.id).toBeUndefined();
  });

  test('conserve les autres champs du formulaire', () => {
    const payload = formToPayload({ ...EMPTY_FORM, nom: 'Z', statut: 'propose' });
    expect(payload.nom).toBe('Z');
    expect(payload.statut).toBe('propose');
  });
});

describe('filterSpells', () => {
  const ITEMS = [
    { spell_code: 'AGUA', nom: 'Aguamenti' },
    { spell_code: 'IGNI', nom: 'Incendio' },
    { spell_code: 'GLACE', nom: 'Glaciation' },
  ];

  test('requête vide : renvoie la liste telle quelle', () => {
    expect(filterSpells(ITEMS, '')).toBe(ITEMS);
    expect(filterSpells(ITEMS, '   ')).toBe(ITEMS);
  });

  test('filtre par nom (insensible à la casse)', () => {
    expect(filterSpells(ITEMS, 'agua')).toEqual([{ spell_code: 'AGUA', nom: 'Aguamenti' }]);
  });

  test('filtre par code', () => {
    expect(filterSpells(ITEMS, 'IGNI')).toEqual([{ spell_code: 'IGNI', nom: 'Incendio' }]);
  });

  test('aucune correspondance : liste vide', () => {
    expect(filterSpells(ITEMS, 'zzz')).toEqual([]);
  });

  test('entrée non-tableau : renvoie un tableau vide', () => {
    expect(filterSpells(null, 'a')).toEqual([]);
    expect(filterSpells(undefined, '')).toEqual([]);
  });
});
