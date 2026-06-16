import { describe, test, expect } from 'vitest';
import {
  resolveSettingLabel,
  buildSettingSections,
  filterSettingSections,
  countSectionRows,
} from '../../src/utils/settingsAdminSections.js';

const ROLE_TERMS = {
  studentSingular: 'n3beur',
  teacherSingular: 'n3boss',
  teacherShort: 'n3boss',
};

describe('resolveSettingLabel', () => {
  test('libellé statique des clés connues', () => {
    expect(resolveSettingLabel('ui.auth.allow_register', ROLE_TERMS)).toBe(
      'Afficher "Créer un compte"',
    );
  });
  test('libellés dynamiques construits depuis la terminologie des rôles', () => {
    expect(resolveSettingLabel('ui.auth.allow_google_student', ROLE_TERMS)).toBe(
      'Afficher "Google n3beur"',
    );
    expect(resolveSettingLabel('ui.auth.allow_google_teacher', ROLE_TERMS)).toBe(
      'Afficher "Google n3boss"',
    );
    expect(resolveSettingLabel('ui.map.default_map_student', ROLE_TERMS)).toBe(
      'Carte par défaut (n3beur)',
    );
    expect(resolveSettingLabel('ui.map.default_map_teacher', ROLE_TERMS)).toBe(
      'Carte par défaut (n3boss)',
    );
  });
  test('clé inconnue → humanisation du dernier segment', () => {
    expect(resolveSettingLabel('xyz.some_new_flag', ROLE_TERMS)).toBe('Some New Flag');
  });
});

describe('buildSettingSections', () => {
  const settings = [
    { key: 'system.maintenance_mode', type: 'boolean' },
    { key: 'ui.auth.welcome_message', type: 'string' },
    { key: 'ui.auth.allow_register', type: 'boolean' },
    { key: 'xyz.unknown_key', type: 'string' },
  ];
  test('groupe par section, sections triées par ordre, lignes par ordre de champ', () => {
    const sections = buildSettingSections(settings);
    expect(sections.map((s) => s.id)).toEqual(['auth', 'operations', 'other']);
    expect(sections[0].title).toBe('Accueil & authentification');
    expect(sections[0].rows.map((r) => r.key)).toEqual([
      'ui.auth.allow_register', // order 10
      'ui.auth.welcome_message', // order 60
    ]);
  });
  test('clé inconnue : section inférée (other), ordre de champ 999, _multiline false', () => {
    const sections = buildSettingSections(settings);
    const other = sections.find((s) => s.id === 'other');
    expect(other.rows[0]._fieldOrder).toBe(999);
    expect(other.rows[0]._multiline).toBe(false);
  });
  test('métadonnée multiline propagée sur la ligne', () => {
    const [auth] = buildSettingSections([{ key: 'ui.auth.welcome_message' }]);
    expect(auth.rows[0]._multiline).toBe(true);
  });
  test('entrée absente → aucune section', () => {
    expect(buildSettingSections(undefined)).toEqual([]);
  });
});

describe('filterSettingSections + countSectionRows', () => {
  const sections = buildSettingSections([
    { key: 'system.maintenance_mode', type: 'boolean', scope: 'admin' },
    {
      key: 'security.password_min_length',
      type: 'number',
      scope: 'admin',
      constraints: { min: 4 },
    },
    { key: 'ui.auth.allow_register', type: 'boolean', scope: 'public' },
  ]);
  test('requête vide → même référence, comptage total', () => {
    expect(filterSettingSections(sections, '', ROLE_TERMS)).toBe(sections);
    expect(countSectionRows(sections)).toBe(3);
  });
  test('filtre sur le libellé (insensible à la casse), sections vides retirées', () => {
    const out = filterSettingSections(sections, 'MAINTENANCE', ROLE_TERMS);
    expect(out.map((s) => s.id)).toEqual(['operations']);
    expect(countSectionRows(out)).toBe(1);
  });
  test('filtre sur la clé brute et sur le texte d’aide (contraintes)', () => {
    expect(countSectionRows(filterSettingSections(sections, 'password_min', ROLE_TERMS))).toBe(1);
    expect(countSectionRows(filterSettingSections(sections, 'min 4', ROLE_TERMS))).toBe(1);
  });
  test('filtre sur la portée (Public)', () => {
    const out = filterSettingSections(sections, 'public', ROLE_TERMS);
    expect(out.map((s) => s.id)).toEqual(['auth']);
  });
  test('aucune correspondance → liste vide', () => {
    expect(filterSettingSections(sections, 'zzz-introuvable', ROLE_TERMS)).toEqual([]);
    expect(countSectionRows([])).toBe(0);
  });
});
