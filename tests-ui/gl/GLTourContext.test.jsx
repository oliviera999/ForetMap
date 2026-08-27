import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const apiGLMock = vi.fn();
vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGLMock(...args),
}));

import { GLTourProvider, useGLTour } from '../../src/gl/context/GLTourContext.jsx';
import { GL_WELCOME_TOUR_KEY } from '../../src/gl/constants/glDiscoveryTour.js';
import { invalidateGlHelpConfigCache } from '../../src/gl/hooks/useGlHelpContent.js';
import { invalidateGlNarratorCache } from '../../src/gl/hooks/useGlNarrator.js';

const NARRATOR = { enabled: true, speakerName: 'OLU', fallbackSilhouette: 'olu', portraits: {} };

function Probe() {
  const tour = useGLTour();
  return (
    <div>
      <div className="gl-main-inner">contenu de l’onglet</div>
      <button
        type="button"
        className="gl-help-btn"
        onClick={() => tour.startTour('maps', { force: true })}
      >
        ?
      </button>
      <span data-testid="has-tour">{String(tour.hasTour('maps'))}</span>
      <span data-testid="has-tour-unknown">{String(tour.hasTour('zzz'))}</span>
    </div>
  );
}

function renderTour(props = {}) {
  return render(
    <GLTourProvider tab="maps" enabled={false} {...props}>
      <Probe />
    </GLTourProvider>,
  );
}

describe('visite guidée GL', () => {
  beforeEach(() => {
    apiGLMock.mockReset();
    apiGLMock.mockResolvedValue(NARRATOR);
    invalidateGlNarratorCache();
    invalidateGlHelpConfigCache();
    localStorage.clear();
  });

  test('déclare un parcours pour les onglets qui en ont un', async () => {
    renderTour();
    expect(screen.getByTestId('has-tour').textContent).toBe('true');
    expect(screen.getByTestId('has-tour-unknown').textContent).toBe('false');
  });

  test('lancé à la demande, il affiche la bulle signée du narrateur', async () => {
    renderTour();
    await userEvent.click(screen.getByRole('button', { name: '?' }));
    expect(await screen.findByText('Les cartes du royaume')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('OLU')).toBeTruthy());
    expect(document.querySelector('.discovery-tour')).toBeTruthy();
  });

  test('un MJ lit la variante qui lui est destinée', async () => {
    renderTour({ isStaff: true });
    await userEvent.click(screen.getByRole('button', { name: '?' }));
    expect(
      await screen.findByText('La carte du chapitre en cours, telle que la voient les équipes.'),
    ).toBeTruthy();
  });

  test('les étapes visant un élément absent sont écartées', async () => {
    // `.gl-help-btn` et `.gl-main-inner` existent ici : les trois étapes du parcours
    // « maps » restent jouables, la progression l'affiche.
    renderTour();
    await userEvent.click(screen.getByRole('button', { name: '?' }));
    expect(await screen.findByText(/Étape 1 \/ 3/)).toBeTruthy();
  });

  test('l’auto-démarrage ne rejoue pas un onglet déjà vu', async () => {
    // L'accueil est marqué vu lui aussi : il passe avant tout parcours d'onglet.
    localStorage.setItem('gl_discovery_seen_v1', JSON.stringify({ welcome: true, maps: true }));
    renderTour({ enabled: true });
    await waitFor(() => expect(apiGLMock).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(document.querySelector('.discovery-tour')).toBeNull();
  });

  test('l’auto-démarrage attend que l’aide soit chargée', async () => {
    /*
     * L'étape de relance de tous les parcours vise le bouton « ? », lequel n'est rendu
     * qu'une fois l'aide connue du client. Démarrer avant, c'est perdre cette bulle en
     * silence — et l'onglet étant marqué vu au passage, la perdre pour de bon.
     */
    let releaseHelp = () => {};
    const helpGate = new Promise((resolve) => {
      releaseHelp = () => resolve(NARRATOR);
    });
    apiGLMock.mockImplementation((url) =>
      String(url).includes('/help') ? helpGate : Promise.resolve(NARRATOR),
    );
    localStorage.setItem('gl_discovery_seen_v1', JSON.stringify({ welcome: true }));

    renderTour({ enabled: true });
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(document.querySelector('.discovery-tour')).toBeNull();

    releaseHelp();
    await waitFor(() => expect(document.querySelector('.discovery-tour')).toBeTruthy(), {
      timeout: 2000,
    });
  });

  test('la mémoire GL est distincte de celle de ForetMap', async () => {
    localStorage.setItem(
      'foretmap_discovery_seen_v1',
      JSON.stringify({ welcome: true, maps: true }),
    );
    renderTour({ enabled: true });
    await waitFor(() => expect(document.querySelector('.discovery-tour')).toBeTruthy(), {
      timeout: 2000,
    });
  });
});

describe('accueil GL — OLU se présente à la première connexion', () => {
  beforeEach(() => {
    apiGLMock.mockReset();
    apiGLMock.mockResolvedValue(NARRATOR);
    invalidateGlNarratorCache();
    invalidateGlHelpConfigCache();
    localStorage.clear();
  });

  test('à la toute première venue, l’accueil passe avant le parcours de l’onglet', async () => {
    renderTour({ enabled: true });
    expect(await screen.findByText('Salut, moi c’est OLU', {}, { timeout: 2000 })).toBeTruthy();
    expect(screen.queryByText('Les cartes du royaume')).toBeNull();
  });

  test('une fois vu, l’onglet reprend son propre parcours', async () => {
    localStorage.setItem('gl_discovery_seen_v1', JSON.stringify({ [GL_WELCOME_TOUR_KEY]: true }));
    renderTour({ enabled: true });
    expect(await screen.findByText('Les cartes du royaume', {}, { timeout: 2000 })).toBeTruthy();
  });

  test('OLU ne raconte pas le lore : l’accueil renvoie l’histoire au jeu', async () => {
    renderTour({ enabled: true });
    await screen.findByText('Salut, moi c’est OLU', {}, { timeout: 2000 });
    await userEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    expect(await screen.findByText(/ce n’est pas la mienne à raconter/)).toBeTruthy();
  });

  test('un invité n’est pas accueilli de force — sa progression est éphémère', async () => {
    renderTour({ enabled: false });
    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(document.querySelector('.discovery-tour')).toBeNull();
  });
});
