import { describe, test, expect } from 'vitest';
import {
  pickUserField,
  toUiString,
  mergeRbacUserRowsForEdit,
  isLikelyApiUserPayload,
  buildUserEditInitialFields,
  validateUserIdentityFields,
  buildUserEditPatchPayload,
} from '../../src/utils/profilesUserFields.js';

describe('pickUserField', () => {
  test('lit indépendamment de la casse / underscores (snake_case, camelCase)', () => {
    expect(pickUserField({ first_name: 'Léa' }, 'first_name')).toBe('Léa');
    expect(pickUserField({ firstName: 'Léa' }, 'first_name')).toBe('Léa');
    expect(pickUserField({ FIRST_NAME: 'Léa' }, 'firstName')).toBe('Léa');
  });

  test('accepte plusieurs noms logiques et renvoie le premier match trouvé', () => {
    expect(pickUserField({ roleId: 7 }, 'role_id', 'roleId')).toBe(7);
  });

  test('renvoie undefined pour non-objet ou clé absente', () => {
    expect(pickUserField(null, 'id')).toBeUndefined();
    expect(pickUserField(undefined, 'id')).toBeUndefined();
    expect(pickUserField('x', 'id')).toBeUndefined();
    expect(pickUserField({ other: 1 }, 'id')).toBeUndefined();
  });

  test('renvoie la valeur même falsy (0, "", false)', () => {
    expect(pickUserField({ role_id: 0 }, 'role_id')).toBe(0);
    expect(pickUserField({ email: '' }, 'email')).toBe('');
    expect(pickUserField({ forum_participate: false }, 'forum_participate')).toBe(false);
  });
});

describe('toUiString', () => {
  test('null/undefined → chaîne vide', () => {
    expect(toUiString(null)).toBe('');
    expect(toUiString(undefined)).toBe('');
  });

  test('coerce nombres/booléens en chaîne', () => {
    expect(toUiString(42)).toBe('42');
    expect(toUiString(0)).toBe('0');
    expect(toUiString(false)).toBe('false');
  });

  test('Buffer décodé en utf8', () => {
    expect(toUiString(Buffer.from('Léa', 'utf8'))).toBe('Léa');
  });
});

describe('isLikelyApiUserPayload', () => {
  test('vrai pour fiche objet avec id et sans raw', () => {
    expect(isLikelyApiUserPayload({ id: 5, first_name: 'Léa' })).toBe(true);
  });

  test('faux pour null, tableau, raw présent, ou id manquant', () => {
    expect(isLikelyApiUserPayload(null)).toBeFalsy();
    expect(isLikelyApiUserPayload([{ id: 1 }])).toBe(false);
    expect(isLikelyApiUserPayload({ raw: 'oops', id: 1 })).toBe(false);
    expect(isLikelyApiUserPayload({ first_name: 'Léa' })).toBeFalsy();
  });
});

describe('mergeRbacUserRowsForEdit', () => {
  test('la fiche détail prime sur la ligne liste pour les champs renseignés', () => {
    const listRow = { id: 1, user_type: 'student', first_name: 'Ancien', email: 'liste@ex.fr' };
    const detailRow = { id: 1, first_name: 'Nouveau', email: 'detail@ex.fr' };
    const merged = mergeRbacUserRowsForEdit(listRow, detailRow);
    expect(merged.first_name).toBe('Nouveau');
    expect(merged.email).toBe('detail@ex.fr');
  });

  test('repli sur la ligne liste quand le détail est vide / espaces (pick strict)', () => {
    const listRow = { id: 2, first_name: 'Léa', last_name: 'Martin', email: 'lea@ex.fr' };
    const detailRow = { id: 2, first_name: '   ', last_name: '', email: null };
    const merged = mergeRbacUserRowsForEdit(listRow, detailRow);
    expect(merged.first_name).toBe('Léa');
    expect(merged.last_name).toBe('Martin');
    expect(merged.email).toBe('lea@ex.fr');
  });

  test('ignore une fiche détail marquée raw (utilise listRow seul)', () => {
    const listRow = { id: 3, user_type: 'teacher', first_name: 'Sam' };
    const detailRow = { raw: 'html-error-page', id: 999, first_name: 'NeDoitPasGagner' };
    const merged = mergeRbacUserRowsForEdit(listRow, detailRow);
    expect(merged.id).toBe('3');
    expect(merged.first_name).toBe('Sam');
    expect(merged.user_type).toBe('teacher');
  });

  test('id coercé en chaîne trimée, user_type en minuscules', () => {
    const merged = mergeRbacUserRowsForEdit({ id: 42, user_type: 'STUDENT' }, null);
    expect(merged.id).toBe('42');
    expect(merged.user_type).toBe('student');
  });

  test('display_name conservé via pickLoose même si autres champs absents', () => {
    const merged = mergeRbacUserRowsForEdit({ id: 4, display_name: '  Léa Martin  ' }, null);
    expect(merged.display_name).toBe('Léa Martin');
  });

  test('listRow/detailRow non-objets → objet stable avec id vide', () => {
    const merged = mergeRbacUserRowsForEdit(null, undefined);
    expect(merged.id).toBe('');
    expect(merged.user_type).toBe('');
    expect(merged.display_name).toBe('');
    expect(merged.first_name).toBeUndefined();
  });

  test('champs participation lus en loose (false préservé)', () => {
    const merged = mergeRbacUserRowsForEdit(
      { id: 5, forum_participate: false, context_comment_participate: 1 },
      null
    );
    expect(merged.forum_participate).toBe(false);
    expect(merged.context_comment_participate).toBe(1);
  });

  test('id pris dans le détail en priorité', () => {
    const merged = mergeRbacUserRowsForEdit({ id: 1 }, { id: 9, first_name: 'X' });
    expect(merged.id).toBe('9');
  });
});

describe('buildUserEditInitialFields', () => {
  test('utilise prénom/nom directs quand présents', () => {
    const out = buildUserEditInitialFields({ first_name: 'Léa', last_name: 'Martin', email: 'lea@ex.fr' });
    expect(out.firstName).toBe('Léa');
    expect(out.lastName).toBe('Martin');
    expect(out.email).toBe('lea@ex.fr');
  });

  test('affiliation par défaut « both » quand absente', () => {
    expect(buildUserEditInitialFields({ first_name: 'A', last_name: 'B' }).affiliation).toBe('both');
    expect(buildUserEditInitialFields({ first_name: 'A', last_name: 'B', affiliation: '' }).affiliation).toBe('both');
  });

  test('affiliation normalisée en minuscules', () => {
    expect(buildUserEditInitialFields({ first_name: 'A', last_name: 'B', affiliation: 'N3' }).affiliation).toBe('n3');
  });

  test('description null → chaîne vide, sinon préservée (sans trim)', () => {
    expect(buildUserEditInitialFields({ first_name: 'A', last_name: 'B' }).description).toBe('');
    expect(buildUserEditInitialFields({ first_name: 'A', last_name: 'B', description: '  texte  ' }).description).toBe('  texte  ');
  });

  test('sans prénom/nom : déduit du display_name (non-email) — premier mot prénom, reste nom', () => {
    const out = buildUserEditInitialFields({ display_name: 'Jean Pierre Dupont' });
    expect(out.firstName).toBe('Jean');
    expect(out.lastName).toBe('Pierre Dupont');
  });

  test('sans prénom/nom : display_name = email → tokens capitalisés depuis la partie locale', () => {
    const out = buildUserEditInitialFields({ display_name: 'lea.martin@example.com' });
    expect(out.firstName).toBe('Lea');
    expect(out.lastName).toBe('Martin');
  });

  test('email local mono-token → seulement le prénom', () => {
    const out = buildUserEditInitialFields({ display_name: 'lea@example.com' });
    expect(out.firstName).toBe('Lea');
    expect(out.lastName).toBe('');
  });

  test('email local avec séparateurs ._- → multiples tokens', () => {
    const out = buildUserEditInitialFields({ display_name: 'jean-pierre_du.pont@ex.fr' });
    expect(out.firstName).toBe('Jean');
    expect(out.lastName).toBe('Pierre Du Pont');
  });

  test('prénom présent mais pas le nom → pas de déduction depuis display_name', () => {
    const out = buildUserEditInitialFields({ first_name: 'Léa', display_name: 'Autre Nom' });
    expect(out.firstName).toBe('Léa');
    expect(out.lastName).toBe('');
  });

  test('pseudo et email trimés', () => {
    const out = buildUserEditInitialFields({ first_name: 'A', last_name: 'B', pseudo: '  lea_m  ', email: '  lea@ex.fr  ' });
    expect(out.pseudo).toBe('lea_m');
    expect(out.email).toBe('lea@ex.fr');
  });
});

describe('validateUserIdentityFields', () => {
  const valid = {
    firstName: 'Léa',
    lastName: 'Martin',
    pseudo: 'lea_m',
    email: 'lea@ex.fr',
    description: 'Bonjour',
  };

  test('champs valides → null (avec ou sans mot de passe requis)', () => {
    expect(validateUserIdentityFields(valid)).toBeNull();
    expect(validateUserIdentityFields({ ...valid, password: 'secret', requirePassword: true })).toBeNull();
    expect(validateUserIdentityFields({ firstName: 'A', lastName: 'B' })).toBeNull(); // optionnels vides
  });

  test('prénom/nom requis ; message création avec mot de passe requis', () => {
    expect(validateUserIdentityFields({ firstName: '  ', lastName: 'B' })).toBe('Prénom et nom sont requis');
    expect(validateUserIdentityFields({ firstName: 'A', lastName: '' })).toBe('Prénom et nom sont requis');
    expect(validateUserIdentityFields({ ...valid, requirePassword: true }))
      .toBe('Prénom, nom et mot de passe sont requis');
    expect(validateUserIdentityFields({ firstName: '', lastName: '', password: 'x', requirePassword: true }))
      .toBe('Prénom, nom et mot de passe sont requis');
  });

  test('pseudo invalide (format ou longueur)', () => {
    expect(validateUserIdentityFields({ ...valid, pseudo: 'ab' }))
      .toBe('Pseudo invalide (3-30 caractères, lettres/chiffres/._-)');
    expect(validateUserIdentityFields({ ...valid, pseudo: 'léa!' }))
      .toBe('Pseudo invalide (3-30 caractères, lettres/chiffres/._-)');
    expect(validateUserIdentityFields({ ...valid, pseudo: '  ' })).toBeNull(); // vide après trim → ignoré
  });

  test('email invalide ; vide ignoré', () => {
    expect(validateUserIdentityFields({ ...valid, email: 'pas-un-email' })).toBe('Email invalide');
    expect(validateUserIdentityFields({ ...valid, email: '  ' })).toBeNull();
  });

  test('description > 300 caractères refusée', () => {
    expect(validateUserIdentityFields({ ...valid, description: 'x'.repeat(301) }))
      .toBe('Description trop longue (max 300 caractères)');
    expect(validateUserIdentityFields({ ...valid, description: 'x'.repeat(300) })).toBeNull();
  });
});

describe('buildUserEditPatchPayload', () => {
  test('champs trimés, optionnels vides → null', () => {
    expect(buildUserEditPatchPayload({
      firstName: ' Léa ',
      lastName: ' Martin ',
      pseudo: '  ',
      email: ' lea@ex.fr ',
      description: '',
    })).toEqual({
      first_name: 'Léa',
      last_name: 'Martin',
      pseudo: null,
      email: 'lea@ex.fr',
      description: null,
    });
  });

  test('affiliation seulement pour un n3beur (student)', () => {
    expect(buildUserEditPatchPayload({ firstName: 'A', lastName: 'B', affiliation: 'lyon', isStudent: true }).affiliation)
      .toBe('lyon');
    expect('affiliation' in buildUserEditPatchPayload({ firstName: 'A', lastName: 'B', affiliation: 'lyon' }))
      .toBe(false);
  });

  test('mot de passe inclus tel quel uniquement s’il est non vide après trim', () => {
    expect('password' in buildUserEditPatchPayload({ firstName: 'A', lastName: 'B', password: '   ' })).toBe(false);
    expect(buildUserEditPatchPayload({ firstName: 'A', lastName: 'B', password: ' s3cret ' }).password).toBe(' s3cret ');
  });
});
