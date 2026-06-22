import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi } from 'vitest';
import { GLGameBoardRoster } from '../../src/gl/components/GLGameBoardRoster.jsx';

describe('GLGameBoardRoster', () => {
  const teams = [
    { id: 1, name: 'Gnomes', color: '#22c55e' },
    { id: 2, name: 'Licornes', color: '#a855f7' },
  ];
  const roster = [
    {
      playerId: 10,
      teamId: 1,
      teamName: 'Gnomes',
      pseudo: 'Alice',
      healthPoints: 3,
      powerPoints: 2,
    },
  ];

  test('affiche les équipes et joueurs avec compteurs si vitalité active', () => {
    render(
      <GLGameBoardRoster
        teams={teams}
        roster={roster}
        vitalityEnabled
        currentTeamId={1}
        playerId={10}
      />,
    );
    expect(screen.getByTestId('gl-map-roster')).toBeInTheDocument();
    expect(screen.getByTestId('gl-map-roster-team-1')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('(vous)')).toBeInTheDocument();
    expect(screen.getByText('Tour')).toBeInTheDocument();
    const rosterEl = screen.getByTestId('gl-map-roster');
    expect(rosterEl).toHaveTextContent('3');
    expect(rosterEl).toHaveTextContent('2');
    expect(screen.getByText('Aucun joueur dans cette équipe')).toBeInTheDocument();
  });

  test('noms seulement si vitalité désactivée', () => {
    render(<GLGameBoardRoster teams={teams} roster={roster} vitalityEnabled={false} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.queryByText('3')).not.toBeInTheDocument();
  });

  test('masqué si aucune équipe', () => {
    const { container } = render(<GLGameBoardRoster teams={[]} roster={[]} />);
    expect(container.firstChild).toBeNull();
  });

  test('remonte onSelectTeam au clic sur la case équipe', () => {
    const onSelectTeam = vi.fn();
    render(
      <GLGameBoardRoster
        teams={teams}
        roster={roster}
        selectedTeamId={null}
        onSelectTeam={onSelectTeam}
      />,
    );
    fireEvent.click(screen.getByTestId('gl-map-roster-team-2'));
    expect(onSelectTeam).toHaveBeenCalledWith(2);
  });
});
