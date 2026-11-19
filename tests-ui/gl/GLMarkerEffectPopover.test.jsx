import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const apiGL = vi.fn();
vi.mock('../../src/gl/services/apiGL.js', () => ({ apiGL: (...args) => apiGL(...args) }));

import { GLMarkerEffectPopover } from '../../src/gl/components/GLMarkerEffectPopover.jsx';

const marker = { id: 7, label: 'Trame 2', description: 'Un fil de la Trame.' };
const sansEffet = { markerId: 7, sansEffet: true, effectSummary: null, hasEffects: false };

function monter(props = {}) {
  const onClose = vi.fn();
  const onApplied = vi.fn();
  render(
    <GLMarkerEffectPopover
      open
      marker={marker}
      gameId={3}
      teamId={12}
      loading={false}
      onClose={onClose}
      onApplied={onApplied}
      {...props}
    />,
  );
  return { onClose, onApplied };
}

describe('GLMarkerEffectPopover — case où un sort ou le vent a posé l’équipe', () => {
  beforeEach(() => apiGL.mockReset());

  it('élève : la case ne se joue pas, un seul bouton « Fermer »', () => {
    monter({ arrival: sansEffet, canApplyEffects: false });
    expect(screen.getByText(/la case ne se joue pas/)).toBeTruthy();
    expect(screen.queryByText('Appliquer les effets (MJ)')).toBeNull();
    expect(screen.queryByText('Ne pas appliquer')).toBeNull();
    expect(screen.getByText('Fermer')).toBeTruthy();
  });

  it('prof : « Appliquer les effets (MJ) » applique, « Ne pas appliquer » ferme sans rien appliquer', async () => {
    const arrival = { ...sansEffet, effetPossible: 'Case Trame : +1 gemme.' };
    const premier = monter({ arrival, canApplyEffects: true });
    expect(screen.getByText(/Case Trame : \+1 gemme\./)).toBeTruthy();
    fireEvent.click(screen.getByText('Ne pas appliquer'));
    expect(premier.onClose).toHaveBeenCalled();
    expect(apiGL).not.toHaveBeenCalled();

    apiGL.mockResolvedValue({ ok: true });
    fireEvent.click(screen.getByText('Appliquer les effets (MJ)'));
    await waitFor(() => expect(premier.onApplied).toHaveBeenCalled());
    expect(apiGL).toHaveBeenCalledWith('/api/gl/games/3/markers/7/apply-effects', 'POST', {
      teamId: 12,
      reason: 'Trame 2',
    });
  });

  it('case jouée normalement : rien ne change', () => {
    monter({
      arrival: { markerId: 7, effectSummary: 'Case Trame : +1 gemme.', hasEffects: true },
      vitality: { applied: true, powerDelta: 1, healthDelta: 0, target: 'team' },
      canApplyEffects: true,
    });
    expect(screen.queryByText(/la case ne se joue pas/)).toBeNull();
    expect(screen.queryByText('Ne pas appliquer')).toBeNull();
    expect(screen.getByText('Fermer')).toBeTruthy();
  });
});
