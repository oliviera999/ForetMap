import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GLSpeciesEditorPanel } from '../../src/gl/components/admin/GLSpeciesEditorPanel.jsx';

const apiGlMock = vi.fn();

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
}));

describe('GLSpeciesEditorPanel', () => {
  beforeEach(() => {
    apiGlMock.mockReset();
    apiGlMock.mockImplementation(async (path, method) => {
      if (path === '/api/gl/biomes') {
        return [{ slug: 'sahara', nom: 'Sahara' }];
      }
      if (String(path).startsWith('/api/gl/admin/species?')) {
        return { biome: { slug: 'sahara', nom: 'Sahara' }, items: [], total: 0 };
      }
      if (path === '/api/gl/admin/species/next-code') return { species_code: 'SP9999' };
      if (method === 'POST') {
        return {
          ok: true,
          created: true,
          species: {
            species_code: 'SP9999',
            biome_slug: 'sahara',
            type: 'faune',
            nom_commun: 'Test',
            statut: 'actif',
          },
        };
      }
      return {};
    });
  });

  test('affiche le formulaire biocénose et enregistre une espèce', async () => {
    render(<GLSpeciesEditorPanel />);

    await waitFor(() => {
      expect(screen.getByText('Saisie manuelle — biocénose (espèces)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '+ Nouvelle espèce' }));

    await waitFor(() => {
      expect(screen.getByDisplayValue('SP9999')).toBeInTheDocument();
    });

    const nomInput = screen.getByLabelText(/Nom commun/i);
    fireEvent.change(nomInput, { target: { value: 'Fennec test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => {
      expect(apiGlMock).toHaveBeenCalledWith(
        '/api/gl/admin/species',
        'POST',
        expect.objectContaining({
          nom_commun: 'Fennec test',
        }),
      );
    });
  });
});
