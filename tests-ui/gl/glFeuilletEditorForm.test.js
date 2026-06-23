import { describe, test, expect } from 'vitest';
import {
  snakeToCamel,
  EMPTY_FORM,
  feuilletToForm,
  formToPayload,
  filterFeuilletItems,
} from '../../src/gl/utils/glFeuilletEditorForm.js';

describe('glFeuilletEditorForm', () => {
  test('snakeToCamel convertit les clés', () => {
    expect(snakeToCamel('feuillet_code')).toBe('feuilletCode');
    expect(snakeToCamel('image_coupe_url')).toBe('imageCoupeUrl');
    expect(snakeToCamel('type')).toBe('type');
  });

  test('feuilletToForm mappe le détail camelCase vers le formulaire', () => {
    const form = feuilletToForm({
      feuilletCode: 'cop-cover',
      type: 'copiste',
      titre: 'Couverture',
      biomeSlug: 'sahara',
      ordreVoyage: 10,
      vierge: true,
      coutGemme: 0,
      statut: 'actif',
    });
    expect(form.feuillet_code).toBe('cop-cover');
    expect(form.biome_slug).toBe('sahara');
    expect(form.ordre_voyage).toBe('10');
    expect(form.vierge).toBe('oui');
    expect(form.cout_gemme).toBe('0');
    expect(form.titre).toBe('Couverture');
    expect(form.liasse).toBe(''); // champ absent → défaut vierge
  });

  test('feuilletToForm : vierge false → non, valeurs nulles → vide', () => {
    const form = feuilletToForm({ feuilletCode: 'x', vierge: false, titre: null });
    expect(form.vierge).toBe('non');
    expect(form.titre).toBe('');
  });

  test('feuilletToForm sans fiche renvoie le formulaire vierge', () => {
    expect(feuilletToForm(null)).toEqual(EMPTY_FORM);
  });

  test('formToPayload : trim + clés snake_case complètes', () => {
    const payload = formToPayload({
      ...EMPTY_FORM,
      feuillet_code: 'c',
      titre: '  Titre  ',
      biome_slug: 'sahara',
    });
    expect(payload.titre).toBe('Titre');
    expect(payload.biome_slug).toBe('sahara');
    expect(Object.keys(payload)).toContain('mode_apparition');
    expect(Object.keys(payload)).toContain('texte');
  });

  test('filterFeuilletItems filtre par q / type / biome / statut', () => {
    const items = [
      {
        feuillet_code: 'cop-cover',
        titre: 'Couverture',
        type: 'copiste',
        liasse: 'I',
        biome_slug: 'sahara',
        statut: 'actif',
      },
      {
        feuillet_code: 'ep-I-02',
        titre: 'Le corbeau',
        type: 'feuillet',
        liasse: 'I',
        biome_slug: 'jungle_afc',
        statut: 'inactif',
      },
    ];
    expect(filterFeuilletItems(items, { q: 'corbeau' }).map((r) => r.feuillet_code)).toEqual([
      'ep-I-02',
    ]);
    expect(filterFeuilletItems(items, { q: 'cop-' }).map((r) => r.feuillet_code)).toEqual([
      'cop-cover',
    ]);
    expect(filterFeuilletItems(items, { type: 'copiste' })).toHaveLength(1);
    expect(filterFeuilletItems(items, { biome: 'jungle_afc' })).toHaveLength(1);
    expect(filterFeuilletItems(items, { statut: 'actif' })).toHaveLength(1);
    expect(filterFeuilletItems(items, {})).toHaveLength(2);
  });
});
