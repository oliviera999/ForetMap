import { describe, test, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { GLGameMasterConsole } from '../../src/gl/components/GLGameMasterConsole.jsx';

const apiGlMock = vi.fn();

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
}));

vi.mock('../../src/gl/context/GLMascotCatalogContext.jsx', () => ({
  useGLMascotCatalog: () => ({
    // Catalogue G&L = packs publiés du studio ForêtMap (type déduit côté serveur).
    mascots: [
      { id: 'srv-gnome-mousse', label: 'Gnome Mousse', type: 'gnome', source: 'foretmap' },
      { id: 'srv-gnome-flamme', label: 'Gnome Flamme', type: 'gnome', source: 'foretmap' },
      { id: 'srv-licorne-aube', label: 'Licorne Aube', type: 'unicorn', source: 'foretmap' },
      { id: 'srv-olu', label: 'Olu', type: null, source: 'foretmap' },
    ],
    reload: vi.fn(),
  }),
}));

const baseProps = {
  chapters: [{ id: 1, title: 'Chapitre test' }],
  classes: [{ id: 1, name: '6e A', is_active: 1 }],
  gameplaySettings: {},
  selectedTeamId: null,
  onSelectTeam: vi.fn(),
  onGameStateChange: vi.fn(),
  onReloadGame: vi.fn(async () => {}),
};

const loadedGameState = {
  game: {
    id: 42,
    name: 'Partie active',
    status: 'draft',
    class_id: 1,
    chapter_id: 1,
    class_name: '6e A',
    chapter_title: 'Chapitre test',
  },
  teams: [
    { id: 7, name: 'Equipe Alpha', type: 'gnome', mascot_id: 'srv-gnome-mousse', color: '#65a30d' },
    { id: 8, name: 'Equipe Beta', type: 'unicorn', mascot_id: 'gl-licorne-aube', color: '#a855f7' },
  ],
  scores: {},
  pendingActions: [],
};

describe('GLGameMasterConsole', () => {
  beforeAll(async () => {
    // Précharge les sous-sections lazy pour éviter les timeouts en suite complète.
    await Promise.all([
      import('../../src/gl/components/mj/GLGameMasterConsoleActiveGameBanner.jsx'),
      import('../../src/gl/components/mj/GLGameMasterConsoleParties.jsx'),
      import('../../src/gl/components/mj/GLGameMasterConsoleTeams.jsx'),
      import('../../src/gl/components/mj/GLGameMasterConsoleLive.jsx'),
    ]);
  });

  beforeEach(() => {
    apiGlMock.mockReset();
    baseProps.onSelectTeam.mockReset();
    baseProps.onGameStateChange.mockReset();
    apiGlMock.mockImplementation((path) => {
      if (String(path).startsWith('/api/gl/games') && !String(path).includes('/42')) {
        return Promise.resolve([
          {
            id: 42,
            name: 'Partie active',
            status: 'draft',
            className: '6e A',
            teamsCount: 1,
          },
        ]);
      }
      return Promise.resolve(null);
    });
  });

  test('affiche la console MJ avec sous-onglets', async () => {
    render(<GLGameMasterConsole {...baseProps} gameState={null} />);

    expect(screen.getByRole('heading', { name: 'Console MJ' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Parties' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Équipes & effectifs' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Jeu en direct' })).toBeTruthy();
    await waitFor(() => expect(apiGlMock).toHaveBeenCalledWith('/api/gl/games?classId=1'));
  });

  test('affiche la bannière partie active et le formulaire d’édition', async () => {
    render(<GLGameMasterConsole {...baseProps} gameState={loadedGameState} />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Partie active' })).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: 'Enregistrer la partie' })).toBeNull();
    expect(document.querySelector('.gl-active-game-banner .gl-badge')).toBeTruthy();
  });

  test('réinitialise l’équipe sélectionnée au chargement d’une partie', async () => {
    render(<GLGameMasterConsole {...baseProps} gameState={null} />);
    await waitFor(() => expect(apiGlMock).toHaveBeenCalled());

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: 'Ouvrir' }).length).toBeGreaterThan(0);
    });

    apiGlMock.mockResolvedValueOnce(loadedGameState);
    fireEvent.click(screen.getAllByRole('button', { name: 'Ouvrir' })[0]);

    await waitFor(() => {
      expect(baseProps.onSelectTeam).toHaveBeenCalledWith(null);
      expect(baseProps.onGameStateChange).toHaveBeenCalled();
    });
  });

  test('affiche un menu déroulant de mascottes filtré par type d’équipe', async () => {
    render(<GLGameMasterConsole {...baseProps} gameState={loadedGameState} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Équipes & effectifs' }));

    const mascotSelect = await screen.findByLabelText('Mascotte', {}, { timeout: 5000 });
    expect(mascotSelect.tagName).toBe('SELECT');
    expect(screen.getByRole('option', { name: 'Gnome Mousse' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Gnome Flamme' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Licorne Aube' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'Olu' })).toBeNull();
    // Aucun id `gl-*` codé en dur : défaut = premier gnome publié pas encore pris (Alpha a Mousse).
    expect(mascotSelect.value).toBe('srv-gnome-flamme');

    // « Tous » : l'autre peuple et les packs sans peuple deviennent accessibles.
    fireEvent.click(screen.getByLabelText(/Tous les packs mascotte/));
    expect(screen.getByRole('option', { name: 'Licorne Aube' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Olu' })).toBeTruthy();
  });

  test('équipe sur un pack dépublié : id conservé, marqué « (pack dépublié) »', async () => {
    render(<GLGameMasterConsole {...baseProps} gameState={loadedGameState} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Équipes & effectifs' }));
    await screen.findByLabelText('Mascotte', {}, { timeout: 5000 });

    expect(screen.getAllByText('gl-licorne-aube (pack dépublié)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Gnome Mousse').length).toBeGreaterThan(0);

    const betaRow = screen.getAllByText('Equipe Beta')[0].closest('tr');
    fireEvent.click(within(betaRow).getByRole('button', { name: 'Modifier' }));
    const mascotSelect = screen.getByLabelText('Mascotte');
    await waitFor(() => expect(mascotSelect.value).toBe('gl-licorne-aube'));
    expect(screen.getByRole('option', { name: 'gl-licorne-aube (pack dépublié)' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Licorne Aube' })).toBeTruthy();
  });

  test('empty state équipes sans partie chargée', async () => {
    render(<GLGameMasterConsole {...baseProps} gameState={null} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Équipes & effectifs' }));

    await waitFor(() => {
      expect(screen.getByText(/Sélectionnez ou créez une partie/i)).toBeTruthy();
    });
  });
});
