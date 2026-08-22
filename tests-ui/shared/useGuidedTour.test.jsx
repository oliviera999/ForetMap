import React from 'react';
import { describe, test, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

import { useGuidedTour } from '../../src/shared/hooks/useGuidedTour.js';

/**
 * Le moteur de visite guidée, sur le point qui décide si une visite est **perdue**.
 *
 * Le filtrage des étapes lit le DOM à un instant donné : une cible encore en cours de
 * chargement fait disparaître son étape. Si l'onglet était malgré tout marqué « vu »,
 * un simple aléa de réseau coûterait la visite définitivement — elle ne se relancerait
 * plus jamais toute seule.
 */

const STORAGE_KEY = 'test_guided_tour_seen';

function Harness({ steps, tab }) {
  const tour = useGuidedTour({ getSteps: () => steps, storageKey: STORAGE_KEY });
  return (
    <div>
      <button type="button" onClick={() => tour.startTour(tab)}>
        démarrer
      </button>
      <span data-testid="active">{tour.active ? String(tour.active.steps.length) : 'aucun'}</span>
      <span data-testid="seen">{tour.hasSeenTour(tab) ? 'vu' : 'jamais'}</span>
    </div>
  );
}

function start() {
  act(() => {
    screen.getByRole('button', { name: 'démarrer' }).click();
  });
}

describe('useGuidedTour — ce qui compte comme « vu »', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('un parcours dont aucune étape ne s’affiche n’est pas marqué vu', () => {
    render(<Harness tab="absent" steps={[{ key: 'a', target: '#jamais-rendu', body: 'x' }]} />);
    start();

    expect(screen.getByTestId('active')).toHaveTextContent('aucun');
    // Le point du test : l'onglet reste à découvrir, la visite se rejouera quand sa
    // cible existera.
    expect(screen.getByTestId('seen')).toHaveTextContent('jamais');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  test('un parcours qui affiche au moins une étape est marqué vu', () => {
    render(
      <Harness
        tab="present"
        steps={[
          { key: 'a', target: '#jamais-rendu', body: 'x' },
          { key: 'b', target: null, body: 'y' },
        ]}
      />,
    );
    start();

    // Seule l'étape sans cible survit au filtrage — cela suffit à avoir présenté quelque chose.
    expect(screen.getByTestId('active')).toHaveTextContent('1');
    expect(screen.getByTestId('seen')).toHaveTextContent('vu');
  });

  test('un parcours déjà vu ne redémarre pas tout seul', () => {
    render(<Harness tab="present" steps={[{ key: 'b', target: null, body: 'y' }]} />);
    start();
    expect(screen.getByTestId('seen')).toHaveTextContent('vu');

    act(() => {
      screen.getByRole('button', { name: 'démarrer' }).click();
    });
    // Rejouable à la demande via `force`, jamais par simple retour sur l'onglet.
    expect(screen.getByTestId('seen')).toHaveTextContent('vu');
  });
});
