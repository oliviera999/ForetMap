import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// MarkdownContent rend du HTML : réduit à un passe-plat texte pour isoler l'affichage.
vi.mock('../../../src/components/MarkdownContent.jsx', () => ({
  MarkdownContent: ({ children }) => <div>{children}</div>,
}));

import { LocationVisitAside } from '../../../src/components/map/mapModalShared.jsx';

const PLANTS = [{ id: 1, name: 'Pommier', emoji: '🍎' }];

function renderAside(overrides = {}) {
  return render(
    <LocationVisitAside
      entity={{ id: 'z1' }}
      locationKind="zone"
      plants={PLANTS}
      livingNames={[]}
      livingBeingsOnlyOnTasks={[]}
      visitAsideSpecies={false}
      visitAsideTutorials={false}
      tutorials={[]}
      {...overrides}
    />,
  );
}

describe('LocationVisitAside', () => {
  test('sous-titre, accroche et bloc détails (titre personnalisé)', () => {
    renderAside({
      entity: {
        id: 'z1',
        visit_subtitle: 'Le verger',
        visit_short_description: 'Une accroche.',
        visit_details_title: 'En savoir plus',
        visit_details_text: 'Contenu détaillé.',
      },
    });
    expect(screen.getByText('Le verger')).toBeTruthy();
    expect(screen.getByText('Une accroche.')).toBeTruthy();
    expect(screen.getByText('En savoir plus')).toBeTruthy();
    expect(screen.getByText('Contenu détaillé.')).toBeTruthy();
  });

  test('titre de repli « Détails » quand visit_details_title est vide', () => {
    renderAside({ entity: { id: 'z1', visit_details_text: 'Texte.' } });
    expect(screen.getByText('Détails')).toBeTruthy();
  });

  test('biodiversité : titre de section « Sur cette zone » vs « Sur ce repère »', () => {
    const props = {
      visitAsideSpecies: true,
      livingNames: ['Pommier', 'Menthe'],
    };
    const { rerender } = renderAside(props);
    expect(screen.getByText('Sur cette zone')).toBeTruthy();
    rerender(
      <LocationVisitAside
        entity={{ id: 'm1' }}
        locationKind="marker"
        plants={PLANTS}
        livingNames={['Pommier', 'Menthe']}
        livingBeingsOnlyOnTasks={[]}
        visitAsideSpecies
        visitAsideTutorials={false}
        tutorials={[]}
      />,
    );
    expect(screen.getByText('Sur ce repère')).toBeTruthy();
  });

  test('un seul être vivant sans espèces de missions : pas de titre de section', () => {
    renderAside({ visitAsideSpecies: true, livingNames: ['Pommier'] });
    expect(screen.queryByText('Sur cette zone')).toBeNull();
    expect(screen.getByText('Biodiversité')).toBeTruthy();
  });

  test('espèces uniquement portées par les missions : section dédiée', () => {
    renderAside({ visitAsideSpecies: true, livingBeingsOnlyOnTasks: ['Ortie'] });
    expect(screen.getByText('Également dans les missions')).toBeTruthy();
  });

  test('bloc Tuto : liste des tutoriels liés au lieu', () => {
    renderAside({
      visitAsideTutorials: true,
      tutorials: [{ id: 3, title: 'Tuto paillage', zones_linked: [], markers_linked: [] }],
    });
    expect(screen.getByText('Tuto')).toBeTruthy();
    expect(screen.getByText('Tuto paillage')).toBeTruthy();
  });
});
