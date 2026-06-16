import { describe, test, expect } from 'vitest';
import {
  humanizeKey,
  inferSectionFromKey,
  scopeLabel,
  typeLabel,
  buildConstraintHelp,
} from '../../src/utils/settingDisplay.js';

describe('humanizeKey', () => {
  test('dernier segment en Title Case', () => {
    expect(humanizeKey('ui.modules.forum_enabled')).toBe('Forum Enabled');
    expect(humanizeKey('security.password_min_length')).toBe('Password Min Length');
    expect(humanizeKey('simple')).toBe('Simple');
  });
  test('vide / null → ""', () => {
    expect(humanizeKey('')).toBe('');
    expect(humanizeKey(null)).toBe('');
  });
});

describe('inferSectionFromKey', () => {
  test('classe par préfixe', () => {
    expect(inferSectionFromKey('ui.auth.x')).toBe('auth');
    expect(inferSectionFromKey('content.y')).toBe('content');
    expect(inferSectionFromKey('ui.modules.z')).toBe('modules');
    expect(inferSectionFromKey('ui.map.z')).toBe('modules');
    expect(inferSectionFromKey('tasks.a')).toBe('tasks');
    expect(inferSectionFromKey('progression.b')).toBe('progression');
    expect(inferSectionFromKey('rbac.c')).toBe('progression');
    expect(inferSectionFromKey('security.d')).toBe('security');
    expect(inferSectionFromKey('integration.e')).toBe('security');
    expect(inferSectionFromKey('system.f')).toBe('operations');
    expect(inferSectionFromKey('ops.g')).toBe('operations');
  });
  test('inconnu → other', () => {
    expect(inferSectionFromKey('autre.chose')).toBe('other');
    expect(inferSectionFromKey('')).toBe('other');
  });
});

describe('scopeLabel / typeLabel', () => {
  test('scopeLabel', () => {
    expect(scopeLabel('admin')).toBe('Admin');
    expect(scopeLabel('teacher')).toBe('n3boss');
    expect(scopeLabel('public')).toBe('Public');
    expect(scopeLabel(undefined)).toBe('Public');
  });
  test('typeLabel', () => {
    expect(typeLabel('boolean')).toBe('booléen');
    expect(typeLabel('number')).toBe('numérique');
    expect(typeLabel('enum')).toBe('liste');
    expect(typeLabel('string')).toBe('texte');
    expect(typeLabel('custom')).toBe('custom');
    expect(typeLabel(null)).toBe('inconnu');
  });
});

describe('buildConstraintHelp', () => {
  test('type seul si pas de contraintes', () => {
    expect(buildConstraintHelp({ type: 'string' })).toBe('Type: texte');
  });
  test('min/max/maxLength/valeurs/défaut, ignore les null', () => {
    expect(
      buildConstraintHelp({
        type: 'number',
        constraints: { min: 0, max: 10, maxLength: null },
        default_value: 4,
      }),
    ).toBe('Type: numérique • min 0 • max 10 • défaut: 4');
    expect(buildConstraintHelp({ type: 'enum', constraints: { values: ['a', 'b'] } })).toBe(
      'Type: liste • valeurs: a, b',
    );
  });
  test('min=0 conservé (pas traité comme absent)', () => {
    expect(buildConstraintHelp({ type: 'number', constraints: { min: 0 } })).toBe(
      'Type: numérique • min 0',
    );
  });
  test('default_value vide / null ignoré', () => {
    expect(buildConstraintHelp({ type: 'string', default_value: '' })).toBe('Type: texte');
    expect(buildConstraintHelp({ type: 'string', default_value: null })).toBe('Type: texte');
  });
});
