import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { GLTenirEquipeView } from '../../src/gl/components/tenir/GLTenirEquipeView.jsx';

const apiGlMock = vi.fn();
vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
}));

const gameState = {
  game: { id: 7, status: 'live' },
  teams: [{ id: 2, name: 'Licornes A', type: 'unicorn' }],
  roster: [
    { playerId: 10, teamId: 2, pseudo: 'joueur-a', healthPoints: 3, powerPoints: 4 },
    { playerId: 11, teamId: 3, pseudo: 'joueur-b' },
  ],
};

function tenirWith(permissions, extra = {}) {
  return {
    enabled: true,
    surface: 'tablette',
    settings: { des_count: 2, des_mode_effectif: 'serveur' },
    round: { number: 1, phase: 'jeu' },
    permissions,
    ...extra,
  };
}

describe('GLTenirEquipeView', () => {
  beforeEach(() => {
    apiGlMock.mockReset();
    apiGlMock.mockResolvedValue({ round: { number: 1, phase: 'jeu' } });
  });

  test('grise les gestes selon les permissions servies (tablette en jeu : tout ouvert)', async () => {
    // « Répondre » s'allume quand une question de case attend l'équipe (lot 2).
    apiGlMock.mockResolvedValue({
      round: { number: 1, phase: 'jeu', questionsEnAttente: [{ teamId: 2, markerId: 31 }] },
    });
    render(
      <GLTenirEquipeView
        gameState={gameState}
        tenir={tenirWith({ jeter: true, lancer: true, repondre: true, fouiller: true, lire: true })}
        teamId={2}
        onReloadGame={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('gl-tenir-equipe')).toBeInTheDocument());
    for (const geste of ['jeter', 'lancer', 'repondre', 'fouiller', 'lire']) {
      expect(
        screen.getByRole('button', {
          name: new RegExp(geste === 'repondre' ? 'Répondre' : geste, 'i'),
        }).disabled,
      ).toBe(false);
    }
    expect(screen.getByText(/joueur-a/)).toBeInTheDocument();
    expect(screen.queryByText(/joueur-b/)).toBeNull();
  });

  test('hybride hors fenêtre : fouiller grisé, lancer/répondre grisés, lire ouvert', async () => {
    render(
      <GLTenirEquipeView
        gameState={gameState}
        tenir={tenirWith(
          { jeter: true, lancer: false, repondre: false, fouiller: false, lire: true },
          { surface: 'hybride' },
        )}
        teamId={2}
        onReloadGame={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('gl-tenir-equipe')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Fouiller' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Lancer' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Répondre' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Lire' }).disabled).toBe(false);
  });

  test('en retrait : mention visible, sans motif', async () => {
    render(
      <GLTenirEquipeView
        gameState={gameState}
        tenir={tenirWith(
          { jeter: false, lancer: true, repondre: true, fouiller: true, lire: true },
          { enRetrait: true },
        )}
        teamId={2}
        onReloadGame={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText(/en retrait jusqu’à la fin du tour/)).toBeInTheDocument(),
    );
    expect(screen.queryByText(/motif/i)).toBeNull();
  });

  test('jet en suspens (Relance) : case et effet affichés, « Garder ce jet » et « Relance… »', async () => {
    const round = {
      number: 1,
      phase: 'jeu',
      arriveesEnSuspens: [
        {
          teamId: 2,
          markerId: 40,
          index: 4,
          total: 3,
          faces: [1, 2],
          label: 'Averse tropicale',
          question: false,
          effectSummary: 'Rien ne se passe.',
          relanceSpellCode: 'SL005',
        },
      ],
    };
    apiGlMock.mockImplementation((url, method) =>
      Promise.resolve(method === 'POST' ? { ok: true } : { round }),
    );
    const onJeter = vi.fn();
    render(
      <GLTenirEquipeView
        gameState={gameState}
        tenir={tenirWith({ jeter: true, lancer: true, repondre: true, fouiller: true, lire: true })}
        teamId={2}
        onReloadGame={vi.fn()}
        onJeter={onJeter}
      />,
    );
    const carte = await screen.findByTestId('gl-tenir-jet-suspens');
    expect(carte.textContent).toMatch(/Jet de l’équipe : 3/);
    expect(carte.textContent).toMatch(/case 5 « Averse tropicale »/);
    expect(carte.textContent).toMatch(/Effet de la case : Rien ne se passe\./);
    fireEvent.click(screen.getByTestId('gl-tenir-relance'));
    expect(onJeter).toHaveBeenCalledWith('SL005');
    fireEvent.click(screen.getByTestId('gl-tenir-garder-jet'));
    await waitFor(() =>
      expect(apiGlMock).toHaveBeenCalledWith('/api/gl/games/7/tenir/arrivee/garder', 'POST', {}),
    );
  });

  test('« Répondre » : éteint sans question due ; présente la question de la case due, puis le retour du serveur', async () => {
    const round = { number: 1, phase: 'jeu', questionsEnAttente: [] };
    apiGlMock.mockImplementation(async (path, method) => {
      if (path === '/api/gl/games/7/tenir/tour') return { round };
      if (path === '/api/gl/games/7/markers/31/present-question' && method === 'POST') {
        return {
          questionCode: 'TEX-P1-01',
          presentation: {
            presentationToken: 'jeton',
            question: 'Qui disperse les graines du figuier ?',
            choices: [
              { id: 'c1', text: 'Le calao' },
              { id: 'c2', text: 'Le vent seul' },
            ],
          },
        };
      }
      if (path === '/api/gl/games/7/qcm/answer') {
        return { correct: false, feedback: 'Pas encore : le figuier compte sur un oiseau.' };
      }
      return {};
    });
    const { rerender } = render(
      <GLTenirEquipeView
        gameState={gameState}
        tenir={tenirWith({ jeter: true, lancer: true, repondre: true, fouiller: true, lire: true })}
        teamId={2}
        onReloadGame={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('gl-tenir-equipe')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Répondre' }).disabled).toBe(true);

    // Une question attend l'équipe (elle a pu être déplacée depuis par un sort).
    round.questionsEnAttente = [{ teamId: 2, markerId: 31 }];
    fireEvent.click(screen.getByRole('button', { name: 'Actualiser' }));
    rerender(
      <GLTenirEquipeView
        gameState={gameState}
        tenir={tenirWith({ jeter: true, lancer: true, repondre: true, fouiller: true, lire: true })}
        teamId={2}
        onReloadGame={vi.fn()}
      />,
    );
    const bouton = await screen.findByRole('button', { name: 'Répondre à la question' });
    expect(bouton.disabled).toBe(false);
    fireEvent.click(bouton);
    await screen.findByText('Qui disperse les graines du figuier ?');
    fireEvent.click(screen.getByLabelText('Le vent seul'));
    // Question de case : le bouton s'appelle « Valider » (sans délai de débat réglé ici).
    expect(screen.queryByTestId('gl-tenir-debat')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }));
    const retour = await screen.findByTestId('gl-tenir-case-retour');
    expect(retour.textContent).toBe('Pas encore : le figuier compte sur un oiseau.');
    expect(apiGlMock).toHaveBeenCalledWith(
      '/api/gl/games/7/qcm/answer',
      'POST',
      { questionCode: 'TEX-P1-01', presentationToken: 'jeton', choiceId: 'c2' },
      { perimeSilencieux: true },
    );
  });

  test('délai de débat : « Valider » ne s’allume qu’après le délai réglé', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      apiGlMock.mockImplementation(async (path, method) => {
        if (path === '/api/gl/games/7/tenir/tour') {
          return {
            round: { number: 1, phase: 'jeu', questionsEnAttente: [{ teamId: 2, markerId: 31 }] },
          };
        }
        if (path === '/api/gl/games/7/markers/31/present-question' && method === 'POST') {
          return {
            questionCode: 'TEX-P1-01',
            presentation: {
              presentationToken: 'jeton',
              question: 'Qui disperse les graines du figuier ?',
              choices: [
                { id: 'c1', text: 'Le calao' },
                { id: 'c2', text: 'Le vent seul' },
              ],
            },
          };
        }
        return {};
      });
      const tenir = tenirWith({ jeter: true, lancer: true, repondre: true, fouiller: true });
      tenir.settings = { ...tenir.settings, delai_debat_secondes: 8 };
      render(
        <GLTenirEquipeView gameState={gameState} tenir={tenir} teamId={2} onReloadGame={vi.fn()} />,
      );
      fireEvent.click(await screen.findByRole('button', { name: 'Répondre à la question' }));
      await screen.findByText('Qui disperse les graines du figuier ?');
      fireEvent.click(screen.getByLabelText('Le calao'));
      const valider = screen.getByRole('button', { name: 'Valider' });
      expect(valider.disabled).toBe(true);
      expect(screen.getByTestId('gl-tenir-debat').textContent).toMatch(/s’allume dans 8 s/);
      await vi.advanceTimersByTimeAsync(5000);
      await waitFor(() =>
        expect(screen.getByTestId('gl-tenir-debat').textContent).toMatch(/dans 3 s/),
      );
      expect(valider.disabled).toBe(true);
      await vi.advanceTimersByTimeAsync(3500);
      await waitFor(() => expect(valider.disabled).toBe(false));
      expect(screen.queryByTestId('gl-tenir-debat')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  test('la main ailleurs : « Lina répond… », gestes éteints ; l’écran se relit à l’échéance', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const onReloadGame = vi.fn();
      const tenir = tenirWith(
        { jeter: true, lancer: true, repondre: true, fouiller: true, lire: true },
        {
          equipe: {
            gameId: 7,
            teamId: 2,
            version: 5,
            main: {
              moi: false,
              geste: 'repondre',
              tablette: false,
              prenom: 'Lina',
              texte: 'Lina répond…',
              resteSecondes: 12,
            },
            appareils: [],
          },
        },
      );
      const { rerender } = render(
        <GLTenirEquipeView
          gameState={gameState}
          tenir={tenir}
          teamId={2}
          onReloadGame={onReloadGame}
        />,
      );
      await waitFor(() => expect(screen.getByTestId('gl-tenir-main')).toBeInTheDocument());
      expect(screen.getByTestId('gl-tenir-main').textContent).toBe('Lina répond…');
      for (const geste of ['jeter', 'lancer', 'repondre', 'fouiller', 'lire']) {
        expect(document.querySelector(`[data-geste="${geste}"]`).disabled).toBe(true);
      }
      // La main échoit seule : l'écran se relit, sans attendre un évènement — et le grisé se
      // lève de lui-même, même si la relecture n'aboutit pas (l'état servi n'a pas changé ici).
      expect(onReloadGame).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(13500);
      expect(onReloadGame).toHaveBeenCalled();
      await waitFor(() => expect(screen.queryByTestId('gl-tenir-main')).toBeNull());
      expect(document.querySelector('[data-geste="lancer"]').disabled).toBe(false);
      // La version d'état a avancé (un autre appareil a joué) : le tour de cet écran se relit.
      const lecturesDuTour = () =>
        apiGlMock.mock.calls.filter((c) => c[0] === '/api/gl/games/7/tenir/tour').length;
      const avantVersion = lecturesDuTour();
      rerender(
        <GLTenirEquipeView
          gameState={gameState}
          tenir={{ ...tenir, equipe: { ...tenir.equipe, version: 6 } }}
          teamId={2}
          onReloadGame={onReloadGame}
        />,
      );
      await waitFor(() => expect(lecturesDuTour()).toBeGreaterThan(avantVersion));
      // La main est la sienne : rien ne s'affiche, rien ne s'éteint.
      rerender(
        <GLTenirEquipeView
          gameState={gameState}
          tenir={{
            ...tenir,
            equipe: { ...tenir.equipe, main: { ...tenir.equipe.main, moi: true } },
          }}
          teamId={2}
          onReloadGame={onReloadGame}
        />,
      );
      expect(screen.queryByTestId('gl-tenir-main')).toBeNull();
      expect(document.querySelector('[data-geste="lancer"]').disabled).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  test('une tablette demande à rejoindre l’équipe : « Accepter » répond et recharge', async () => {
    const onReloadGame = vi.fn();
    const tenir = tenirWith(
      { lancer: true },
      {
        equipe: {
          gameId: 7,
          teamId: 2,
          version: 1,
          main: null,
          appareils: [{ id: 91, resteSecondes: 80 }],
        },
      },
    );
    render(
      <GLTenirEquipeView
        gameState={gameState}
        tenir={tenir}
        teamId={2}
        onReloadGame={onReloadGame}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('gl-tenir-appareils')).toBeInTheDocument());
    expect(screen.getByText('Une tablette demande à rejoindre l’équipe.')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('gl-tenir-appareil-accepter-91'));
    await waitFor(() =>
      expect(apiGlMock).toHaveBeenCalledWith(
        '/api/gl/games/7/tenir/sessions/91/accepter',
        'POST',
        {},
      ),
    );
    await waitFor(() => expect(onReloadGame).toHaveBeenCalled());
  });

  test('spectateur : le message, et aucun geste ouvert', async () => {
    const tous = { jeter: false, lancer: false, repondre: false, fouiller: false, lire: false };
    render(
      <GLTenirEquipeView
        gameState={gameState}
        tenir={tenirWith(tous, { spectateur: true })}
        teamId={2}
        onReloadGame={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('gl-tenir-spectateur')).toBeInTheDocument());
    expect(screen.getByTestId('gl-tenir-spectateur').textContent).toMatch(/Tu regardes ce tour/);
    for (const geste of ['lancer', 'repondre', 'fouiller', 'lire']) {
      expect(document.querySelector(`[data-geste="${geste}"]`).disabled).toBe(true);
    }
  });

  test('un geste refusé pour état périmé recharge l’écran (« Voici où vous en êtes »)', async () => {
    const onReloadGame = vi.fn();
    render(
      <GLTenirEquipeView
        gameState={gameState}
        tenir={tenirWith({ lancer: true })}
        teamId={2}
        onReloadGame={onReloadGame}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('gl-tenir-equipe')).toBeInTheDocument());
    const lectures = apiGlMock.mock.calls.length;
    window.dispatchEvent(new CustomEvent('gl:equipe-etat', { detail: { code: 'ETAT_PERIME' } }));
    await waitFor(() => expect(onReloadGame).toHaveBeenCalled());
    expect(apiGlMock.mock.calls.length).toBeGreaterThan(lectures);
    // Le message reste lisible : le rechargement ne l'efface pas.
    const avis = await screen.findByTestId('gl-tenir-etat-perime');
    expect(avis.textContent).toBe('L’équipe a déjà joué ce geste. Voici où vous en êtes.');
    // Un autre appareil tient la main : pas ce message-là, le bandeau de la main suffit.
    window.dispatchEvent(new CustomEvent('gl:equipe-etat', { detail: { code: 'MAIN_AILLEURS' } }));
    expect(screen.getAllByTestId('gl-tenir-etat-perime')).toHaveLength(1);
  });

  test('sans jet en suspens pour l’équipe : pas de carte', async () => {
    apiGlMock.mockResolvedValue({
      round: { number: 1, phase: 'jeu', arriveesEnSuspens: [{ teamId: 9, total: 2 }] },
    });
    render(
      <GLTenirEquipeView
        gameState={gameState}
        tenir={tenirWith({ jeter: true, lancer: true, repondre: true, fouiller: true, lire: true })}
        teamId={2}
        onReloadGame={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('gl-tenir-equipe')).toBeInTheDocument());
    expect(screen.queryByTestId('gl-tenir-jet-suspens')).toBeNull();
  });
});
