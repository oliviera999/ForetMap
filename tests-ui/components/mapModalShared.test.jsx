import React from 'react';
import { describe, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  LocationTutorialPreviewList,
  TaskEnrollmentLegend,
} from '../../src/components/map/mapModalShared.jsx';

describe('LocationTutorialPreviewList', () => {
  test('état vide : message adapté zone / repère', () => {
    const { rerender } = render(
      <LocationTutorialPreviewList tutorials={[]} locationKind="zone" locationId="z1" />,
    );
    expect(screen.getByText('Aucun tutoriel lié à cette zone.')).toBeTruthy();
    rerender(<LocationTutorialPreviewList tutorials={[]} locationKind="marker" locationId="m1" />);
    expect(screen.getByText('Aucun tutoriel lié à ce repère.')).toBeTruthy();
  });

  test('affiche titre + résumé, et exclut le lieu courant des « autres zones »', () => {
    const tutorials = [
      {
        id: 7,
        title: 'Tailler les pommiers',
        summary: 'En hiver, sécateur propre.',
        zones_linked: [
          { id: 'z1', name: 'Verger' },
          { id: 'z2', name: 'Potager' },
        ],
        markers_linked: [],
      },
    ];
    render(
      <LocationTutorialPreviewList
        tutorials={tutorials}
        locationKind="zone"
        locationId="z1"
        onOpenTutorialPreview={() => {}}
      />,
    );
    expect(screen.getByText('Tailler les pommiers')).toBeTruthy();
    expect(screen.getByText('En hiver, sécateur propre.')).toBeTruthy();
    // z1 (Verger) est le lieu courant → exclu ; reste « Potager »
    expect(screen.getByText(/Autres zones/)).toBeTruthy();
    expect(screen.getByText(/Potager/)).toBeTruthy();
  });
});

describe('TaskEnrollmentLegend', () => {
  test('rend les 4 entrées de légende', () => {
    render(<TaskEnrollmentLegend />);
    ['Déjà prise', 'Disponible', 'Complet', 'Fermée'].forEach((label) => {
      expect(screen.getByText(label)).toBeTruthy();
    });
  });
});
