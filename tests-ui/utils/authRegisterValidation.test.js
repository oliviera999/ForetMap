import { describe, test, expect } from 'vitest';
import { getAuthSubmitError } from '../../src/utils/authRegisterValidation.js';

function loginInput(overrides = {}) {
  return {
    mode: 'login',
    identifier: 'momo_lyautey',
    pass: 'abcd',
    pass2: '',
    allowRegister: true,
    first: '',
    last: '',
    pseudo: '',
    email: '',
    description: '',
    affiliation: '',
    affiliationOptions: [],
    ...overrides,
  };
}

function registerInput(overrides = {}) {
  return {
    mode: 'register',
    identifier: '',
    pass: 'abcd',
    pass2: 'abcd',
    allowRegister: true,
    first: 'Mohamed',
    last: 'El Farrai',
    pseudo: '',
    email: '',
    description: '',
    affiliation: 'map:1',
    affiliationOptions: [{ value: 'map:1', label: 'Forêt' }],
    ...overrides,
  };
}

describe('getAuthSubmitError — mode login', () => {
  test('valide : renvoie une chaîne vide', () => {
    expect(getAuthSubmitError(loginInput())).toBe('');
  });

  test('identifiant vide (ou espaces) ou mot de passe absent', () => {
    expect(getAuthSubmitError(loginInput({ identifier: '   ' }))).toBe(
      'Identifiant et mot de passe requis',
    );
    expect(getAuthSubmitError(loginInput({ pass: '' }))).toBe('Identifiant et mot de passe requis');
  });

  test('ignore les contraintes d’inscription (affiliation absente acceptée)', () => {
    expect(getAuthSubmitError(loginInput({ affiliation: '', affiliationOptions: [] }))).toBe('');
  });
});

describe('getAuthSubmitError — mode register', () => {
  test('valide : renvoie une chaîne vide', () => {
    expect(getAuthSubmitError(registerInput())).toBe('');
  });

  test('inscriptions désactivées (prioritaire sur les champs)', () => {
    expect(getAuthSubmitError(registerInput({ allowRegister: false, first: '' }))).toBe(
      'Inscriptions désactivées',
    );
  });

  test('prénom/nom/mot de passe requis', () => {
    expect(getAuthSubmitError(registerInput({ first: ' ' }))).toBe('Tous les champs sont requis');
    expect(getAuthSubmitError(registerInput({ last: '' }))).toBe('Tous les champs sont requis');
    expect(getAuthSubmitError(registerInput({ pass: '', pass2: '' }))).toBe(
      'Tous les champs sont requis',
    );
  });

  test('mots de passe différents puis trop court (ordre historique)', () => {
    expect(getAuthSubmitError(registerInput({ pass2: 'autre' }))).toBe(
      'Les mots de passe ne correspondent pas',
    );
    expect(getAuthSubmitError(registerInput({ pass: 'abc', pass2: 'abc' }))).toBe(
      'Mot de passe trop court (min 4 caractères)',
    );
  });

  test('pseudo optionnel mais format contraint (3-30, lettres/chiffres/._-)', () => {
    expect(getAuthSubmitError(registerInput({ pseudo: '' }))).toBe('');
    expect(getAuthSubmitError(registerInput({ pseudo: 'momo_lyautey.2-b' }))).toBe('');
    expect(getAuthSubmitError(registerInput({ pseudo: 'ab' }))).toBe(
      'Pseudo invalide (3-30 caractères, lettres/chiffres/._-)',
    );
    expect(getAuthSubmitError(registerInput({ pseudo: 'momo lyautey' }))).toBe(
      'Pseudo invalide (3-30 caractères, lettres/chiffres/._-)',
    );
  });

  test('email optionnel mais format contraint', () => {
    expect(getAuthSubmitError(registerInput({ email: '' }))).toBe('');
    expect(getAuthSubmitError(registerInput({ email: 'moi@exemple.com' }))).toBe('');
    expect(getAuthSubmitError(registerInput({ email: 'pas-un-email' }))).toBe('Email invalide');
  });

  test('description limitée à 300 caractères après trim', () => {
    expect(getAuthSubmitError(registerInput({ description: 'a'.repeat(300) }))).toBe('');
    expect(getAuthSubmitError(registerInput({ description: `${'a'.repeat(300)}   ` }))).toBe('');
    expect(getAuthSubmitError(registerInput({ description: 'a'.repeat(301) }))).toBe(
      'Description trop longue (max 300 caractères)',
    );
  });

  test('affiliation requise puis vérifiée contre les options proposées', () => {
    expect(getAuthSubmitError(registerInput({ affiliation: '' }))).toBe(
      'Choisis ton espace (cartes proposées dans la liste)',
    );
    expect(getAuthSubmitError(registerInput({ affiliation: 'map:404' }))).toBe(
      'Choix d’espace invalide',
    );
  });
});
