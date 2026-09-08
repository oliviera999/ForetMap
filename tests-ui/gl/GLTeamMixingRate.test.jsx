import { describe, test, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';

const apiGlMock = vi.fn();

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
}));

import { GLTeamMixingRate } from '../../src/gl/components/mj/GLTeamMixingRate.jsx';
import {
  formatMixingRate,
  GL_TEAM_POLICIES,
  GL_TEAM_POLICY_BY_ID,
} from '../../src/gl/utils/glTeamCompositionRecipes.js';

describe('GLTeamMixingRate', () => {
  // Accolades obligatoires : un mock renvoyé par le hook serait pris pour une fonction de nettoyage.
  beforeEach(() => {
    apiGlMock.mockReset();
  });

  test('formatMixingRate : phrase factuelle, null sans historique', () => {
    expect(formatMixingRate(null)).toBeNull();
    expect(formatMixingRate({ rate: null, pairsPossible: 0 })).toBeNull();
    expect(
      formatMixingRate({ rate: 12 / 28, pairsSeen: 12, pairsPossible: 28, gamesCount: 2 }),
    ).toBe('43 % des binômes possibles déjà réunis (12 sur 28, 2 parties)');
    expect(formatMixingRate({ rate: 0, pairsSeen: 0, pairsPossible: 10, gamesCount: 0 })).toBe(
      '0 % des binômes possibles déjà réunis (0 sur 10)',
    );
  });

  test('politiques : trois entrées, index par identifiant', () => {
    expect(GL_TEAM_POLICIES.map((p) => p.id)).toEqual([
      'reshuffle_each',
      'reshuffle_per_plateau',
      'carry_over',
    ]);
    expect(GL_TEAM_POLICY_BY_ID.carry_over.label).toMatch(/Reconduire/);
  });

  test('affiche le brassage de la classe et se rafraîchit avec la clé', async () => {
    apiGlMock.mockResolvedValue({
      rate: 0.5,
      pairsSeen: 14,
      pairsPossible: 28,
      gamesCount: 3,
    });
    const { rerender } = render(<GLTeamMixingRate gameId={9} refreshKey={0} />);
    await waitFor(() => expect(screen.getByTestId('gl-team-mixing')).toBeTruthy());
    expect(screen.getByTestId('gl-team-mixing').textContent).toMatch(/50 %.*14 sur 28.*3 parties/);
    expect(apiGlMock).toHaveBeenCalledWith('/api/gl/games/9/teams/compose/mixing-rate', 'GET');
    rerender(<GLTeamMixingRate gameId={9} refreshKey={1} />);
    await waitFor(() => expect(apiGlMock).toHaveBeenCalledTimes(2));
  });

  test('rien d’affiché sans historique ni en cas d’erreur', async () => {
    apiGlMock.mockImplementation(() => Promise.reject(new Error('boom')));
    render(<GLTeamMixingRate gameId={9} />);
    await waitFor(() => expect(apiGlMock).toHaveBeenCalled());
    // Laisse la promesse rejetée se régler avant le démontage (sinon rejet « non géré » signalé).
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByTestId('gl-team-mixing')).toBeNull();
  });
});
