import { describe, test, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { MapRouteBar } from '../../src/shared/map-routes/MapRouteBar.jsx';

/** Barre de parcours partagée : vue d'ensemble (tout le tracé) puis étapes une à une. */

const route = { slug: 'tour', title: 'Le tour du jardin', description: 'Un petit tour.' };
const steps = [
  { index: 0, number: 1, place: { kind: 'zone', id: 1, name: 'Verger' }, step: {} },
  { index: 1, number: 2, place: { kind: 'marker', id: 11, name: 'Compost' }, step: {} },
  { index: 2, number: 3, place: { kind: 'marker', id: 12, name: 'Mare' }, step: {} },
];

describe('MapRouteBar', () => {
  test('la vue d’ensemble résume le parcours sans lister les étapes, et lance « Commencer »', () => {
    const onBegin = vi.fn();
    render(
      <MapRouteBar
        route={route}
        steps={steps}
        index={0}
        phase="overview"
        onBegin={onBegin}
        onGoToIndex={() => {}}
        onExit={() => {}}
      />,
    );
    const bar = screen.getByTestId('map-route-bar');
    expect(bar.getAttribute('data-phase')).toBe('overview');
    expect(screen.getByText(/Vue d’ensemble — 3 étapes/)).toBeTruthy();
    // Les étapes se lisent sur la carte (reliées et numérotées), pas dans une liste qui la masque.
    expect(screen.queryByRole('list')).toBe(null);
    expect(screen.queryByText('Compost')).toBe(null);
    expect(screen.queryByText('Précédent')).toBe(null);

    fireEvent.click(screen.getByRole('button', { name: 'Commencer le parcours' }));
    expect(onBegin).toHaveBeenLastCalledWith(0);
  });

  test('revenir à la vue d’ensemble en cours de route propose de reprendre l’étape', () => {
    const onBegin = vi.fn();
    render(
      <MapRouteBar
        route={route}
        steps={steps}
        index={1}
        phase="overview"
        onBegin={onBegin}
        onGoToIndex={() => {}}
        onExit={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reprendre à l’étape 2' }));
    expect(onBegin).toHaveBeenLastCalledWith(1);
  });

  test('en étape, le bouton carte ramène à la vue d’ensemble', () => {
    const onShowOverview = vi.fn();
    render(
      <MapRouteBar
        route={route}
        steps={steps}
        index={1}
        phase="steps"
        onShowOverview={onShowOverview}
        onGoToIndex={() => {}}
        onExit={() => {}}
      />,
    );
    expect(screen.getByTestId('map-route-bar').getAttribute('data-phase')).toBe('steps');
    expect(screen.getByText('Étape 2 sur 3')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Revoir la vue d’ensemble du parcours' }));
    expect(onShowOverview).toHaveBeenCalledTimes(1);
  });
});
