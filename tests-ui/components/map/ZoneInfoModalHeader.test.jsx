import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ZoneInfoModalHeader } from '../../../src/components/map/ZoneInfoModalHeader.jsx';

const ZONE = {
  id: 7,
  name: 'Potager Est',
  categories: [{ id: 'c1', label: 'Verger', emoji: '🍎' }],
  is_infrastructure: false,
};

function renderHeader(overrides = {}) {
  const handlers = {
    onDuplicate: vi.fn().mockResolvedValue(undefined),
    onDuplicateError: vi.fn(),
    onDelete: vi.fn(),
    onClose: vi.fn(),
  };
  render(
    <ZoneInfoModalHeader zone={ZONE} isTeacher duplicating={false} {...handlers} {...overrides} />,
  );
  return handlers;
}

describe('ZoneInfoModalHeader', () => {
  beforeEach(() => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('affiche le titre de la zone et les pastilles de catégorie', () => {
    renderHeader();
    expect(screen.getByRole('heading', { name: 'Potager Est' })).toBeTruthy();
    expect(screen.getByText(/Verger/)).toBeTruthy();
  });

  test('zone sans catégorie : aucune pastille', () => {
    renderHeader({ zone: { ...ZONE, categories: [] } });
    expect(screen.queryByText(/Verger/)).toBeNull();
  });

  test('prof : bouton Copie déclenche onDuplicate avec la zone', async () => {
    const h = renderHeader();
    fireEvent.click(screen.getByRole('button', { name: 'Copie' }));
    await waitFor(() => expect(h.onDuplicate).toHaveBeenCalledWith(ZONE));
    expect(h.onDuplicateError).not.toHaveBeenCalled();
  });

  test('prof : échec de duplication appelle onDuplicateError', async () => {
    const h = renderHeader({ onDuplicate: vi.fn().mockRejectedValue(new Error('boom')) });
    fireEvent.click(screen.getByRole('button', { name: 'Copie' }));
    await waitFor(() => expect(h.onDuplicateError).toHaveBeenCalled());
  });

  test('prof : suppression confirmée appelle onDelete puis onClose', async () => {
    const h = renderHeader();
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer la zone' }));
    // La confirmation passe par une promesse (dialogue applicatif) : microtâche à drainer.
    await waitFor(() => expect(h.onDelete).toHaveBeenCalledWith(7));
    expect(h.onClose).toHaveBeenCalled();
  });

  test('prof : suppression annulée ne supprime pas', () => {
    window.confirm.mockReturnValue(false);
    const h = renderHeader();
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer la zone' }));
    expect(h.onDelete).not.toHaveBeenCalled();
    expect(h.onClose).not.toHaveBeenCalled();
  });

  test('élève : aucune action de gestion (ni Copie ni Supprimer)', () => {
    renderHeader({ isTeacher: false });
    expect(screen.queryByRole('button', { name: 'Copie' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Supprimer la zone' })).toBeNull();
  });

  test("zone d'infrastructure : actions de gestion disponibles pour un prof (éditable)", () => {
    renderHeader({
      zone: {
        ...ZONE,
        categories: [{ id: 'c2', label: 'Infrastructure', is_infrastructure: true }],
        is_infrastructure: true,
      },
    });
    expect(screen.getByRole('button', { name: 'Copie' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Supprimer la zone' })).toBeTruthy();
  });

  test('bouton Copie absent si onDuplicate non fourni, Supprimer toujours présent', () => {
    renderHeader({ onDuplicate: null });
    expect(screen.queryByRole('button', { name: 'Copie' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Supprimer la zone' })).toBeTruthy();
  });

  test('état duplicating : bouton désactivé et libellé de chargement', () => {
    renderHeader({ duplicating: true });
    const btn = screen.getByRole('button', { name: '…' });
    expect(btn.disabled).toBe(true);
  });
});
