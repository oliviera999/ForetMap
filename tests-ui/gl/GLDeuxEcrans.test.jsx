import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const apiGlMock = vi.fn();
vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
}));
vi.mock('../../src/gl/components/GLGameBoard.jsx', () => ({
  GLGameBoard: () => <div data-testid="stub-board" />,
}));
vi.mock('../../src/gl/components/mj/GLTourJournal.jsx', () => ({
  GLTourJournal: () => <div data-testid="stub-journal" />,
}));
vi.mock('../../src/gl/components/tenir/GLDefisCasePanel.jsx', () => ({
  GLDefisCasePanel: () => null,
}));

import { GLTenirEquipeView } from '../../src/gl/components/tenir/GLTenirEquipeView.jsx';
import { GLCeQuiChange } from '../../src/gl/components/tenir/GLCeQuiChange.jsx';
import { GLProjectionView } from '../../src/gl/components/tenir/GLProjectionView.jsx';

// Ensemble unifié, étape 2.3 (M8, M10) : « Maintenant, vous pouvez… », « Ce qui change »,
// accroche de fin de séance.
const FORBIDDEN =
  /monstre|ennemi|attaque|poursui|corbeau|Krâ|Kraa|Grise|\bfaux\b|raté|perdu|classement/;
const gameState = (status = 'live') => ({
  game: { id: 7, status },
  teams: [
    { id: 2, name: 'Gnomes A', type: 'gnome' },
    { id: 3, name: 'Licornes A', type: 'unicorn' },
  ],
  roster: [1, 2, 3, 4, 5].map((n) => ({ playerId: n, teamId: 2, pseudo: `joueur-${n}` })),
});
const tenir = (extra = {}) => ({
  enabled: true,
  surface: 'tablette',
  settings: { des_count: 2, des_mode_effectif: 'serveur' },
  round: { number: 2, phase: 'jeu' },
  permissions: {
    jeter: true,
    lancer: true,
    repondre: true,
    fouiller: true,
    lire: true,
    tenir: true,
  },
  escalier: null,
  ...extra,
});
const chasse = {
  carnet: {
    total: 2,
    tenues: 0,
    trouvees: 1,
    fouilles: { restantes: 2, quota: 2, sousVoile: false },
    pages: [
      {
        zoneKey: 'z1',
        indice: 'Là où le vent se pose',
        etat: 'trouvee',
        attendUnLecteur: true,
        trouveePar: { id: 3, name: 'Licornes A', type: 'unicorn' },
      },
      {
        zoneKey: 'z2',
        indice: 'Sous la pierre moussue',
        etat: 'trouvee',
        attendUnLecteur: true,
        trouveePar: { id: 2, name: 'Gnomes A', type: 'gnome' },
      },
    ],
  },
  fouilleMode: false,
  setFouilleMode: vi.fn(),
  busy: false,
  error: '',
  page: null,
};

describe('« Maintenant, vous pouvez… »', () => {
  beforeEach(() => {
    apiGlMock.mockReset();
    apiGlMock.mockResolvedValue({
      round: { number: 2, phase: 'jeu', questionsEnAttente: [{ teamId: 2, markerId: 31 }] },
      teams: [{ id: 2, hasRolledDiceThisRound: false, auCamp: false, desProchainJet: 2 }],
    });
  });

  test('en tête de l’écran d’équipe : chaque geste possible, avec l’appel du rôle, jamais bloquant', async () => {
    render(
      <GLTenirEquipeView
        gameState={gameState()}
        tenir={tenir()}
        teamId={2}
        chasse={chasse}
        onReloadGame={vi.fn()}
        onJeter={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(document.querySelector('[data-geste-possible="repondre"]')).toBeTruthy(),
    );
    const bandeau = screen.getByTestId('gl-tenir-maintenant');
    expect(bandeau.querySelector('h4').textContent).toBe('Maintenant, vous pouvez…');
    expect([...bandeau.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      'Gestionnaire : lancer les dés',
      'Éclaireuse ou Éclaireur : la question de la case',
      'Opératrice ou Opérateur : 2 fouilles',
      // Une seule page attend un lecteur de mon peuple : celle que l'autre peuple a trouvée.
      'Secrétaire : 1 page à lire et à faire tenir',
      'Assistante ou Assistant : les sorts',
    ]);
    // Un conseil : les boutons des gestes ne dépendent d'aucun rôle.
    for (const geste of ['lancer', 'repondre', 'fouiller', 'lire', 'jeter']) {
      expect(document.querySelector(`[data-geste="${geste}"]`).disabled).toBe(false);
    }
    expect(bandeau.textContent).not.toMatch(FORBIDDEN);
  });

  test('escalier, séance 1 : ni sorts ni « tenir » dans la liste ; à quatre, l’Assistante ou l’Assistant répond', async () => {
    const etat = gameState();
    etat.roster = etat.roster.slice(0, 4);
    render(
      <GLTenirEquipeView
        gameState={etat}
        tenir={tenir({
          permissions: { lancer: true, repondre: true, fouiller: true, lire: true, tenir: false },
          escalier: { pas: 1, dernier: 4, monte: false, modules: ['avancer'], sorts: [] },
        })}
        teamId={2}
        chasse={chasse}
        onReloadGame={vi.fn()}
        onJeter={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(document.querySelector('[data-geste-possible="repondre"]')).toBeTruthy(),
    );
    const lignes = [...screen.getByTestId('gl-tenir-maintenant').querySelectorAll('li')].map(
      (li) => li.textContent,
    );
    expect(lignes).toEqual([
      'Gestionnaire : lancer les dés',
      'Assistante ou Assistant : la question de la case',
      'Opératrice ou Opérateur : 2 fouilles',
    ]);
  });

  test('hors tour : les défis de la Trame, pour toute l’équipe', async () => {
    apiGlMock.mockResolvedValue({ round: null, teams: [] });
    render(
      <GLTenirEquipeView
        gameState={gameState()}
        tenir={tenir({ round: null, permissions: { lire: true, tenir: true } })}
        teamId={2}
        onReloadGame={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('gl-tenir-maintenant')).toBeInTheDocument());
    expect(screen.getByTestId('gl-tenir-maintenant').textContent).toContain(
      'Toute l’équipe : les défis de la Trame',
    );
  });
});

describe('« Ce qui change » et accroche de fin de séance', () => {
  const LIGNES = [
    { cle: 'peuple', titre: 'Ton peuple', texte: 'Tu passes chez les Licornes.' },
    { cle: 'sorts', titre: 'Tes nouveaux sorts', texte: 'Grand Regard, Cordée.' },
    { cle: 'plateau', titre: 'Le plateau', texte: 'Le voile avance un peu plus vite.' },
  ];

  beforeEach(() => {
    apiGlMock.mockReset();
  });

  test('trois lignes servies par le serveur ; rien au dernier plateau, rien si la lecture échoue', async () => {
    apiGlMock.mockResolvedValue({ ceQuiChange: { plateau: 2, lignes: LIGNES } });
    const { unmount } = render(<GLCeQuiChange gameId={7} />);
    await waitFor(() => expect(screen.getByTestId('gl-ce-qui-change')).toBeInTheDocument());
    expect(apiGlMock).toHaveBeenCalledWith('/api/gl/games/7/tenir/ce-qui-change');
    expect(
      [...screen.getByTestId('gl-ce-qui-change').querySelectorAll('li')].map(
        (li) => li.textContent,
      ),
    ).toEqual([
      'Ton peuple : Tu passes chez les Licornes.',
      'Tes nouveaux sorts : Grand Regard, Cordée.',
      'Le plateau : Le voile avance un peu plus vite.',
    ]);
    unmount();
    apiGlMock.mockResolvedValue({ ceQuiChange: null });
    render(<GLCeQuiChange gameId={7} />);
    await waitFor(() => expect(apiGlMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId('gl-ce-qui-change')).toBeNull();
    apiGlMock.mockRejectedValue(new Error('hors ligne'));
    render(<GLCeQuiChange gameId={8} />);
    await waitFor(() => expect(apiGlMock).toHaveBeenCalledTimes(3));
    expect(screen.queryByTestId('gl-ce-qui-change')).toBeNull();
  });

  const projection = ({ status = 'live', phase = 'clos', passeur = true } = {}) =>
    apiGlMock.mockImplementation((path) => {
      if (path === '/api/gl/games/9') {
        return Promise.resolve({
          game: { id: 9, name: 'Classe 6e', status },
          markers: [],
          teams: [],
          tenir: { state: { voilePosition: -1 } },
        });
      }
      if (path === '/api/gl/games/9/tenir/tour') {
        return Promise.resolve({
          round: {
            number: 1,
            phase,
            passeur: passeur ? { titre: 'La page du jour', texte: 'Le chemin continue.' } : null,
          },
          teams: [],
        });
      }
      if (path === '/api/gl/games/9/chasse') {
        return Promise.resolve({
          tenues: 0,
          total: 2,
          pages: [
            { zoneKey: 'z1', indice: 'Là où l’eau se cache', etat: 'trouvee' },
            { zoneKey: 'z2', indice: 'Là où le vent se pose', etat: 'endormie' },
          ],
        });
      }
      if (path === '/api/gl/games/9/tenir/ce-qui-change') {
        return Promise.resolve({ ceQuiChange: { plateau: 2, lignes: LIGNES.slice(1) } });
      }
      return Promise.resolve({});
    });

  test('projection, tour clos : la page du Passeur et l’indice d’une zone qui dort encore', async () => {
    projection();
    render(<GLProjectionView gameId={9} token="t" />);
    await waitFor(() => expect(screen.getByTestId('gl-projection-accroche')).toBeInTheDocument());
    const accroche = screen.getByTestId('gl-projection-accroche');
    expect(accroche.querySelector('h2').textContent).toBe('À la prochaine séance');
    expect(accroche.textContent).toContain('Le chemin continue.');
    expect(screen.getByTestId('gl-projection-accroche-indice').textContent).toBe(
      'Une page dort encore : « Là où le vent se pose »',
    );
    // La page du Passeur n'est pas redite plus bas.
    expect(document.querySelectorAll('.gl-tour-passeur')).toHaveLength(1);
    expect(accroche.textContent).not.toMatch(FORBIDDEN);
    expect(screen.queryByTestId('gl-ce-qui-change')).toBeNull();
  });

  test('projection : pas d’accroche pendant le jeu ; au camp, « Ce qui change » à la place', async () => {
    projection({ phase: 'jeu' });
    const { unmount } = render(<GLProjectionView gameId={9} token="t" />);
    await waitFor(() => expect(screen.getByTestId('gl-projection')).toBeInTheDocument());
    await waitFor(() => expect(apiGlMock).toHaveBeenCalledTimes(3));
    expect(screen.queryByTestId('gl-projection-accroche')).toBeNull();
    unmount();
    projection({ status: 'ended' });
    render(<GLProjectionView gameId={9} token="t" />);
    await waitFor(() => expect(screen.getByTestId('gl-ce-qui-change')).toBeInTheDocument());
    expect(screen.queryByTestId('gl-projection-accroche')).toBeNull();
    expect(screen.getByTestId('gl-ce-qui-change').textContent).toContain('Grand Regard, Cordée.');
  });
});
