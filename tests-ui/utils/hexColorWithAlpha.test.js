import { describe, test, expect } from 'vitest';
import {
  DEFAULT_PICKER_HEX,
  applyPickedHexColor,
  colorPickerValue,
  isHexColorWithOptionalAlpha,
  splitHexColor,
} from '../../src/utils/hexColorWithAlpha.js';

describe('splitHexColor', () => {
  test('sépare teinte et alpha', () => {
    expect(splitHexColor('#86efac90')).toEqual({ rgb: '#86efac', alpha: '90' });
    expect(splitHexColor('#86efac')).toEqual({ rgb: '#86efac', alpha: '' });
  });

  test('normalise la casse et les espaces', () => {
    expect(splitHexColor('  #86EFAC90 ')).toEqual({ rgb: '#86efac', alpha: '90' });
  });

  test('développe la forme courte (le sélecteur natif la refuse)', () => {
    expect(splitHexColor('#abc')).toEqual({ rgb: '#aabbcc', alpha: '' });
  });

  test('rejette ce qui n’est pas une couleur exploitable', () => {
    for (const bad of ['', '   ', 'rouge', '#12345', '#1234567', '86efac', null, undefined]) {
      expect(splitHexColor(bad)).toBe(null);
    }
  });
});

describe('colorPickerValue', () => {
  test('ne rend que la teinte sur 6 chiffres', () => {
    expect(colorPickerValue('#86efac90')).toBe('#86efac');
    expect(colorPickerValue('#86efac')).toBe('#86efac');
  });

  test('retombe sur le défaut pour une saisie invalide ou en cours de frappe', () => {
    expect(colorPickerValue('#86ef')).toBe(DEFAULT_PICKER_HEX);
    expect(colorPickerValue('')).toBe(DEFAULT_PICKER_HEX);
    expect(colorPickerValue('#12', '#000000')).toBe('#000000');
  });
});

describe('applyPickedHexColor', () => {
  test('conserve l’alpha de la valeur courante', () => {
    expect(applyPickedHexColor('#86efac90', '#fca5a5')).toBe('#fca5a590');
  });

  test('sans alpha courant, la teinte seule est retenue', () => {
    expect(applyPickedHexColor('#86efac', '#fca5a5')).toBe('#fca5a5');
  });

  test('une valeur courante invalide n’invente pas d’alpha', () => {
    expect(applyPickedHexColor('nawak', '#fca5a5')).toBe('#fca5a5');
    expect(applyPickedHexColor('', '#fca5a5')).toBe('#fca5a5');
  });

  test('une teinte choisie invalide laisse la valeur courante intacte', () => {
    expect(applyPickedHexColor('#86efac90', 'nawak')).toBe('#86efac90');
  });
});

describe('isHexColorWithOptionalAlpha', () => {
  test('accepte 6 et 8 chiffres, refuse le reste', () => {
    expect(isHexColorWithOptionalAlpha('#86efac')).toBe(true);
    expect(isHexColorWithOptionalAlpha('#86efac90')).toBe(true);
    expect(isHexColorWithOptionalAlpha('#86efac9')).toBe(false);
  });
});
