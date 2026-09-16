import { describe, test, expect } from 'vitest';
import {
  accountMetaEntries,
  formatAccountDate,
  isSensitiveRole,
  normalizeUserGroups,
  summarizeUserGroups,
  userRoleLabel,
  userTypeLabel,
} from '../../src/utils/profilesUserGroups.js';

describe('normalizeUserGroups', () => {
  test('normalise, déduplique et trie (responsables d’abord puis par nom)', () => {
    const out = normalizeUserGroups([
      { id: 'b', name: 'Zèbre', kind: 'team', role_in_group: 'member' },
      { id: 'a', name: 'Alpha', kind: 'class', role_in_group: 'MANAGER' },
      { id: 'a', name: 'Doublon', kind: 'class' },
      null,
      { name: 'Sans id' },
    ]);
    expect(out.map((g) => g.id)).toEqual(['b', 'a']);
    expect(out.find((g) => g.id === 'a').isManager).toBe(true);
    expect(out.find((g) => g.id === 'a').kindLabel).toBe('Classe');
    expect(out.find((g) => g.id === 'b').roleLabel).toBe('Membre');
  });

  test('replie un kind inconnu sur sa valeur brute et un groupe archivé', () => {
    const [g] = normalizeUserGroups([{ id: '1', name: 'X', kind: 'pod', is_active: 0 }]);
    expect(g.kindLabel).toBe('pod');
    expect(g.isActive).toBe(false);
  });

  test('entrée non tableau → liste vide', () => {
    expect(normalizeUserGroups(undefined)).toEqual([]);
    expect(normalizeUserGroups(null)).toEqual([]);
    expect(normalizeUserGroups('g1')).toEqual([]);
  });

  test('repli du nom sur le slug puis sur l’identifiant', () => {
    expect(normalizeUserGroups([{ id: '1', slug: 'mon-slug' }])[0].name).toBe('mon-slug');
    expect(normalizeUserGroups([{ id: '7' }])[0].name).toBe('7');
  });
});

describe('summarizeUserGroups', () => {
  test('liste lisible avec mention du rôle responsable', () => {
    const groups = normalizeUserGroups([
      { id: '1', name: 'Alpha', role_in_group: 'manager' },
      { id: '2', name: 'Beta' },
    ]);
    expect(summarizeUserGroups(groups)).toBe('Alpha (Responsable), Beta');
  });

  test('aucune entrée → libellé explicite', () => {
    expect(summarizeUserGroups([])).toBe('Aucun groupe');
    expect(summarizeUserGroups(null)).toBe('Aucun groupe');
  });
});

describe('userRoleLabel / userTypeLabel', () => {
  test('repli du libellé de profil sur le slug', () => {
    expect(userRoleLabel({ role_display_name: 'Prof référent' })).toBe('Prof référent');
    expect(userRoleLabel({ role_slug: 'prof_classe' })).toBe('prof_classe');
    expect(userRoleLabel({})).toBe('');
  });

  test('type de compte en français, valeur inconnue conservée', () => {
    expect(userTypeLabel('student')).toBe('Élève');
    expect(userTypeLabel('teacher')).toBe('Enseignant');
    expect(userTypeLabel('bot')).toBe('bot');
    expect(userTypeLabel(null)).toBe('');
  });
});

describe('isSensitiveRole (P3)', () => {
  test('admin et prof exigent une confirmation, pas les profils élèves', () => {
    expect(isSensitiveRole('admin')).toBe(true);
    expect(isSensitiveRole('prof')).toBe(true);
    expect(isSensitiveRole('ADMIN')).toBe(true);
    expect(isSensitiveRole('eleve_novice')).toBe(false);
    expect(isSensitiveRole('prof_classe')).toBe(false);
  });

  test('accepte un objet profil ou une ligne utilisateur, et tolère l’absence', () => {
    expect(isSensitiveRole({ slug: 'admin' })).toBe(true);
    expect(isSensitiveRole({ role_slug: 'prof' })).toBe(true);
    expect(isSensitiveRole(null)).toBe(false);
    expect(isSensitiveRole({})).toBe(false);
  });
});

describe('métadonnées de support (P13)', () => {
  test('n’émet que les entrées renseignées', () => {
    expect(accountMetaEntries({})).toEqual([]);
    expect(accountMetaEntries(null)).toEqual([]);
  });

  test('état, origine, création et dernière visite', () => {
    const entries = accountMetaEntries({
      is_active: true,
      auth_provider: 'moodle',
      created_at: '2026-02-03T10:00:00.000Z',
      last_seen: '2026-09-01T08:30:00.000Z',
    });
    expect(entries.map((e) => `${e.label}: ${e.value}`)).toEqual([
      'État: Compte actif',
      'Origine: Moodle',
      'Créé le: 03/02/2026',
      'Dernière visite: 01/09/2026',
    ]);
  });

  test('un compte désactivé est signalé comme tel', () => {
    const [first] = accountMetaEntries({ is_active: false });
    expect(first).toEqual({ label: 'État', value: 'Compte désactivé', tone: 'warn' });
  });

  test('une origine inconnue est affichée telle quelle', () => {
    const entries = accountMetaEntries({ auth_provider: 'saml' });
    expect(entries[0]).toEqual({ label: 'Origine', value: 'saml' });
  });

  test('une date illisible n’est pas affichée', () => {
    expect(formatAccountDate('pas-une-date')).toBe('');
    expect(formatAccountDate(null)).toBe('');
    expect(accountMetaEntries({ created_at: 'pas-une-date' })).toEqual([]);
  });
});
