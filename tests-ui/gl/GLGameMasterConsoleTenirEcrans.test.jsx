import { describe, test, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { GLGameMasterConsole } from '../../src/gl/components/GLGameMasterConsole.jsx';

/**
 * Console MJ après la simulation du 7 novembre 2026 :
 * - « Ouvrir » une partie ne provoque aucune écriture (PUT) parasite ;
 * - une partie « Tenir à deux » en cours ouvre « Jouer le tour » par défaut ;
 * - les réglages hérités passent dans un repli « Réglages hors Tenir », fermé ;
 * - le sélecteur de chapitres ne propose que les plateaux, préfixés « Plateau N — ».
 */

const apiGlMock = vi.fn();

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
  getGlToken: () => 'jeton-test',
}));

vi.mock('../../src/gl/context/GLMascotCatalogContext.jsx', () => ({
  useGLMascotCatalog: () => ({
    mascots: [
      { id: 'gl-gnome-mousse', label: 'Gnome Mousse', type: 'gnome', source: 'gl' },
      { id: 'gl-licorne-aube', label: 'Licorne Aube', type: 'unicorn', source: 'gl' },
    ],
    reload: vi.fn(),
  }),
}));

vi.mock('../../src/gl/components/mj/GLTourScreen.jsx', () => ({
  GLTourScreen: () => <div data-testid="stub-tour-screen" />,
}));

const chapters = [
  { id: 1, title: 'Chapitre 1 — La forêt magique', plateau_number: null },
  { id: 2, title: 'test', plateau_number: null },
  { id: 3, title: 'Chapitre 1 — Tropiques africains', plateau_number: 1 },
];

const baseProps = {
  chapters,
  classes: [{ id: 1, name: '6e A', is_active: 1 }],
  gameplaySettings: {},
  selectedTeamId: null,
  onSelectTeam: vi.fn(),
  onGameStateChange: vi.fn(),
  onReloadGame: vi.fn(async () => {}),
};

function gameState(status, tenirEnabled) {
  return {
    game: {
      id: 42,
      name: 'Partie Tenir',
      status,
      class_id: 1,
      chapter_id: 3,
      class_name: '6e A',
      chapter_title: 'Chapitre 1 — Tropiques africains',
      zone_content_retrigger: 'once_per_game',
      lore_feuillet_retrigger: null,
    },
    teams: [{ id: 7, name: 'Les Racines', type: 'gnome', mascot_id: 'gl-gnome-mousse' }],
    scores: {},
    pendingActions: [],
    tenir: tenirEnabled ? { enabled: true, profil: 'complet', surface: 'tablette' } : null,
  };
}

describe('GLGameMasterConsole — écrans Tenir', () => {
  beforeAll(async () => {
    await Promise.all([
      import('../../src/gl/components/mj/GLGameMasterConsoleActiveGameBanner.jsx'),
      import('../../src/gl/components/mj/GLGameMasterConsoleParties.jsx'),
      import('../../src/gl/components/mj/GLGameMasterConsoleTeams.jsx'),
      import('../../src/gl/components/mj/GLGameMasterConsoleLive.jsx'),
    ]);
  });

  beforeEach(() => {
    apiGlMock.mockReset();
    apiGlMock.mockImplementation((path, method = 'GET') => {
      if (method === 'GET' && String(path).startsWith('/api/gl/games')) return Promise.resolve([]);
      return Promise.resolve({});
    });
  });

  test('charger une partie n’envoie aucun PUT parasite', async () => {
    render(<GLGameMasterConsole {...baseProps} gameState={gameState('draft', false)} />);
    await screen.findByText('Partie Tenir');
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    });
    const puts = apiGlMock.mock.calls.filter((c) => c[1] === 'PUT');
    expect(puts).toEqual([]);
  });

  test('partie tenir en cours : « Jouer le tour » ouvert par défaut, réglages hérités repliés', async () => {
    render(<GLGameMasterConsole {...baseProps} gameState={gameState('live', true)} />);
    await screen.findByText('Partie Tenir');
    await waitFor(() => expect(screen.getByTestId('stub-tour-screen')).toBeTruthy());
    const tab = screen.getByRole('tab', { name: 'Jouer le tour' });
    expect(tab.getAttribute('aria-selected')).toBe('true');
    const repli = await screen.findByTestId('gl-reglages-hors-tenir');
    expect(repli.hasAttribute('open')).toBe(false);
    expect(repli.textContent).toMatch(/Réglages hors Tenir/);
  });

  test('sélecteur de chapitres : plateaux seuls, préfixés, hors plateau sur demande', async () => {
    render(<GLGameMasterConsole {...baseProps} gameState={gameState('draft', false)} />);
    await screen.findByText('Partie Tenir');
    const options = () =>
      Array.from(document.querySelectorAll('select option'))
        .map((o) => o.textContent)
        .filter((t) => /Plateau|forêt magique|^test$/.test(t));
    expect(options()).toEqual(['Plateau 1 — Chapitre 1 — Tropiques africains']);
    const checkbox = screen.getAllByLabelText('Afficher les chapitres hors plateau')[0];
    await act(async () => {
      checkbox.click();
    });
    expect(options()).toContain('Chapitre 1 — La forêt magique');
    expect(options()).toContain('test');
  });
});
