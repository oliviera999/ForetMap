import { describe, test, expect } from 'vitest';
import {
  DEFAULT_USER_LABEL,
  formatFullName,
  resolveSessionDisplayName,
} from '../../src/utils/appIdentity';

describe('formatFullName', () => {
  test('assemble prénom et nom', () => {
    expect(formatFullName({ first_name: 'Ada', last_name: 'Lovelace' })).toBe('Ada Lovelace');
  });

  test('tolère un champ manquant (pas d’espace résiduel)', () => {
    expect(formatFullName({ first_name: 'Ada' })).toBe('Ada');
    expect(formatFullName({ last_name: 'Lovelace' })).toBe('Lovelace');
  });

  test('chaîne vide si aucun champ (permet un repli avec ||)', () => {
    expect(formatFullName(null)).toBe('');
    expect(formatFullName({})).toBe('');
  });
});

describe('resolveSessionDisplayName', () => {
  test('le nom de session prime sur le nom de rôle', () => {
    expect(resolveSessionDisplayName('Prof Martin', 'Professeur')).toBe('Prof Martin');
  });

  test('repli sur le nom de rôle du jeton', () => {
    expect(resolveSessionDisplayName(null, 'Professeur')).toBe('Professeur');
  });

  test('repli final sur le libellé par défaut', () => {
    expect(resolveSessionDisplayName(null, null)).toBe(DEFAULT_USER_LABEL);
    expect(resolveSessionDisplayName('', '', 'Invité')).toBe('Invité');
  });

  test('les espaces de bord sont retirés', () => {
    expect(resolveSessionDisplayName('  Prof Martin  ', null)).toBe('Prof Martin');
  });
});
