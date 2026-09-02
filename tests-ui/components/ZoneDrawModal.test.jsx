import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ZoneDrawModal } from '../../src/components/map/ZoneDrawModal.jsx';

const CATEGORY_CATALOG = [
  {
    id: 'cat-infrastructure',
    label: 'Infrastructure',
    emoji: '🏗️',
    color: '#dbeafe90',
    applies_to: 'both',
    is_infrastructure: true,
    sort_order: 10,
  },
  {
    id: 'cat-point-eau',
    label: 'Point d’eau',
    emoji: '💧',
    color: '#a5f3fc90',
    applies_to: 'marker',
    is_infrastructure: false,
    sort_order: 20,
  },
];

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
    expect(screen.getByText('Nouvelle zone')).toBeTruthy();
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

  test('les catégories cochées partent dans le payload', async () => {
    const { onSave } = renderModal({ categoryCatalog: CATEGORY_CATALOG });
    fireEvent.change(screen.getByPlaceholderText('Ex: Potager Est'), {
      target: { value: 'Bâtiment G' },
    });
    fireEvent.click(screen.getByLabelText(/Infrastructure/));
    fireEvent.click(screen.getByRole('button', { name: /Créer la zone/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].category_ids).toEqual(['cat-infrastructure']);
  });

  test('par défaut la zone ne porte aucune catégorie', async () => {
    const { onSave } = renderModal({ categoryCatalog: CATEGORY_CATALOG });
    fireEvent.change(screen.getByPlaceholderText('Ex: Potager Est'), {
      target: { value: 'Potager Ouest' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Créer la zone/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].category_ids).toEqual([]);
  });

  test('catalogue vide : message d’aide, pas de case à cocher', () => {
    renderModal();
    expect(screen.getByText(/Aucune catégorie disponible/)).toBeTruthy();
  });

  test('une catégorie « repères seuls » n’est pas proposée sur une zone', () => {
    renderModal({ categoryCatalog: CATEGORY_CATALOG });
    expect(screen.queryByLabelText(/Point d’eau/)).toBeNull();
  });
});
