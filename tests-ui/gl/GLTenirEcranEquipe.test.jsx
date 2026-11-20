import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { GLTenirEcranEquipe } from '../../src/gl/components/tenir/GLTenirEcranEquipe.jsx';
import { resetGlTenirOluCache } from '../../src/gl/hooks/useGlTenirOlu.js';
import { findForbiddenString } from '../../src/shared/glGardeFousCore.js';

const apiGlMock = vi.fn();
vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
}));
// Le temps réel a son propre test (`useGlTempsReelCoupe.test.jsx`) : ici, aucun socket.
vi.mock('../../src/gl/realtime/glSocketClient.js', () => ({
  acquireGlSocket: () => ({ socket: null, release() {} }),
}));

/**
 * Chantier « écrans de séance », étape 4 — l'écran d'équipe en trois choses, monté en entier :
 * le bandeau, le plateau reçu, **une** carte du moment, le tiroir « L'équipe ». Ces tests
 * reprennent les scénarios de l'ancien écran empilé (`GLTenirEquipeView.test.jsx`, gardé pour
 * la surface « tableau ») : ce qui était un bouton grisé est désormais un bouton **absent**.
 */

const TOUT = { jeter: true, lancer: true, repondre: true, fouiller: true, lire: true, tenir: true };
const gameState = {
  game: { id: 7, status: 'live' },
  teams: [
    { id: 2, name: 'Licornes A', type: 'unicorn' },
    { id: 3, name: 'Gnomes A', type: 'gnome' },
  ],
  roster: [
    { playerId: 10, teamId: 2, pseudo: 'joueur-a', powerPoints: 4 },
    { playerId: 11, teamId: 3, pseudo: 'joueur-b', powerPoints: 9 },
  ],
};

function tenirWith(permissions = TOUT, extra = {}) {
  return {
    enabled: true,
    surface: 'tablette',
    settings: { des_count: 2, des_mode_effectif: 'serveur' },
    round: { number: 1, phase: 'jeu' },
    permissions,
    ...extra,
  };
}

/** Réponses du serveur : l'instantané du tour (`tour`), et le reste par chemin (`routes`). */
function brancher(tour = { round: { number: 1, phase: 'jeu' } }, routes = {}) {
  const etat = { tour };
  apiGlMock.mockImplementation(async (path, method) => {
    for (const [fin, reponse] of Object.entries(routes)) {
      if (String(path).endsWith(fin)) {
        return typeof reponse === 'function' ? reponse(path, method) : reponse;
      }
    }
    if (String(path).endsWith('/tenir/tour')) return etat.tour;
    if (String(path).endsWith('/tenir/olu')) return { lignes: [], moments: {} };
    if (method === 'POST') return { ok: true };
    return {};
  });
  return etat;
}

const plateau = <div data-testid="plateau-recu" />;
function ecran(props = {}) {
  return (
    <GLTenirEcranEquipe
      gameState={gameState}
      tenir={tenirWith()}
      teamId={2}
      onReloadGame={vi.fn()}
      onJeter={vi.fn()}
      board={plateau}
      {...props}
    />
  );
}
const etatDuMoment = () => screen.getByTestId('gl-tenir-moment').getAttribute('data-etat');
const lecturesDuTour = () =>
  apiGlMock.mock.calls.filter(([p]) => String(p).endsWith('/tenir/tour')).length;
const gestesMontres = () =>
  [...document.querySelectorAll('[data-geste]')].map((el) => el.getAttribute('data-geste'));

describe('GLTenirEcranEquipe — l’écran d’équipe en trois choses', () => {
  beforeEach(() => {
    apiGlMock.mockReset();
    resetGlTenirOluCache();
    window.sessionStorage.clear();
    brancher();
  });

  test('bandeau, plateau, une carte du moment ; ni en-tête de session, ni mot de surface, ni « Actualiser »', async () => {
    brancher({
      round: { number: 1, phase: 'jeu', questionsEnAttente: [{ teamId: 2, markerId: 31 }] },
      teams: [{ id: 2, hasRolledDiceThisRound: false, casesAVenir: [{ index: 1, label: 'Mare' }] }],
    });
    render(ecran());
    const racine = await screen.findByTestId('gl-tenir-equipe');
    await waitFor(() => expect(gestesMontres()).toContain('repondre'));
    // Le plateau reçu est monté dans sa zone, la carte du moment à côté.
    expect(
      within(screen.getByTestId('gl-tenir-plateau')).getByTestId('plateau-recu'),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId('gl-tenir-moment')).toHaveLength(1);
    // Ordre du gros bouton : répondre, lancer, fouiller, lire, sorts ; trois puces au plus.
    expect(document.querySelector('.gl-tenir-moment__gros')).toHaveAttribute(
      'data-geste',
      'repondre',
    );
    expect(gestesMontres()).toEqual(['repondre', 'lancer', 'fouiller', 'jeter']);
    // Bandeau : l'équipe, la phase en mots d'élève, les bourses de l'équipe seulement.
    const bandeau = screen.getByTestId('gl-tenir-bandeau');
    expect(bandeau).toHaveTextContent('Licornes A');
    expect(screen.getByTestId('gl-tenir-phase')).toHaveTextContent('Tour 1 — À vous de jouer');
    expect(screen.getByTestId('gl-tenir-bourses')).toHaveTextContent('joueur-a');
    expect(screen.getByTestId('gl-tenir-bourses')).toHaveTextContent('💎 4');
    expect(racine).not.toHaveTextContent('joueur-b');
    // Supprimés : le mot de surface, « Actualiser », la liste « Maintenant, vous pouvez… ».
    expect(racine).not.toHaveTextContent(/tablette|hybride|licornes ·/);
    expect(screen.queryByRole('button', { name: 'Actualiser' })).toBeNull();
    expect(racine).not.toHaveTextContent('Maintenant, vous pouvez');
    expect(document.querySelector('[data-geste-possible]')).toBeNull();
    expect(screen.queryByTestId('gl-tenir-reconnexion')).toBeNull();
    // Tiroir fermé par défaut : les cases à venir n'encombrent plus l'écran.
    expect(screen.queryByTestId('gl-tenir-tiroir')).toBeNull();
    expect(screen.queryByTestId('gl-tenir-cases-a-venir')).toBeNull();
    expect(findForbiddenString(racine.textContent)).toBeNull();
  });

  test('droits fermés : les gestes fermés sont absents, jamais grisés', async () => {
    render(
      ecran({
        tenir: tenirWith(
          { jeter: true, lancer: false, repondre: false, fouiller: false, lire: true },
          { surface: 'hybride' },
        ),
      }),
    );
    await waitFor(() => expect(etatDuMoment()).toBe('geste'));
    expect(gestesMontres()).toEqual(['jeter']);
    expect(document.querySelectorAll('button:disabled')).toHaveLength(0);
    expect(document.querySelectorAll('[aria-disabled="true"]')).toHaveLength(0);
  });

  test('aucun droit ouvert en phase de jeu : la carte dit de regarder le plateau, sans bouton', async () => {
    render(ecran({ tenir: tenirWith({}, { surface: 'hybride' }) }));
    await waitFor(() => expect(etatDuMoment()).toBe('joue'));
    expect(screen.getByTestId('gl-tenir-moment-joue')).toHaveTextContent(
      'Pour l’instant, regardez le plateau.',
    );
    expect(gestesMontres()).toEqual([]);
  });

  test('en retrait : une ligne au-dessus de la carte, sans motif', async () => {
    render(ecran({ tenir: tenirWith({ ...TOUT, jeter: false }, { enRetrait: true }) }));
    const ligne = await screen.findByTestId('gl-tenir-en-retrait');
    expect(ligne).toHaveTextContent('En retrait jusqu’à la fin du tour.');
    expect(screen.queryByText(/motif/i)).toBeNull();
  });

  test('jet en suspens (Relance) : case et effet affichés, « Garder ce jet » et « Relance… », rien d’autre', async () => {
    brancher({
      round: {
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
      },
    });
    const onJeter = vi.fn();
    render(ecran({ onJeter }));
    const carte = await screen.findByTestId('gl-tenir-jet-suspens');
    expect(etatDuMoment()).toBe('jet_suspens');
    expect(carte.textContent).toMatch(/Jet de l’équipe : 3/);
    expect(carte.textContent).toMatch(/case 5 « Averse tropicale »/);
    expect(carte.textContent).toMatch(/Effet de la case : Rien ne se passe\./);
    expect(gestesMontres()).toEqual([]);
    fireEvent.click(screen.getByTestId('gl-tenir-relance'));
    expect(onJeter).toHaveBeenCalledWith('SL005');
    fireEvent.click(screen.getByTestId('gl-tenir-garder-jet'));
    await waitFor(() =>
      expect(apiGlMock).toHaveBeenCalledWith('/api/gl/games/7/tenir/arrivee/garder', 'POST', {}),
    );
  });

  test('sans jet en suspens pour l’équipe : pas de carte de jet', async () => {
    brancher({
      round: { number: 1, phase: 'jeu', arriveesEnSuspens: [{ teamId: 9, total: 2 }] },
    });
    render(ecran());
    await waitFor(() => expect(etatDuMoment()).toBe('geste'));
    expect(screen.queryByTestId('gl-tenir-jet-suspens')).toBeNull();
  });

  test('« Répondre » : absent sans question due ; la question prend toute la carte, puis le retour, puis « Continuer »', async () => {
    const etat = brancher(
      { round: { number: 1, phase: 'jeu', questionsEnAttente: [] } },
      {
        '/markers/31/present-question': {
          questionCode: 'TEX-P1-01',
          presentation: {
            presentationToken: 'jeton',
            question: 'Qui disperse les graines du figuier ?',
            choices: [
              { id: 'c1', text: 'Le calao' },
              { id: 'c2', text: 'Le vent seul' },
            ],
          },
        },
        '/qcm/answer': {
          correct: false,
          feedback: 'Pas encore : le figuier compte sur un oiseau.',
        },
      },
    );
    const { rerender } = render(ecran());
    await waitFor(() => expect(etatDuMoment()).toBe('geste'));
    expect(gestesMontres()).not.toContain('repondre');

    // Une question attend l'équipe : un évènement arrive, l'écran relit son tour.
    etat.tour = {
      round: { number: 1, phase: 'jeu', questionsEnAttente: [{ teamId: 2, markerId: 31 }] },
    };
    rerender(ecran({ gameState: { ...gameState, events: [{ id: 1, eventType: 'dice_roll' }] } }));
    const bouton = await screen.findByRole('button', { name: 'Répondre à la question' });
    expect(bouton).toHaveAttribute('data-geste', 'repondre');
    fireEvent.click(bouton);
    await screen.findByText('Qui disperse les graines du figuier ?');
    expect(etatDuMoment()).toBe('question');
    expect(gestesMontres()).toEqual([]);
    fireEvent.click(screen.getByLabelText('Le vent seul'));
    expect(screen.queryByTestId('gl-tenir-debat')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }));
    const retour = await screen.findByTestId('gl-tenir-case-retour');
    expect(retour.textContent).toBe('Pas encore : le figuier compte sur un oiseau.');
    expect(etatDuMoment()).toBe('retour');
    expect(apiGlMock).toHaveBeenCalledWith(
      '/api/gl/games/7/qcm/answer',
      'POST',
      { questionCode: 'TEX-P1-01', presentationToken: 'jeton', choiceId: 'c2' },
      { perimeSilencieux: true },
    );
    // « Continuer » acquitte : la carte revient au geste suivant.
    fireEvent.click(screen.getByTestId('gl-tenir-continuer'));
    await waitFor(() => expect(etatDuMoment()).toBe('geste'));
    expect(screen.queryByTestId('gl-tenir-case-retour')).toBeNull();
  });

  test('la main ailleurs : « Lina répond… », aucun geste ; l’écran se rallume à l’échéance', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const onReloadGame = vi.fn();
      const tenir = tenirWith(TOUT, {
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
      });
      const { rerender } = render(ecran({ tenir, onReloadGame }));
      await waitFor(() => expect(screen.getByTestId('gl-tenir-main')).toBeInTheDocument());
      expect(screen.getByTestId('gl-tenir-main').textContent).toBe('Lina répond…');
      expect(etatDuMoment()).toBe('main_ailleurs');
      expect(gestesMontres()).toEqual([]);
      // La main échoit seule : l'écran se relit, sans attendre un évènement — et les gestes
      // reviennent d'eux-mêmes, même si la relecture n'aboutit pas.
      expect(onReloadGame).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(13500);
      expect(onReloadGame).toHaveBeenCalled();
      await waitFor(() => expect(screen.queryByTestId('gl-tenir-main')).toBeNull());
      expect(gestesMontres()).toContain('lancer');
      // La version d'état a avancé (un autre appareil a joué) : le tour de cet écran se relit.
      const avantVersion = lecturesDuTour();
      rerender(
        ecran({ tenir: { ...tenir, equipe: { ...tenir.equipe, version: 6 } }, onReloadGame }),
      );
      await waitFor(() => expect(lecturesDuTour()).toBeGreaterThan(avantVersion));
      // La main est la sienne : rien ne s'affiche, rien ne disparaît.
      rerender(
        ecran({
          tenir: {
            ...tenir,
            equipe: { ...tenir.equipe, main: { ...tenir.equipe.main, moi: true } },
          },
          onReloadGame,
        }),
      );
      expect(screen.queryByTestId('gl-tenir-main')).toBeNull();
      expect(gestesMontres()).toContain('lancer');
    } finally {
      vi.useRealTimers();
    }
  });

  test('une tablette demande à rejoindre l’équipe : la carte ne montre que la demande ; « Accepter » répond et recharge', async () => {
    const onReloadGame = vi.fn();
    const tenir = tenirWith(TOUT, {
      equipe: {
        gameId: 7,
        teamId: 2,
        version: 1,
        main: null,
        appareils: [{ id: 91, resteSecondes: 80 }],
      },
    });
    render(ecran({ tenir, onReloadGame }));
    await waitFor(() => expect(screen.getByTestId('gl-tenir-appareils')).toBeInTheDocument());
    expect(etatDuMoment()).toBe('appareil');
    expect(gestesMontres()).toEqual([]);
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

  test('une demande d’appareil échoit seule : la carte revient aux gestes, même si la relecture n’aboutit pas', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const onReloadGame = vi.fn();
      const tenir = tenirWith(TOUT, {
        equipe: {
          gameId: 7,
          teamId: 2,
          version: 1,
          main: null,
          appareils: [{ id: 91, resteSecondes: 20 }],
        },
      });
      render(ecran({ tenir, onReloadGame }));
      await waitFor(() => expect(etatDuMoment()).toBe('appareil'));
      // L'état servi ne change pas (relecture sans effet) : l'échéance locale suffit.
      await vi.advanceTimersByTimeAsync(21500);
      expect(onReloadGame).toHaveBeenCalled();
      await waitFor(() => expect(etatDuMoment()).toBe('geste'));
      expect(screen.queryByTestId('gl-tenir-appareils')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  test('spectateur : ni « Garder ce jet », ni « Accepter » une tablette, ni présences — son message reste', async () => {
    brancher({
      round: {
        number: 1,
        phase: 'jeu',
        arriveesEnSuspens: [{ teamId: 2, markerId: 40, index: 4, total: 3, faces: [1, 2] }],
      },
      presences: { requise: true, equipes: [{ teamId: 2, confirmee: false, absents: [10] }] },
    });
    render(
      ecran({
        tenir: tenirWith(
          {},
          {
            spectateur: true,
            equipe: {
              gameId: 7,
              teamId: 2,
              version: 1,
              main: null,
              appareils: [{ id: 91, resteSecondes: 80 }],
            },
          },
        ),
      }),
    );
    await waitFor(() => expect(lecturesDuTour()).toBeGreaterThan(0));
    await waitFor(() => expect(screen.getByTestId('gl-tenir-spectateur')).toBeInTheDocument());
    expect(etatDuMoment()).toBe('joue');
    expect(screen.queryByTestId('gl-tenir-jet-suspens')).toBeNull();
    expect(screen.queryByTestId('gl-tenir-garder-jet')).toBeNull();
    expect(screen.queryByTestId('gl-tenir-appareils')).toBeNull();
    fireEvent.click(screen.getByTestId('gl-tenir-tiroir-bouton'));
    const tiroir = await screen.findByTestId('gl-tenir-tiroir');
    expect(within(tiroir).queryByTestId('gl-presence')).toBeNull();
    expect(within(tiroir).queryByTestId('gl-presence-ouvrir')).toBeNull();
    expect(within(tiroir).queryByText(/vient d’arriver/)).toBeNull();
  });

  test('spectateur : son message, et aucun geste', async () => {
    render(ecran({ tenir: tenirWith({}, { spectateur: true }) }));
    await waitFor(() => expect(screen.getByTestId('gl-tenir-spectateur')).toBeInTheDocument());
    expect(screen.getByTestId('gl-tenir-spectateur').textContent).toMatch(/Tu regardes ce tour/);
    expect(gestesMontres()).toEqual([]);
  });

  test('état périmé : la ligne « Voici où vous en êtes », et l’icône qui relit l’écran', async () => {
    const onReloadGame = vi.fn();
    render(ecran({ onReloadGame }));
    await waitFor(() => expect(etatDuMoment()).toBe('geste'));
    expect(screen.queryByTestId('gl-tenir-reconnexion')).toBeNull();
    const lectures = lecturesDuTour();
    window.dispatchEvent(new CustomEvent('gl:equipe-etat', { detail: { code: 'ETAT_PERIME' } }));
    await waitFor(() => expect(onReloadGame).toHaveBeenCalled());
    expect(lecturesDuTour()).toBeGreaterThan(lectures);
    // Le message reste lisible : le rechargement ne l'efface pas.
    const avis = await screen.findByTestId('gl-tenir-etat-perime');
    expect(avis.textContent).toBe('L’équipe a déjà joué ce geste. Voici où vous en êtes.');
    // Un autre appareil tient la main : pas ce message-là.
    window.dispatchEvent(new CustomEvent('gl:equipe-etat', { detail: { code: 'MAIN_AILLEURS' } }));
    expect(screen.getAllByTestId('gl-tenir-etat-perime')).toHaveLength(1);
    // L'icône de reconnexion n'existe que maintenant ; son clic fait ce que faisait « Actualiser ».
    const relire = screen.getByTestId('gl-tenir-reconnexion');
    expect(relire).toHaveAccessibleName('Relire l’écran');
    const avant = { jeu: onReloadGame.mock.calls.length, tour: lecturesDuTour() };
    fireEvent.click(relire);
    await waitFor(() => expect(lecturesDuTour()).toBeGreaterThan(avant.tour));
    expect(onReloadGame.mock.calls.length).toBeGreaterThan(avant.jeu);
  });

  test('fouille : « Touchez la carte », le plateau prend le bord doré, « Arrêter de fouiller » en sort', async () => {
    const setFouilleMode = vi.fn();
    const chasse = (fouilleMode) => ({
      carnet: { pages: [], fouilles: { restantes: 2, quota: 2, sousVoile: false } },
      fouilleMode,
      setFouilleMode,
      refresh: vi.fn(),
    });
    const { rerender } = render(ecran({ chasse: chasse(false) }));
    await waitFor(() => expect(gestesMontres()).toContain('fouiller'));
    expect(screen.getByTestId('gl-tenir-plateau')).not.toHaveClass('is-fouille');
    fireEvent.click(document.querySelector('[data-geste="fouiller"]'));
    expect(setFouilleMode).toHaveBeenCalledWith(true);

    rerender(ecran({ chasse: chasse(true) }));
    expect(screen.getByTestId('gl-tenir-fouilles')).toHaveTextContent(
      'Touchez la carte · 2 fouilles',
    );
    expect(screen.getByTestId('gl-tenir-plateau')).toHaveClass('is-fouille');
    // En fouille, la carte ne dit qu'une chose.
    expect(gestesMontres()).toEqual(['fouiller']);
    fireEvent.click(screen.getByRole('button', { name: 'Arrêter de fouiller' }));
    expect(setFouilleMode).toHaveBeenLastCalledWith(false);
  });

  test('fouille armée, puis le droit se ferme (dernière fouille jouée ailleurs, phase qui change) : le plateau se désarme seul', async () => {
    const setFouilleMode = vi.fn();
    const chasse = (restantes) => ({
      carnet: { pages: [], fouilles: { restantes, quota: 2, sousVoile: false } },
      fouilleMode: true,
      setFouilleMode,
      refresh: vi.fn(),
    });
    const { rerender } = render(ecran({ chasse: chasse(1) }));
    await waitFor(() => expect(screen.getByTestId('gl-tenir-fouilles')).toBeInTheDocument());
    expect(setFouilleMode).not.toHaveBeenCalledWith(false);
    // Un autre appareil de l'équipe joue la dernière fouille : plus rien à fouiller ici.
    rerender(ecran({ chasse: chasse(0) }));
    await waitFor(() => expect(setFouilleMode).toHaveBeenCalledWith(false));
    // Tant que la chasse n'a pas suivi, ni la carte ni le plateau ne restent en fouille.
    expect(screen.queryByTestId('gl-tenir-fouilles')).toBeNull();
    expect(screen.getByTestId('gl-tenir-plateau')).not.toHaveClass('is-fouille');

    // Même chose quand la phase change, fouilles restantes ou non.
    setFouilleMode.mockClear();
    rerender(
      ecran({
        chasse: chasse(1),
        tenir: tenirWith({}, { round: { number: 1, phase: 'souffle' } }),
      }),
    );
    await waitFor(() => expect(setFouilleMode).toHaveBeenCalledWith(false));
  });

  test('retour d’une fouille : le verdict, « Continuer » ; le geste suivant acquitte aussi', async () => {
    const base = {
      carnet: { pages: [], fouilles: { restantes: 1, quota: 2, sousVoile: false } },
      fouilleMode: false,
      setFouilleMode: vi.fn(),
      refresh: vi.fn(),
    };
    const { rerender } = render(ecran({ chasse: { ...base, dernierVerdict: null } }));
    await waitFor(() => expect(etatDuMoment()).toBe('geste'));
    rerender(ecran({ chasse: { ...base, dernierVerdict: { verdict: 'froid', at: 10 } } }));
    expect(etatDuMoment()).toBe('retour');
    expect(screen.getByTestId('gl-tenir-retour')).toHaveTextContent(
      'Froid : la page dort plus loin.',
    );
    expect(gestesMontres()).toEqual([]);
    fireEvent.click(screen.getByTestId('gl-tenir-continuer'));
    expect(etatDuMoment()).toBe('geste');
    // Un second verdict, puis un changement de phase : le retour s'efface seul.
    rerender(ecran({ chasse: { ...base, dernierVerdict: { verdict: 'chaud', at: 20 } } }));
    expect(etatDuMoment()).toBe('retour');
    rerender(
      ecran({
        chasse: { ...base, dernierVerdict: { verdict: 'chaud', at: 20 } },
        tenir: tenirWith({}, { round: { number: 1, phase: 'souffle' } }),
      }),
    );
    await waitFor(() => expect(etatDuMoment()).toBe('souffle'));
    expect(screen.getByTestId('gl-tenir-moment-souffle')).toHaveTextContent('Le voile avance.');
  });

  test('tiroir « L’équipe » : fermé par défaut ; « Lire » l’ouvre sur le carnet ; il garde les cases à venir et « Mes badges »', async () => {
    brancher({
      round: { number: 1, phase: 'jeu' },
      teams: [
        {
          id: 2,
          hasRolledDiceThisRound: false,
          casesAVenir: [
            { index: 1, label: 'Mare', eventType: 'question' },
            { index: 2, label: null, tonalite: 'souffle' },
          ],
        },
      ],
    });
    const chasse = {
      carnet: {
        pages: [
          {
            zoneKey: 'z1',
            etat: 'trouvee',
            attendUnLecteur: true,
            trouveePar: { type: 'gnome', name: 'Gnomes A' },
          },
        ],
        total: 1,
        fouilles: { restantes: 0, quota: 2, sousVoile: false },
      },
      fouilleMode: false,
      setFouilleMode: vi.fn(),
      refresh: vi.fn(),
    };
    render(ecran({ chasse, tenir: tenirWith({ lire: true, tenir: true }) }));
    // Une page trouvée par l'autre peuple attend un lecteur : « Lire » est le gros bouton.
    const lire = await screen.findByRole('button', { name: /^Lire/ });
    expect(lire).toHaveAttribute('data-geste', 'lire');
    expect(screen.queryByTestId('gl-tenir-tiroir')).toBeNull();
    fireEvent.click(lire);
    const tiroir = await screen.findByTestId('gl-tenir-tiroir');
    expect(tiroir).toHaveAttribute('data-section', 'carnet');
    expect(within(tiroir).getByTestId('gl-tenir-tiroir-carnet')).toBeInTheDocument();
    expect(screen.getByTestId('gl-tenir-tiroir-bouton')).toHaveAttribute('aria-expanded', 'true');
    // Compte d'un élève : « Mes badges » y est, « Changer d'équipe » non.
    expect(within(tiroir).getByRole('button', { name: 'Mes badges' })).toBeInTheDocument();
    expect(screen.queryByTestId('gl-tenir-changer-equipe')).toBeNull();
    fireEvent.click(screen.getByTestId('gl-tenir-tiroir-fermer'));
    expect(screen.queryByTestId('gl-tenir-tiroir')).toBeNull();

    // Le bouton du bandeau l'ouvre sur l'équipe : les cases à venir, en pastilles.
    fireEvent.click(screen.getByTestId('gl-tenir-tiroir-bouton'));
    const cases = await screen.findByTestId('gl-tenir-cases-a-venir');
    expect(cases).toHaveTextContent('Les 2 cases à venir');
    expect(cases).toHaveTextContent('Mare');
    expect(cases).toHaveTextContent('Souffle');
  });

  test('tablette d’équipe : « Changer d’équipe » dans le tiroir, pas de badges', async () => {
    const onChangerEquipe = vi.fn();
    render(ecran({ tablette: true, onChangerEquipe }));
    await waitFor(() => expect(etatDuMoment()).toBe('geste'));
    fireEvent.click(screen.getByTestId('gl-tenir-tiroir-bouton'));
    const tiroir = await screen.findByTestId('gl-tenir-tiroir');
    expect(within(tiroir).queryByRole('button', { name: 'Mes badges' })).toBeNull();
    fireEvent.click(within(tiroir).getByTestId('gl-tenir-changer-equipe'));
    expect(onChangerEquipe).toHaveBeenCalled();
  });

  test('« Il manque quelqu’un ? » : dans la carte tant que l’équipe n’a rien joué, puis dans le tiroir — jamais aux deux endroits', async () => {
    const presences = { requise: true, equipes: [{ teamId: 2, confirmee: false, absents: [] }] };
    const etat = brancher({
      round: { number: 1, phase: 'jeu' },
      teams: [{ id: 2, hasRolledDiceThisRound: false }],
      presences,
    });
    const { rerender } = render(ecran());
    await screen.findByTestId('gl-presence-ouvrir');
    expect(
      within(screen.getByTestId('gl-tenir-moment')).getByTestId('gl-presence-ouvrir'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('gl-tenir-tiroir-bouton'));
    await screen.findByTestId('gl-tenir-tiroir');
    expect(screen.getAllByTestId('gl-presence-ouvrir')).toHaveLength(1);
    fireEvent.click(screen.getByTestId('gl-tenir-tiroir-fermer'));

    // L'équipe a lancé : la présence quitte la carte, elle vit dans le tiroir.
    etat.tour = {
      round: { number: 1, phase: 'jeu' },
      teams: [{ id: 2, hasRolledDiceThisRound: true }],
      presences,
    };
    rerender(ecran({ gameState: { ...gameState, events: [{ id: 1, eventType: 'dice_roll' }] } }));
    await waitFor(() => expect(screen.queryByTestId('gl-presence-ouvrir')).toBeNull());
    fireEvent.click(screen.getByTestId('gl-tenir-tiroir-bouton'));
    const tiroir = await screen.findByTestId('gl-tenir-tiroir');
    expect(within(tiroir).getByTestId('gl-presence-ouvrir')).toBeInTheDocument();
  });

  /**
   * Audit du 19/11/2026, J4 — le prof change la phase ou règle le sablier : l'état de la partie
   * (`tenir.round`, `tenir.sablier`) se recharge par le temps réel, pas l'instantané du tour de
   * cet écran, relu seulement après un geste de l'équipe.
   */
  describe('J4 : l’écran suit le tour servi par l’état de la partie', () => {
    const sablier = { actif: true, phase: { secondes: 300, restantSecondes: 280, enPause: false } };

    test('la phase passée par le prof s’affiche, sablier compris, même si l’instantané date', async () => {
      // L'instantané du tour reste celui de l'ouverture (pire cas : la relecture échoue ou tarde).
      brancher({ round: { number: 1, phase: 'ouverture' }, sablier: null });
      const { rerender } = render(
        ecran({ tenir: tenirWith(TOUT, { round: { number: 1, phase: 'ouverture' } }) }),
      );
      await waitFor(() =>
        expect(screen.getByTestId('gl-tenir-phase')).toHaveTextContent('Tour 1 — Le tour s’ouvre'),
      );
      expect(etatDuMoment()).toBe('attente');
      expect(screen.getByTestId('gl-tenir-moment-attente')).toHaveTextContent(
        'Le tour s’ouvre : à vous de jouer dans un instant.',
      );
      await waitFor(() => expect(lecturesDuTour()).toBe(1));

      rerender(
        ecran({
          gameState: { ...gameState, events: [{ id: 5, eventType: 'tour_phase' }] },
          tenir: tenirWith(TOUT, { round: { number: 1, phase: 'jeu' }, sablier }),
        }),
      );
      expect(screen.getByTestId('gl-tenir-phase')).toHaveTextContent('Tour 1 — À vous de jouer');
      expect(screen.getByTestId('gl-sablier-phase')).toBeInTheDocument();
      await waitFor(() => expect(etatDuMoment()).toBe('geste'));
      // Et l'instantané (cases à venir, présences) est relu sans geste de l'équipe.
      await waitFor(() => expect(lecturesDuTour()).toBe(2));
    });

    test('un tour suivant ouvert par le prof remplace l’instantané du tour précédent', async () => {
      brancher({
        round: { number: 1, phase: 'jeu', questionsEnAttente: [{ teamId: 2, markerId: 31 }] },
      });
      const { rerender } = render(ecran());
      await screen.findByRole('button', { name: 'Répondre à la question' });
      rerender(ecran({ tenir: tenirWith(TOUT, { round: { number: 2, phase: 'ouverture' } }) }));
      expect(screen.getByTestId('gl-tenir-phase')).toHaveTextContent('Tour 2 — Le tour s’ouvre');
      // La question due au tour précédent n'est pas reportée sur le nouveau tour.
      expect(screen.queryByRole('button', { name: 'Répondre à la question' })).toBeNull();
      expect(gestesMontres()).toEqual([]);
    });

    test('tour terminé, puis aucun tour : la carte le dit, les défis de la Trame restent en puce', async () => {
      brancher({ round: { number: 1, phase: 'clos' } });
      const { rerender } = render(
        ecran({ tenir: tenirWith({}, { round: { number: 1, phase: 'clos' } }) }),
      );
      await waitFor(() => expect(etatDuMoment()).toBe('clos'));
      expect(screen.getByTestId('gl-tenir-phase')).toHaveTextContent('Tour 1 — Tour terminé');
      expect(screen.getByTestId('gl-tenir-moment-clos')).toHaveTextContent('Le tour est terminé.');
      expect(gestesMontres()).toEqual(['trame']);

      brancher({ round: null });
      rerender(ecran({ tenir: tenirWith({}, { round: { number: 0, phase: null } }) }));
      await waitFor(() => expect(etatDuMoment()).toBe('attente'));
      expect(screen.getByTestId('gl-tenir-moment-attente')).toHaveTextContent(
        'Le prof ouvre bientôt le tour.',
      );
      expect(screen.getByTestId('gl-tenir-phase')).toHaveTextContent(
        'Le prof ouvre bientôt le tour.',
      );
    });

    test('la partie est close : « Vous êtes au camp », et « Ce qui change »', async () => {
      brancher(
        { round: { number: 3, phase: 'clos' } },
        {
          '/tenir/ce-qui-change': {
            ceQuiChange: {
              plateau: 2,
              lignes: [{ cle: 'plateau', titre: 'Le plateau', texte: 'Un nouveau monde.' }],
            },
          },
        },
      );
      render(
        ecran({
          gameState: { ...gameState, game: { id: 7, status: 'ended' } },
          tenir: tenirWith({}, { round: { number: 3, phase: 'clos' } }),
        }),
      );
      await waitFor(() => expect(etatDuMoment()).toBe('camp'));
      expect(screen.getByTestId('gl-tenir-moment-camp')).toHaveTextContent(
        'Vous êtes au camp : le chapitre est terminé.',
      );
      expect(await screen.findByTestId('gl-ce-qui-change')).toHaveTextContent('Un nouveau monde.');
    });
  });

  /**
   * Audit du 19/11/2026, J7 — l'attente du prof suit les dés en attente du tour (état servi),
   * pas un état local : elle part quand le prof valide ou refuse.
   */
  describe('J7 : « Jet saisi : le prof valide. » suit les dés en attente du tour', () => {
    const physique = { settings: { des_count: 2, des_mode_effectif: 'physique' } };
    const enAttente = [{ id: 4, teamId: 2, mode: 'physique', faces: [1, 1], total: 2 }];

    test('saisie des dés : « Pas maintenant » en sort ; le jet saisi attend le prof, puis l’attente part', async () => {
      let round = { number: 1, phase: 'jeu', desEnAttente: [] };
      apiGlMock.mockImplementation(async (path, method) => {
        if (method === 'POST' && String(path).endsWith('/tenir/lancer')) {
          round = { ...round, desEnAttente: enAttente };
          return { enAttente: true };
        }
        if (String(path).endsWith('/tenir/olu')) return { lignes: [], moments: {} };
        return { round };
      });
      const vue = (r) => ecran({ tenir: tenirWith(TOUT, { ...physique, round: r }) });
      const { rerender } = render(vue(round));
      fireEvent.click(await screen.findByRole('button', { name: /Lancer les dés/ }));
      expect(etatDuMoment()).toBe('saisie_des');
      // Une sortie : l'équipe peut renoncer à saisir tout de suite.
      fireEvent.click(screen.getByTestId('gl-tenir-quitter-saisie'));
      expect(etatDuMoment()).toBe('geste');
      fireEvent.click(screen.getByRole('button', { name: /Lancer les dés/ }));
      fireEvent.click(await screen.findByRole('button', { name: /Saisir le jet/ }));
      // Le geste recharge l'état de la partie : la saisie y figure, en attente.
      await waitFor(() => expect(round.desEnAttente).toHaveLength(1));
      rerender(vue(round));
      await waitFor(() => expect(etatDuMoment()).toBe('jet_attente'));
      expect(screen.getByTestId('gl-tenir-moment-jet_attente')).toHaveTextContent(
        'Jet saisi : le prof valide.',
      );
      expect(gestesMontres()).toEqual([]);

      // Le prof valide : la saisie quitte la file, l'état de la partie se recharge.
      round = { number: 1, phase: 'jeu', desEnAttente: [] };
      rerender(vue(round));
      await waitFor(() => expect(screen.queryByText(/Jet saisi/)).toBeNull());
    });

    test('l’attente s’affiche aussi sur un second appareil de l’équipe, pas pour une autre équipe', async () => {
      const vue = (desEnAttente) =>
        ecran({
          tenir: tenirWith(TOUT, { ...physique, round: { number: 1, phase: 'jeu', desEnAttente } }),
        });
      const { rerender } = render(vue(enAttente));
      expect(await screen.findByText('Jet saisi : le prof valide.')).toBeInTheDocument();
      rerender(vue([{ ...enAttente[0], teamId: 9 }]));
      await waitFor(() => expect(screen.queryByText(/Jet saisi/)).toBeNull());
    });

    test('la saisie des dés ouverte se referme quand « lancer » se ferme, et ne se rouvre pas seule', async () => {
      const etat = brancher({
        round: { number: 1, phase: 'jeu' },
        teams: [{ id: 2, hasRolledDiceThisRound: false }],
      });
      const { rerender } = render(ecran());
      fireEvent.click(await screen.findByRole('button', { name: /Lancer les dés/ }));
      expect(etatDuMoment()).toBe('saisie_des');
      // Un autre appareil de l'équipe lance : le jet est fait, même tour, même phase.
      etat.tour = {
        round: { number: 1, phase: 'jeu' },
        teams: [{ id: 2, hasRolledDiceThisRound: true }],
      };
      rerender(ecran({ gameState: { ...gameState, events: [{ id: 1, eventType: 'dice_roll' }] } }));
      await waitFor(() => expect(etatDuMoment()).not.toBe('saisie_des'));
      // Le jet se rouvre (Relance) : c'est le gros bouton qui revient, pas la saisie.
      etat.tour = {
        round: { number: 1, phase: 'jeu' },
        teams: [{ id: 2, hasRolledDiceThisRound: false }],
      };
      rerender(
        ecran({
          gameState: {
            ...gameState,
            events: [
              { id: 1, eventType: 'dice_roll' },
              { id: 2, eventType: 'spell_effect' },
            ],
          },
        }),
      );
      await screen.findByRole('button', { name: /Lancer les dés/ });
      expect(etatDuMoment()).toBe('geste');
      expect(screen.queryByTestId('gl-tour-des')).toBeNull();
    });

    test('la saisie des dés ouverte ne survit pas au changement de phase', async () => {
      const { rerender } = render(ecran());
      fireEvent.click(await screen.findByRole('button', { name: /Lancer les dés/ }));
      expect(etatDuMoment()).toBe('saisie_des');
      rerender(ecran({ tenir: tenirWith({}, { round: { number: 1, phase: 'souffle' } }) }));
      await waitFor(() => expect(etatDuMoment()).toBe('souffle'));
      // Tour suivant : la saisie ne se rouvre pas d'elle-même.
      rerender(ecran({ tenir: tenirWith(TOUT, { round: { number: 2, phase: 'jeu' } }) }));
      await waitFor(() => expect(etatDuMoment()).toBe('geste'));
      expect(screen.queryByTestId('gl-tour-des')).toBeNull();
    });
  });

  describe('Olu, sur la tablette : « Le Marché et le Seuil s’ouvrent depuis le compte de chacun. »', () => {
    const LIGNE = 'Le Marché et le Seuil s’ouvrent depuis le compte de chacun.';

    test('dite une fois par la tablette, tour ouvert ; pas redite ensuite', async () => {
      const { unmount } = render(ecran({ tablette: true }));
      await waitFor(() => expect(screen.getByTestId('gl-olu-bulle')).toHaveTextContent(LIGNE));
      expect(window.sessionStorage.getItem('gl_olu_comptes_dits')).toBe('1');
      // La phrase n'est plus posée sous l'écran.
      expect(screen.queryByTestId('gl-team-session-comptes')).toBeNull();
      unmount();
      render(ecran({ tablette: true }));
      await waitFor(() => expect(etatDuMoment()).toBe('geste'));
      expect(screen.queryByText(LIGNE)).toBeNull();
    });

    test('le texte du catalogue passe devant le repli', async () => {
      brancher(
        { round: { number: 1, phase: 'jeu' } },
        {
          '/tenir/olu': {
            lignes: [
              {
                id: 'olu-pf-comptes',
                moment: 'premiere_fois',
                texte: 'Le Marché et le Seuil : depuis le compte de chacun.',
                expression: 'explique',
              },
            ],
            moments: {},
          },
        },
      );
      render(ecran({ tablette: true }));
      await waitFor(() =>
        expect(screen.getByTestId('gl-olu-bulle')).toHaveTextContent(
          'Le Marché et le Seuil : depuis le compte de chacun.',
        ),
      );
    });

    test('retirée du catalogue (`actif: false`), elle ne se dit plus : le repli ne sert que sans catalogue', async () => {
      brancher(
        { round: { number: 1, phase: 'jeu' } },
        {
          '/tenir/olu': {
            lignes: [{ id: 'olu-01', moment: 'ouverture', texte: 'La caravane repart.' }],
            moments: {},
          },
        },
      );
      render(ecran({ tablette: true }));
      await waitFor(() => expect(etatDuMoment()).toBe('geste'));
      await waitFor(() =>
        expect(apiGlMock.mock.calls.some(([p]) => String(p).endsWith('/tenir/olu'))).toBe(true),
      );
      expect(screen.queryByText(LIGNE)).toBeNull();
      expect(window.sessionStorage.getItem('gl_olu_comptes_dits')).toBeNull();
    });

    test('pas sur le compte d’un élève, pas hors tour, pas tant que le Marché est fermé', async () => {
      const { unmount } = render(ecran());
      await waitFor(() => expect(etatDuMoment()).toBe('geste'));
      expect(screen.queryByText(LIGNE)).toBeNull();
      unmount();

      const horsTour = render(
        ecran({ tablette: true, tenir: tenirWith({}, { round: { number: 0, phase: null } }) }),
      );
      await waitFor(() => expect(etatDuMoment()).toBe('attente'));
      expect(screen.queryByText(LIGNE)).toBeNull();
      horsTour.unmount();

      render(
        ecran({
          tablette: true,
          tenir: tenirWith(TOUT, {
            settings: { des_count: 2, des_mode_effectif: 'serveur', marche: false },
          }),
        }),
      );
      await waitFor(() => expect(etatDuMoment()).toBe('geste'));
      expect(screen.queryByText(LIGNE)).toBeNull();
      expect(window.sessionStorage.getItem('gl_olu_comptes_dits')).toBeNull();
    });
  });

  test('rien à montrer sans équipe ou sans « Tenir à deux »', () => {
    const { container, rerender } = render(ecran({ teamId: 99 }));
    expect(container).toBeEmptyDOMElement();
    rerender(ecran({ tenir: { ...tenirWith(), enabled: false } }));
    expect(container).toBeEmptyDOMElement();
  });
});
