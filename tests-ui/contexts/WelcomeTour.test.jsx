import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('../../src/contexts/PublicSettingsContext.jsx', () => ({
  usePublicSettings: () => ({ content: { help: { narrator: null }, tour: { registry: null } } }),
}));

import { TourProvider } from '../../src/contexts/TourContext.jsx';
import { WELCOME_TOUR_KEY } from '../../src/constants/discoveryTour.js';

const SEEN_KEY = 'foretmap_discovery_seen_v1';

function renderApp(props = {}) {
  return render(
    <TourProvider tab="map" isTeacher={false} enabled {...props}>
      <div className="nav-btn active">Carte</div>
      <button type="button" className="fm-help-btn">
        ?
      </button>
    </TourProvider>,
  );
}

describe('accueil — OLU se présente à la première connexion', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('à la toute première venue, c’est l’accueil qui se lance, pas le parcours de l’onglet', async () => {
    renderApp();
    expect(await screen.findByText('Salut, moi c’est OLU', {}, { timeout: 2000 })).toBeTruthy();
  });

  test('une fois vu, il ne revient plus — et l’onglet reprend son propre parcours', async () => {
    localStorage.setItem(SEEN_KEY, JSON.stringify({ [WELCOME_TOUR_KEY]: true }));
    renderApp();
    await waitFor(() => expect(document.querySelector('.discovery-tour')).toBeTruthy(), {
      timeout: 2000,
    });
    expect(screen.queryByText('Salut, moi c’est OLU')).toBeNull();
  });

  test('l’accueil est marqué vu dès son démarrage', async () => {
    renderApp();
    await screen.findByText('Salut, moi c’est OLU', {}, { timeout: 2000 });
    const seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}');
    expect(seen[WELCOME_TOUR_KEY]).toBe(true);
  });

  test('ses bulles sont centrées : aucun élément n’est mis en lumière', async () => {
    renderApp();
    await screen.findByText('Salut, moi c’est OLU', {}, { timeout: 2000 });
    expect(document.querySelector('.discovery-tour__spotlight')).toBeNull();
    expect(document.querySelector('.discovery-tour__backdrop')).toBeTruthy();
  });

  test('un prof lit sa propre version', async () => {
    renderApp({ isTeacher: true });
    expect(await screen.findByText(/j’accompagne les n3beurs/, {}, { timeout: 2000 })).toBeTruthy();
  });

  test('parcours désactivés : personne n’est accueilli de force', async () => {
    renderApp({ enabled: false });
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(document.querySelector('.discovery-tour')).toBeNull();
  });
});
