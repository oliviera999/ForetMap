import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { GLGameMasterConsole } from '../../src/gl/components/GLGameMasterConsole.jsx';

const apiGlMock = vi.fn();

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
}));

describe('GLGameMasterConsole', () => {
  beforeEach(() => {
    apiGlMock.mockReset();
    apiGlMock.mockImplementation((path) => {
      if (path === '/api/gl/mascots') return Promise.resolve({ mascots: [] });
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
    await waitFor(() => expect(apiGlMock).toHaveBeenCalledWith('/api/gl/mascots'));
  });
});
