import { describe, test, expect } from 'vitest';
import {
  accountMetaEntries,
  effectiveRoleOriginLabel,
  formatAccountDate,
  isSensitiveRole,
  normalizeUserGroups,
  summarizeUserGroups,
  userAssignedRoleLabel,
  userRoleLabel,
  userTypeLabel,
} from '../../src/utils/profilesUserGroups.js';

describe('normalizeUserGroups', () => {
  test('normalise et déduplique, dans l’ordre reçu ; plus de rôle « responsable »', () => {
    const out = normalizeUserGroups([
      { id: 'b', name: 'Zèbre', kind: 'team' },
      { id: 'a', name: 'Alpha', kind: 'class', force_default_role: true, default_role_slug: 'x' },
      { id: 'a', name: 'Doublon', kind: 'class' },
      null,
      { name: 'Sans id' },
    ]);
    expect(out.map((g) => g.id)).toEqual(['b', 'a']);
    expect(out.find((g) => g.id === 'a').kindLabel).toBe('Classe');
    expect(out.find((g) => g.id === 'a').forcesDefaultRole).toBe(true);
    expect(out.find((g) => g.id === 'a').defaultRoleLabel).toBe('x');
    expect(out.find((g) => g.id === 'b').forcesDefaultRole).toBe(false);
    expect('isManager' in out[0]).toBe(false);
    expect('roleLabel' in out[0]).toBe(false);
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
  test('liste lisible des noms, sans mention de rôle dans le groupe', () => {
    const groups = normalizeUserGroups([
      { id: '1', name: 'Alpha', role_in_group: 'manager' },
      { id: '2', name: 'Beta' },
    ]);
    expect(summarizeUserGroups(groups)).toBe('Alpha, Beta');
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

  test('profil attribué : libellé puis slug, vide sinon', () => {
    expect(userAssignedRoleLabel({ assigned_role_display_name: 'Élève avancé' })).toBe(
      'Élève avancé',
    );
    expect(userAssignedRoleLabel({ assigned_role_slug: 'eleve_avance' })).toBe('eleve_avance');
    expect(userAssignedRoleLabel({})).toBe('');
  });

  test('type de compte en français, valeur inconnue conservée', () => {
    expect(userTypeLabel('student')).toBe('Élève');
    expect(userTypeLabel('teacher')).toBe('Enseignant');
    expect(userTypeLabel('bot')).toBe('bot');
    expect(userTypeLabel(null)).toBe('');
  });
});

describe('effectiveRoleOriginLabel', () => {
  test('attribué / conféré par le groupe / imposé par le groupe', () => {
    expect(effectiveRoleOriginLabel({ effective_role: { source: 'assigned' } })).toBe('attribué');
    expect(effectiveRoleOriginLabel({ effective_role: { source: 'default' } })).toBe('attribué');
    expect(
      effectiveRoleOriginLabel({ effective_role: { source: 'group', groupName: '2nde B' } }),
    ).toBe('conféré par le groupe 2nde B');
    expect(
      effectiveRoleOriginLabel({ effective_role: { source: 'forced', groupName: 'Sixième 3' } }),
    ).toBe('imposé par le groupe Sixième 3');
    expect(effectiveRoleOriginLabel({ effective_role: { source: 'forced' } })).toBe(
      'imposé par un groupe',
    );
  });

  test('sans fiche détaillée ou origine inconnue : chaîne vide', () => {
    expect(effectiveRoleOriginLabel({})).toBe('');
    expect(effectiveRoleOriginLabel(null)).toBe('');
    expect(effectiveRoleOriginLabel({ effective_role: { source: 'autre' } })).toBe('');
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
