import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MarkerTutorialCardList } from '../../../src/components/map/MarkerTutorialCardList.jsx';

describe('MarkerTutorialCardList', () => {
  test('état vide : affiche le message « Aucun tutoriel »', () => {
    render(<MarkerTutorialCardList tutorials={[]} currentMarkerId="m1" />);
    expect(screen.getByText('Aucun tutoriel lié à ce repère.')).toBeTruthy();
  });

  test('affiche titre, résumé, zones et exclut le repère courant des « autres repères »', () => {
    const tutorials = [
      {
        id: 7,
        title: 'Tailler les pommiers',
        summary: 'En hiver, sécateur propre.',
        zones_linked: [
          { id: 'z1', name: 'Verger' },
          { id: 'z2', name: 'Potager' },
        ],
        markers_linked: [
          { id: 'm1', label: 'Repère courant' },
          { id: 'm2', label: 'Autre repère' },
        ],
      },
    ];
    render(<MarkerTutorialCardList tutorials={tutorials} currentMarkerId="m1" />);
    expect(screen.getByText('Tailler les pommiers')).toBeTruthy();
    expect(screen.getByText('En hiver, sécateur propre.')).toBeTruthy();
    expect(screen.getByText(/Verger/)).toBeTruthy();
    expect(screen.getByText(/Potager/)).toBeTruthy();
    // m1 est le repère courant → exclu ; reste « Autre repère »
    expect(screen.getByText(/Autres repères/)).toBeTruthy();
    expect(screen.getByText(/Autre repère/)).toBeTruthy();
    expect(screen.queryByText(/Repère courant/)).toBeNull();
  });

  test('bouton « Consulter » présent et déclenche l’aperçu pour un tutoriel intégrable', () => {
    const onOpenTutorialPreview = vi.fn();
    const tutorials = [
      {
        id: 9,
        title: 'Compostage',
        type: 'link',
        source_url: 'https://example.org/compost',
        zones_linked: [],
        markers_linked: [],
      },
    ];
    render(
      <MarkerTutorialCardList
        tutorials={tutorials}
        currentMarkerId="m1"
        onOpenTutorialPreview={onOpenTutorialPreview}
      />,
    );
    const btn = screen.getByRole('button', { name: /Consulter/ });
    fireEvent.click(btn);
    expect(onOpenTutorialPreview).toHaveBeenCalledTimes(1);
    expect(onOpenTutorialPreview.mock.calls[0][0]).toMatchObject({ id: 9 });
  });

  test('aucun bouton « Consulter » sans callback onOpenTutorialPreview', () => {
    const tutorials = [
      {
        id: 9,
        title: 'Compostage',
        type: 'link',
        source_url: 'https://example.org/compost',
        zones_linked: [],
        markers_linked: [],
      },
    ];
    render(<MarkerTutorialCardList tutorials={tutorials} currentMarkerId="m1" />);
    expect(screen.queryByRole('button', { name: /Consulter/ })).toBeNull();
  });
});
