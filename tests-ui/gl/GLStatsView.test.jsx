import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GLStatsView } from '../../src/gl/components/GLStatsView.jsx';

vi.mock('../../src/gl/hooks/useGLPlayerStats.js', () => ({
  useGLPlayerStats: vi.fn(),
}));

import { useGLPlayerStats } from '../../src/gl/hooks/useGLPlayerStats.js';

describe('GLStatsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('affiche le chargement', () => {
    useGLPlayerStats.mockReturnValue({ data: null, loading: true, error: '', reload: vi.fn() });
    render(<GLStatsView mode="self" />);
    expect(screen.getByText(/Chargement des statistiques/i)).toBeTruthy();
  });

  it('affiche les stats perso avec vitalité et apprentissages', () => {
    useGLPlayerStats.mockReturnValue({
      data: {
        pseudo: 'JoueurTest',
        vitalityEnabled: true,
        stats: {
          hearts: 5,
          gems: 4,
          hearts_gained: 2,
          hearts_lost: 1,
          gems_gained: 0,
          gems_lost: 2,
          species_learned: 3,
          glossary_learned: 2,
          tutorials_read: 1,
        },
        catalogTotals: { species_total: 10, glossary_total: 20, tutorials_total: 5 },
      },
      loading: false,
      error: '',
      reload: vi.fn(),
    });
    render(<GLStatsView mode="self" />);
    expect(screen.getByText(/Mes statistiques/i)).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText(/Espèces étudiées/i)).toBeTruthy();
    expect(screen.getByText(/3 \/ 10/)).toBeTruthy();
  });

  it('affiche une erreur avec bouton réessayer', () => {
    const reload = vi.fn();
    useGLPlayerStats.mockReturnValue({
      data: null,
      loading: false,
      error: 'Erreur réseau',
      reload,
    });
    render(<GLStatsView mode="self" />);
    expect(screen.getByText('Erreur réseau')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Réessayer/i })).toBeTruthy();
  });

  it('affiche le classement classe', () => {
    useGLPlayerStats.mockReturnValue({
      data: {
        classId: 1,
        vitalityEnabled: true,
        players: [
          {
            id: 1,
            pseudo: 'alpha',
            stats: {
              hearts: 3,
              gems: 2,
              hearts_gained: 1,
              hearts_lost: 0,
              gems_gained: 0,
              gems_lost: 0,
              species_learned: 1,
              glossary_learned: 0,
              tutorials_read: 0,
            },
          },
        ],
        classTotals: {
          active_players: 1,
          hearts: 3,
          gems: 2,
          species_learned: 1,
          glossary_learned: 0,
          tutorials_read: 0,
          catalog: { species_total: 5, glossary_total: 5, tutorials_total: 2 },
        },
        catalogTotals: { species_total: 5, glossary_total: 5, tutorials_total: 2 },
      },
      loading: false,
      error: '',
      reload: vi.fn(),
    });
    render(
      <GLStatsView
        mode="class"
        vitalityEnabled
        classes={[{ id: 1, name: 'Classe A', is_active: 1 }]}
      />,
    );
    expect(screen.getByText(/Statistiques des joueurs/i)).toBeTruthy();
    expect(screen.getByText(/alpha/i)).toBeTruthy();
  });
});
