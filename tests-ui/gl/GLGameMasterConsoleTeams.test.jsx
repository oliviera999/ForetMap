import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const apiGlMock = vi.fn();

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
}));

import GLGameMasterConsoleTeams from '../../src/gl/components/mj/GLGameMasterConsoleTeams.jsx';

function renderTeams(overrides = {}) {
  const props = {
    game: { id: 9, name: 'Partie test', status: 'draft' },
    teams: [],
    teamForm: { name: '', type: 'gnome', mascotId: '' },
    setTeamForm: vi.fn(),
    editingTeamId: null,
    selectableMascots: [],
    defaultMascotByType: () => '',
    addTeam: vi.fn(),
    upsertTeam: (e) => e.preventDefault(),
    resetTeamEditing: vi.fn(),
    teamListRows: [],
    rosterRefreshKey: 0,
    vitalityEnabled: false,
    canImpersonate: false,
    onImpersonationApplied: null,
    onReloadGame: vi.fn(),
    setRosterRefreshKey: vi.fn(),
    onGoToParties: vi.fn(),
    busy: false,
    ...overrides,
  };
  return render(<GLGameMasterConsoleTeams {...props} />);
}

describe('GLGameMasterConsoleTeams — miroir Moodle', () => {
  beforeEach(() => {
    apiGlMock.mockReset();
    apiGlMock.mockImplementation((path) => {
      if (String(path).includes('/teams/mirror')) {
        return Promise.resolve({
          created: [{ name: 'gnomes sylvestres' }],
          renamed: [],
          deleted: [],
          missingIdentities: [],
          notices: [],
        });
      }
      if (String(path).includes('mixing-rate')) {
        return Promise.resolve({ rate: null, gamesCount: 0 });
      }
      return Promise.resolve([]);
    });
  });

  test('Pousser vers Moodle appelle /teams/mirror avec dryRun false', async () => {
    renderTeams();
    fireEvent.click(screen.getByTestId('gl-teams-mirror-apply'));
    await waitFor(() => {
      expect(apiGlMock).toHaveBeenCalledWith('/api/gl/games/9/teams/mirror', 'POST', {
        dryRun: false,
      });
    });
    expect(await screen.findByText(/Miroir poussé/)).toBeTruthy();
  });

  test('Simuler le miroir Moodle envoie dryRun true', async () => {
    renderTeams();
    fireEvent.click(screen.getByTestId('gl-teams-mirror-dry'));
    await waitFor(() => {
      expect(apiGlMock).toHaveBeenCalledWith('/api/gl/games/9/teams/mirror', 'POST', {
        dryRun: true,
      });
    });
  });
});
