import React from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock du service réseau : `api` est piloté par test (rejet puis, au besoin,
// résolution), `AccountDeletedError` reste une vraie classe pour que le
// `instanceof` du composant retombe bien sur la branche d'erreur générique.
// `vi.hoisted` : les mocks sont remontés en tête de fichier, ces symboles
// doivent l'être aussi pour être accessibles dans la factory.
const { api, AccountDeletedError } = vi.hoisted(() => {
  class AccountDeletedError extends Error {}
  return { api: vi.fn(), AccountDeletedError };
});
vi.mock('../../src/services/api', () => ({ api, AccountDeletedError }));

// La donnée de zones n'intervient pas dans le flux d'erreur de chargement.
vi.mock('../../src/contexts/DataContext.jsx', () => ({
  useData: () => ({ zones: [] }),
}));

import { ObservationNotebook } from '../../src/components/foretmap-views.jsx';

const STUDENT = { id: 42, name: 'Alix' };

beforeEach(() => {
  api.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe('ObservationNotebook — échec de chargement du carnet', () => {
  test('un fetch qui rejette affiche le message d’erreur et le bouton « Réessayer »', async () => {
    api.mockRejectedValueOnce(new Error('Réseau indisponible'));

    render(<ObservationNotebook student={STUDENT} />);

    // Le message d'erreur remonté par le catch devient visible (plus de silence).
    expect(await screen.findByText('Réseau indisponible')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });

  test('« Réessayer » relance le chargement et efface l’erreur en cas de succès', async () => {
    api.mockRejectedValueOnce(new Error('Réseau indisponible'));

    render(<ObservationNotebook student={STUDENT} />);

    const retry = await screen.findByRole('button', { name: 'Réessayer' });

    // Second chargement : succès avec un carnet vide → l'erreur disparaît.
    api.mockResolvedValueOnce([]);
    fireEvent.click(retry);

    await waitFor(() => expect(screen.queryByText('Réseau indisponible')).not.toBeInTheDocument());
    expect(screen.getByText(/Ton carnet est vide/)).toBeInTheDocument();
    expect(api).toHaveBeenCalledTimes(2);
  });
});
