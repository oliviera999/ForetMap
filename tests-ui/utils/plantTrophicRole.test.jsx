import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  TROPHIC_ROLE_DEFINITIONS,
  TROPHIC_ROLE_LABELS,
  TROPHIC_ROLE_VALUES,
  normalizeTrophicRole,
  trophicRoleDefinition,
  trophicRoleLabel,
} from '../../src/utils/plantTrophicRole.js';
import {
  plantMatchesStructuredFilters,
  plantTextMatchesQuery,
} from '../../src/utils/plantFilters.js';
import { PLANT_META_SECTIONS } from '../../src/constants/plantMetaSections.js';
import { PlantPedagoTraitBadges } from '../../src/components/biodiv/PlantSummaryBlocks.jsx';

describe('plantTrophicRole — valeur détritivore (migration 295)', () => {
  it('liste les quatre rôles dans l’ordre de la chaîne de la matière', () => {
    expect([...TROPHIC_ROLE_VALUES]).toEqual([
      'producteur',
      'consommateur',
      'detritivore',
      'decomposeur',
    ]);
    for (const role of TROPHIC_ROLE_VALUES) {
      expect(TROPHIC_ROLE_LABELS[role]).toBeTruthy();
      expect(TROPHIC_ROLE_DEFINITIONS[role]).toBeTruthy();
    }
  });

  it('normalise casse et accents, rejette le reste', () => {
    expect(normalizeTrophicRole('detritivore')).toBe('detritivore');
    expect(normalizeTrophicRole(' Détritivore ')).toBe('detritivore');
    expect(normalizeTrophicRole('Décomposeur')).toBe('decomposeur');
    expect(normalizeTrophicRole('omnivore')).toBe('');
    expect(normalizeTrophicRole(null)).toBe('');
  });

  it('libellé et définition pour élèves', () => {
    expect(trophicRoleLabel('detritivore')).toBe('Détritivore');
    expect(trophicRoleDefinition('detritivore')).toBe(
      'se nourrit de matière organique morte (feuilles, bois, cadavres) qu’il fragmente',
    );
    // Le décomposeur minéralise : c'est ce qui le distingue du détritivore.
    expect(trophicRoleDefinition('decomposeur')).toMatch(/sels minéraux/);
    expect(trophicRoleLabel('inconnu')).toBe('');
  });

  it('la fiche affiche « Détritivore » et non la valeur brute', () => {
    const item = PLANT_META_SECTIONS.flatMap((section) => section.items).find(
      (entry) => entry.key === 'trophic_role',
    );
    expect(item.valueLabels.detritivore).toBe('Détritivore');
  });

  it('pastille « Détritivore » avec sa définition en infobulle', () => {
    render(<PlantPedagoTraitBadges plant={{ trophic_role: 'detritivore' }} />);
    const chip = screen.getByText('Détritivore').closest('.task-chip');
    expect(chip).toBeTruthy();
    expect(chip.getAttribute('title')).toMatch(/matière organique morte/);
  });
});

describe('catalogue — filtre et recherche sur le rôle détritivore', () => {
  const lombric = { name: 'Lombric commun', trophic_role: 'detritivore' };
  const champignon = { name: 'Champignons de litière', trophic_role: 'decomposeur' };

  it('le filtre distingue détritivores et décomposeurs', () => {
    expect(plantMatchesStructuredFilters(lombric, { trophicRole: 'detritivore' })).toBe(true);
    expect(plantMatchesStructuredFilters(champignon, { trophicRole: 'detritivore' })).toBe(false);
  });

  it('la recherche trouve le mot accentué que tape l’élève', () => {
    expect(plantTextMatchesQuery(lombric, 'détritivore')).toBe(true);
    expect(plantTextMatchesQuery(lombric, 'detritivore')).toBe(true);
    expect(plantTextMatchesQuery(champignon, 'décomposeur')).toBe(true);
    expect(plantTextMatchesQuery(champignon, 'détritivore')).toBe(false);
  });
});
