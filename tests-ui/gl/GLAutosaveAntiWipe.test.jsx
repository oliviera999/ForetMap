import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

/**
 * Un GET en échec ne doit jamais laisser un formulaire éditable garni de valeurs par
 * défaut avec l'enregistrement automatique armé : une frappe écrirait ces défauts en base
 * et effacerait la personnalisation. On vérifie qu'aucun PUT ne part dans ce cas.
 */

const apiGL = vi.fn();
vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGL(...args),
}));

beforeEach(() => {
  apiGL.mockReset();
});

describe('Aide GL — chargement en échec', () => {
  test('aucun formulaire, aucun enregistrement : une invitation à réessayer', async () => {
    apiGL.mockRejectedValue(new Error('Service indisponible'));
    const { GLHelpContentAdminPanel } =
      await import('../../src/gl/components/admin/GLHelpContentAdminPanel.jsx');
    render(<GLHelpContentAdminPanel />);

    await waitFor(() => expect(screen.getByText(/Service indisponible/)).toBeTruthy());
    expect(screen.getByRole('button', { name: /réessayer/i })).toBeTruthy();

    // Seul le GET a eu lieu : aucune écriture n'a été tentée.
    const writes = apiGL.mock.calls.filter(([, method]) => method && method !== 'GET');
    expect(writes).toHaveLength(0);
  });

  test('chargement réussi : le formulaire s’affiche', async () => {
    apiGL.mockResolvedValue({ entries: { 'tab:maps': { title: 'Cartes', body: 'Texte' } } });
    const { GLHelpContentAdminPanel } =
      await import('../../src/gl/components/admin/GLHelpContentAdminPanel.jsx');
    render(<GLHelpContentAdminPanel />);
    await waitFor(() => expect(screen.getByDisplayValue('Cartes')).toBeTruthy());
  });
});
