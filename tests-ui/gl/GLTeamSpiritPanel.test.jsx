import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GLTeamSpiritPanel } from '../../src/gl/components/mj/GLTeamSpiritPanel.jsx';

const teams = [
  { id: 1, name: 'Gnomes A' },
  { id: 2, name: 'Licornes A' },
];

/** Ensemble unifié (M14) : six cartes gardées par défaut, le prof touche celles qu'il a retirées. */
describe('GLTeamSpiritPanel — « 6 par défaut »', () => {
  test('sans rien toucher : 6 cartes gardées pour chaque équipe', () => {
    const onSave = vi.fn();
    render(<GLTeamSpiritPanel teams={teams} onSave={onSave} />);
    expect(screen.getByTestId('gl-team-spirit-total-1').textContent).toContain('6 / 6');
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le bilan' }));
    expect(onSave).toHaveBeenCalledWith([
      { teamId: 1, cartesGardees: 6, note: null },
      { teamId: 2, cartesGardees: 6, note: null },
    ]);
  });

  test('toucher une carte la retire ; la retoucher la rend', () => {
    const onSave = vi.fn();
    render(<GLTeamSpiritPanel teams={teams} onSave={onSave} />);
    const carte2 = screen.getByRole('button', { name: 'Carte 2 retirée — Gnomes A' });
    const carte5 = screen.getByRole('button', { name: 'Carte 5 retirée — Gnomes A' });
    fireEvent.click(carte2);
    fireEvent.click(carte5);
    expect(carte2.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('gl-team-spirit-total-1').textContent).toContain('4 / 6');
    fireEvent.click(carte5);
    expect(screen.getByTestId('gl-team-spirit-total-1').textContent).toContain('5 / 6');
    fireEvent.change(screen.getByLabelText('Note — Licornes A'), {
      target: { value: 'belle entraide' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer le bilan' }));
    expect(onSave).toHaveBeenCalledWith([
      { teamId: 1, cartesGardees: 5, note: null },
      { teamId: 2, cartesGardees: 6, note: 'belle entraide' },
    ]);
  });
});
