import { describe, test, expect } from 'vitest';
import {
  countGroupsMissingNiveau,
  groupKindExpectsNiveau,
  groupNiveauHint,
  groupNiveauStatus,
  proposedGroupNiveau,
} from '../../src/utils/groupNiveauHints.js';
import { filterGroupsList } from '../../src/utils/groupsAdminListFilters.js';

describe('groupNiveauHints', () => {
  test('classes et unités portent un niveau, pas les équipes ni les clubs', () => {
    expect(groupKindExpectsNiveau('class')).toBe(true);
    expect(groupKindExpectsNiveau('unit')).toBe(true);
    expect(groupKindExpectsNiveau('team')).toBe(false);
    expect(groupKindExpectsNiveau('club')).toBe(false);
  });

  test('pré-remplissage : seulement une classe au nom sans ambiguïté', () => {
    expect(proposedGroupNiveau('601', 'class')).toBe('cycle3');
    expect(proposedGroupNiveau('2nde A', 'class')).toBe('seconde');
    expect(proposedGroupNiveau('1re', 'class')).toBe('');
    expect(proposedGroupNiveau('Club 3D', 'club')).toBe('');
  });

  test('textes : proposition, confirmation, impossibilités', () => {
    expect(groupNiveauHint({ name: '4B', kind: 'class' })).toMatchObject({
      tone: 'proposition',
      proposedNiveau: 'cycle4',
    });
    expect(groupNiveauHint({ name: '4B', kind: 'class', current: 'cycle4' }).tone).toBe('ok');
    expect(groupNiveauHint({ name: '6e-5e', kind: 'class' }).text).toMatch(/plusieurs niveaux/);
    expect(groupNiveauHint({ name: 'Tle', kind: 'class' }).text).toMatch(/choisissez la voie/);
    expect(groupNiveauHint({ name: 'Atelier', kind: 'class' }).text).toMatch(/ne permet pas/);
    // Niveau déjà choisi, nom muet : rien à dire.
    expect(groupNiveauHint({ name: 'Atelier', kind: 'class', current: 'cycle3' })).toBe(null);
    expect(groupNiveauHint({ name: 'Club', kind: 'club' }).text).toMatch(/Équipe ou club/);
  });

  test('statut et comptage des groupes sans niveau', () => {
    const groups = [
      { curriculum_niveau: 'seconde', is_active: true },
      {
        curriculum_niveau: null,
        curriculum_niveau_effectif: 'cycle3',
        curriculum_niveau_herite_de: { id: 'u', name: 'Niveau 6e' },
        is_active: true,
      },
      { curriculum_niveau_manquant: true, is_active: true },
      { curriculum_niveau_manquant: true, is_active: false },
    ];
    expect(groupNiveauStatus(groups[0]).text).toBe('Niveau : Seconde');
    expect(groupNiveauStatus(groups[1]).text).toMatch(/hérité de « Niveau 6e »/);
    expect(groupNiveauStatus(groups[2])).toEqual({ missing: true, text: 'Niveau à renseigner' });
    expect(countGroupsMissingNiveau(groups)).toBe(1);
    expect(filterGroupsList(groups, { hideInactive: false, missingNiveauOnly: true })).toHaveLength(
      2,
    );
  });
});
