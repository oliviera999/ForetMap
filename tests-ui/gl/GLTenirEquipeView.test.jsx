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

  /**
   * Audit du 19/11/2026, J4 — le prof change la phase ou règle le sablier : l'état de la partie
   * (`tenir.round`, `tenir.sablier`) se recharge par le temps réel, pas l'instantané du tour de
   * cet écran, relu seulement après un geste de l'équipe.
   */
  describe('J4 : l’écran suit le tour servi par l’état de la partie', () => {
    const permissions = { jeter: true, lancer: true, repondre: true, fouiller: true, lire: true };
    const sablier = { actif: true, phase: { secondes: 300, restantSecondes: 280, enPause: false } };
    function lectures() {
      return apiGlMock.mock.calls.filter(([p]) => String(p).endsWith('/tenir/tour')).length;
    }

    test('la phase passée par le prof s’affiche, sablier compris, même si l’instantané date', async () => {
      // L'instantané du tour reste celui de l'ouverture (pire cas : la relecture échoue ou tarde).
      apiGlMock.mockResolvedValue({ round: { number: 1, phase: 'ouverture' }, sablier: null });
      const ouverture = tenirWith(permissions, { round: { number: 1, phase: 'ouverture' } });
      const { rerender } = render(
        <GLTenirEquipeView
          gameState={gameState}
          tenir={ouverture}
          teamId={2}
          onReloadGame={vi.fn()}
        />,
      );
      await waitFor(() => expect(screen.getByText(/Tour 1 — ouverture/)).toBeInTheDocument());
      await waitFor(() => expect(lectures()).toBe(1));

      rerender(
        <GLTenirEquipeView
          gameState={{ ...gameState, events: [{ id: 5, eventType: 'tour_phase' }] }}
          tenir={tenirWith(permissions, { round: { number: 1, phase: 'jeu' }, sablier })}
          teamId={2}
          onReloadGame={vi.fn()}
        />,
      );
      expect(screen.getByText(/Tour 1 — jeu/)).toBeInTheDocument();
      expect(screen.getByTestId('gl-sablier-phase')).toBeInTheDocument();
      // Et l'instantané (cases à venir, présences) est relu sans geste de l'équipe.
      await waitFor(() => expect(lectures()).toBe(2));
    });

    test('un tour suivant ouvert par le prof remplace l’instantané du tour précédent', async () => {
      apiGlMock.mockResolvedValue({
        round: { number: 1, phase: 'clos', questionsEnAttente: [{ teamId: 2, markerId: 31 }] },
      });
      const { rerender } = render(
        <GLTenirEquipeView
          gameState={gameState}
          tenir={tenirWith(permissions, { round: { number: 1, phase: 'clos' } })}
          teamId={2}
          onReloadGame={vi.fn()}
        />,
      );
      await waitFor(() => expect(screen.getByText(/Tour 1 — tour clos/)).toBeInTheDocument());
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Répondre à la question' })).toBeInTheDocument(),
      );
      rerender(
        <GLTenirEquipeView
          gameState={gameState}
          tenir={tenirWith(permissions, { round: { number: 2, phase: 'ouverture' } })}
          teamId={2}
          onReloadGame={vi.fn()}
        />,
      );
      expect(screen.getByText(/Tour 2 — ouverture/)).toBeInTheDocument();
      // La question due au tour précédent n'est pas reportée sur le nouveau tour.
      expect(screen.queryByRole('button', { name: 'Répondre à la question' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Répondre' }).disabled).toBe(true);
    });

    test('aucun tour ouvert : le message d’attente reste', async () => {
      apiGlMock.mockResolvedValue({ round: null });
      render(
        <GLTenirEquipeView
          gameState={gameState}
          tenir={tenirWith(permissions, { round: { number: 0, phase: null } })}
          teamId={2}
          onReloadGame={vi.fn()}
        />,
      );
      await waitFor(() => expect(screen.getByTestId('gl-tenir-equipe')).toBeInTheDocument());
      await waitFor(() => expect(lectures()).toBe(1));
      expect(screen.getByText(/Aucun tour ouvert : attends le prof/)).toBeInTheDocument();
    });
  });

  /**
   * Audit du 19/11/2026, J7 — « Jet saisi : en attente du clic du prof » était un état local posé
   * après le 202 et jamais retiré : il restait après la validation ou le refus du prof.
   */
  describe('J7 : l’attente du clic du prof suit les dés en attente du tour', () => {
    const permissions = { jeter: true, lancer: true, repondre: true, fouiller: true, lire: true };
    const physique = { settings: { des_count: 2, des_mode_effectif: 'physique' } };
    const enAttente = [{ id: 4, teamId: 2, mode: 'physique', faces: [1, 1], total: 2 }];

    test('le message disparaît quand le prof a validé (ou refusé) le jet', async () => {
      let round = { number: 1, phase: 'jeu', desEnAttente: [] };
      apiGlMock.mockImplementation(async (path, method) => {
        if (method === 'POST' && String(path).endsWith('/tenir/lancer')) {
          round = { ...round, desEnAttente: enAttente };
          return { enAttente: true };
        }
        return { round };
      });
      const vue = (r) => (
        <GLTenirEquipeView
          gameState={gameState}
          tenir={tenirWith(permissions, { ...physique, round: r })}
          teamId={2}
          onReloadGame={vi.fn()}
        />
      );
      const { rerender } = render(vue(round));
      await waitFor(() => expect(screen.getByTestId('gl-tenir-equipe')).toBeInTheDocument());
      fireEvent.click(screen.getByRole('button', { name: 'Lancer' }));
      fireEvent.click(await screen.findByRole('button', { name: /Saisir le jet/ }));
      // Le geste recharge l'état de la partie : la saisie y figure, en attente.
      await waitFor(() => expect(round.desEnAttente).toHaveLength(1));
      rerender(vue(round));
      expect(await screen.findByText(/Jet saisi : en attente du clic du prof/)).toBeInTheDocument();

      // Le prof valide : la saisie quitte la file, l'état de la partie se recharge.
      round = { number: 1, phase: 'jeu', desEnAttente: [] };
      rerender(vue(round));
      await waitFor(() =>
        expect(screen.queryByText(/Jet saisi : en attente du clic du prof/)).toBeNull(),
      );
    });

    test('le message s’affiche aussi sur un second appareil de l’équipe, pas pour une autre équipe', async () => {
      apiGlMock.mockResolvedValue({ round: { number: 1, phase: 'jeu' } });
      const vue = (desEnAttente) => (
        <GLTenirEquipeView
          gameState={gameState}
          tenir={tenirWith(permissions, {
            ...physique,
            round: { number: 1, phase: 'jeu', desEnAttente },
          })}
          teamId={2}
          onReloadGame={vi.fn()}
        />
      );
      const { rerender } = render(vue(enAttente));
      expect(await screen.findByText(/Jet saisi : en attente du clic du prof/)).toBeInTheDocument();
      rerender(vue([{ ...enAttente[0], teamId: 9 }]));
      expect(screen.queryByText(/Jet saisi : en attente du clic du prof/)).toBeNull();
    });
  });
});
