import { describe, test, expect } from 'vitest';
import {
  estimateDataUrlBytes,
  deriveProfileTypeLabel,
  isTeacherLikeAccount,
  profileUpdateEndpoint,
  buildProfileAffiliationOptions,
  buildVisitMascotOptions,
  validateProfileEditorFields,
} from '../../src/utils/studentProfileFields.js';
import { getVisitMascotCatalog } from '../../src/utils/visitMascotCatalog.js';

const ROLE_TERMS = { teacherShort: 'n3boss', studentSingular: 'n3beur' };

describe('estimateDataUrlBytes', () => {
  test('0 pour un data URL vide ou sans payload', () => {
    expect(estimateDataUrlBytes('')).toBe(0);
    expect(estimateDataUrlBytes(null)).toBe(0);
    expect(estimateDataUrlBytes('data:image/png;base64,')).toBe(0);
  });

  test('décompte base64 avec padding (== / = / aucun)', () => {
    // 'a' → 'YQ==' (1 octet), 'ab' → 'YWI=' (2), 'abc' → 'YWJj' (3)
    expect(estimateDataUrlBytes('data:text/plain;base64,YQ==')).toBe(1);
    expect(estimateDataUrlBytes('data:text/plain;base64,YWI=')).toBe(2);
    expect(estimateDataUrlBytes('data:text/plain;base64,YWJj')).toBe(3);
  });
});

describe('deriveProfileTypeLabel / isTeacherLikeAccount / profileUpdateEndpoint', () => {
  test('admin par roleSlug', () => {
    const s = { id: 7, auth: { roleSlug: 'admin' } };
    expect(deriveProfileTypeLabel(s, ROLE_TERMS)).toBe('admin');
    expect(isTeacherLikeAccount(s)).toBe(true);
    expect(profileUpdateEndpoint(s)).toBe('/api/auth/me/profile');
  });

  test('prof* par roleSlug → libellé enseignant + endpoint auth', () => {
    const s = { id: 7, auth: { roleSlug: 'prof_principal' } };
    expect(deriveProfileTypeLabel(s, ROLE_TERMS)).toBe('n3boss');
    expect(profileUpdateEndpoint(s)).toBe('/api/auth/me/profile');
  });

  test('eleve* par roleSlug → libellé élève + endpoint students', () => {
    const s = { id: 12, auth: { roleSlug: 'eleve_avance' } };
    expect(deriveProfileTypeLabel(s, ROLE_TERMS)).toBe('n3beur');
    expect(isTeacherLikeAccount(s)).toBe(false);
    expect(profileUpdateEndpoint(s)).toBe('/api/students/12/profile');
  });

  test('repli sur userType legacy (teacher/user → enseignant, student → élève)', () => {
    expect(deriveProfileTypeLabel({ auth: { userType: 'teacher' } }, ROLE_TERMS)).toBe('n3boss');
    expect(deriveProfileTypeLabel({ user_type: 'user' }, ROLE_TERMS)).toBe('n3boss');
    expect(isTeacherLikeAccount({ user_type: 'user' })).toBe(true);
    expect(deriveProfileTypeLabel({ user_type: 'student' }, ROLE_TERMS)).toBe('n3beur');
  });

  test('défaut élève si rien d’exploitable', () => {
    expect(deriveProfileTypeLabel({}, ROLE_TERMS)).toBe('n3beur');
    expect(profileUpdateEndpoint({ id: 3 })).toBe('/api/students/3/profile');
  });
});

describe('buildProfileAffiliationOptions', () => {
  test('options standards si l’affiliation courante y figure déjà', () => {
    const opts = buildProfileAffiliationOptions([], 'both', null);
    expect(opts.map((o) => o.value)).toEqual(['both', 'n3', 'foret']);
  });

  test('affiliation hors options → entrée « valeur en base » ajoutée', () => {
    const opts = buildProfileAffiliationOptions([], 'ancienne_carte', null);
    expect(opts[opts.length - 1]).toEqual({ value: 'ancienne_carte', label: 'ancienne_carte (valeur en base)' });
  });

  test('repli sur l’affiliation du compte puis sur both', () => {
    const withFallback = buildProfileAffiliationOptions([], '', 'n3');
    expect(withFallback.map((o) => o.value)).toEqual(['both', 'n3', 'foret']);
    const withDefault = buildProfileAffiliationOptions([], '', '');
    expect(withDefault.map((o) => o.value)).toEqual(['both', 'n3', 'foret']);
  });

  test('cartes supplémentaires couvertes sans doublon « valeur en base »', () => {
    const maps = [{ id: 'verger', label: 'Verger' }];
    const opts = buildProfileAffiliationOptions(maps, 'verger', null);
    expect(opts.filter((o) => o.value === 'verger')).toHaveLength(1);
    expect(opts.find((o) => o.value === 'verger').label).toBe('Verger uniquement');
  });
});

describe('buildVisitMascotOptions', () => {
  test('catalogue complet si la liste autorisée est vide ou absente', () => {
    const full = getVisitMascotCatalog();
    expect(buildVisitMascotOptions(undefined)).toEqual(full);
    expect(buildVisitMascotOptions([])).toEqual(full);
    expect(buildVisitMascotOptions('pas-un-tableau')).toEqual(full);
  });

  test('filtre par ids autorisés (espaces tolérés, ids inconnus ignorés)', () => {
    const full = getVisitMascotCatalog();
    const firstId = full[0].id;
    const result = buildVisitMascotOptions([` ${firstId} `, 'id-inexistant']);
    expect(result.map((m) => m.id)).toEqual([firstId]);
  });
});

describe('validateProfileEditorFields', () => {
  const valid = { pseudo: 'momo_lyautey', email: 'moi@exemple.com', description: 'Salut', currentPassword: 'xx' };

  test('champs valides → pas d’erreur', () => {
    expect(validateProfileEditorFields(valid)).toBe('');
  });

  test('mot de passe actuel requis (vérifié en premier)', () => {
    expect(validateProfileEditorFields({ ...valid, currentPassword: '' })).toBe('Mot de passe actuel requis');
  });

  test('pseudo invalide (trop court ou caractères interdits) ; pseudo vide toléré', () => {
    expect(validateProfileEditorFields({ ...valid, pseudo: 'ab' }))
      .toBe('Pseudo invalide (3-30 caractères, lettres/chiffres/._-)');
    expect(validateProfileEditorFields({ ...valid, pseudo: 'momo lyautey' }))
      .toBe('Pseudo invalide (3-30 caractères, lettres/chiffres/._-)');
    expect(validateProfileEditorFields({ ...valid, pseudo: '   ' })).toBe('');
  });

  test('email invalide ; email vide toléré', () => {
    expect(validateProfileEditorFields({ ...valid, email: 'pas-un-mail' })).toBe('Email invalide');
    expect(validateProfileEditorFields({ ...valid, email: '' })).toBe('');
  });

  test('description > 300 caractères refusée', () => {
    expect(validateProfileEditorFields({ ...valid, description: 'x'.repeat(301) }))
      .toBe('Description trop longue (max 300 caractères)');
    expect(validateProfileEditorFields({ ...valid, description: 'x'.repeat(300) })).toBe('');
  });
});
