import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { GLGameMasterConsole } from '../../src/gl/components/GLGameMasterConsole.jsx';

const apiGlMock = vi.fn();

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
}));

vi.mock('../../src/gl/context/GLMascotCatalogContext.jsx', () => ({
  useGLMascotCatalog: () => ({
    mascots: [
      { id: 'gl-gnome-mousse', label: 'Gnome Mousse', type: 'gnome', source: 'gl' },
      { id: 'gl-gnome-flamme', label: 'Gnome Flamme', type: 'gnome', source: 'gl' },
      { id: 'gl-licorne-aube', label: 'Licorne Aube', type: 'unicorn', source: 'gl' },
    ],
    reload: vi.fn(),
  }),
}));

describe('GLGameMasterConsole', () => {
  beforeEach(() => {
    apiGlMock.mockReset();
    apiGlMock.mockImplementation((path) => {
      if (String(path).startsWith('/api/gl/games')) return Promise.resolve([]);
      return Promise.resolve(null);
    });
  });

  test('affiche la console MJ sans erreur de rendu', async () => {
    render(
      <GLGameMasterConsole
        chapters={[{ id: 1, title: 'Chapitre test' }]}
        classes={[{ id: 1, name: '6e A', is_active: 1 }]}
        gameState={null}
        gameplaySettings={{}}
        selectedTeamId={null}
        onSelectTeam={() => {}}
        onGameStateChange={() => {}}
        onReloadGame={async () => {}}
      />
    );

    expect(screen.getByRole('heading', { name: 'Console MJ' })).toBeTruthy();
    await waitFor(() => expect(apiGlMock).toHaveBeenCalledWith('/api/gl/games'));
  });

  test('affiche un menu déroulant de mascottes filtré par type d’équipe', async () => {
    render(
      <GLGameMasterConsole
        chapters={[{ id: 1, title: 'Chapitre test' }]}
        classes={[{ id: 1, name: '6e A', is_active: 1 }]}
        gameState={null}
        gameplaySettings={{}}
        selectedTeamId={null}
        onSelectTeam={() => {}}
        onGameStateChange={() => {}}
        onReloadGame={async () => {}}
      />
    );

    await waitFor(() => expect(apiGlMock).toHaveBeenCalledWith('/api/gl/games'));

    const mascotSelect = screen.getByLabelText('Mascotte');
    expect(mascotSelect.tagName).toBe('SELECT');
    expect(screen.getByRole('option', { name: 'Gnome Mousse' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Gnome Flamme' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: 'Licorne Aube' })).toBeNull();
  });
});
