import { describe, test, expect } from 'vitest';
import {
  toBool,
  buildClassesById,
  playerClassName,
  playerDisplayName,
} from '../../src/gl/utils/glPlayersPanel.js';

describe('glPlayersPanel - toBool', () => {
  test('convertit 0/1 numériques et chaînes', () => {
    expect(toBool(1)).toBe(true);
    expect(toBool(0)).toBe(false);
    expect(toBool('1')).toBe(true);
    expect(toBool('0')).toBe(false);
  });

  test('gère booléens et valeurs vides', () => {
    expect(toBool(true)).toBe(true);
    expect(toBool(false)).toBe(false);
    expect(toBool(null)).toBe(false);
    expect(toBool(undefined)).toBe(false);
    expect(toBool('')).toBe(false);
  });
});

describe('glPlayersPanel - buildClassesById', () => {
  test('indexe par id numérique', () => {
    const map = buildClassesById([{ id: '3', name: 'CM2' }, { id: 5, name: 'CE1' }]);
    expect(map.get(3)).toEqual({ id: '3', name: 'CM2' });
    expect(map.get(5)).toEqual({ id: 5, name: 'CE1' });
    expect(map.size).toBe(2);
  });

  test('renvoie une Map vide pour une entrée nulle', () => {
    expect(buildClassesById(null).size).toBe(0);
    expect(buildClassesById(undefined).size).toBe(0);
    expect(buildClassesById([]).size).toBe(0);
  });
});

describe('glPlayersPanel - playerClassName', () => {
  const classesById = buildClassesById([{ id: 7, name: 'CM1' }]);

  test('utilise le nom indexé en priorité', () => {
    expect(playerClassName({ class_id: 7, class_name: 'Autre' }, classesById)).toBe('CM1');
  });

  test('retombe sur class_name puis sur tiret', () => {
    expect(playerClassName({ class_id: 99, class_name: 'Repli' }, classesById)).toBe('Repli');
    expect(playerClassName({ class_id: 99 }, classesById)).toBe('—');
    expect(playerClassName({}, classesById)).toBe('—');
  });

  test('tolère un index absent', () => {
    expect(playerClassName({ class_name: 'X' }, null)).toBe('X');
  });
});

describe('glPlayersPanel - playerDisplayName', () => {
  test('assemble prénom et nom', () => {
    expect(playerDisplayName({ first_name: 'Ada', last_name: 'Lovelace' })).toBe('Ada Lovelace');
  });

  test('nettoie les espaces et retombe sur tiret', () => {
    expect(playerDisplayName({ first_name: 'Ada' })).toBe('Ada');
    expect(playerDisplayName({ last_name: 'Lovelace' })).toBe('Lovelace');
    expect(playerDisplayName({})).toBe('—');
    expect(playerDisplayName(null)).toBe('—');
  });
});
