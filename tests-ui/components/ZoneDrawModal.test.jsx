import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ZoneDrawModal } from '../../src/components/map/ZoneDrawModal.jsx';

function renderModal(overrides = {}) {
  const onSave = vi.fn(async () => {});
  const onClose = vi.fn();
  render(
    <ZoneDrawModal
      points_pct={[
        { xp: 10, yp: 10 },
        { xp: 20, yp: 20 },
        { xp: 30, yp: 30 },
      ]}
      plants={[{ id: 1, name: 'Tomate', emoji: '🍅' }]}
      onSave={onSave}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onSave, onClose };
}

describe('ZoneDrawModal', () => {
  test('affiche le titre, le nombre de points et le bouton de création', () => {
    renderModal();
    expect(screen.getByText('🖊️ Nouvelle zone')).toBeTruthy();
    expect(screen.getByText('3 points tracés')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Créer la zone/ })).toBeTruthy();
  });

  test('ne sauvegarde pas si le nom est vide', () => {
    const { onSave } = renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Créer la zone/ }));
    expect(onSave).not.toHaveBeenCalled();
  });

  test('sauvegarde avec le nom saisi + les points tracés', async () => {
    const { onSave } = renderModal();
    fireEvent.change(screen.getByPlaceholderText('Ex: Potager Est'), {
      target: { value: 'Potager Est' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Créer la zone/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0][0];
    expect(payload.name).toContain('Potager Est');
    expect(payload.points).toHaveLength(3);
    expect(payload.current_plant).toBe('');
  });
});
