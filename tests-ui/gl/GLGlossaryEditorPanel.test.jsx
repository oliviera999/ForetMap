import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GLGlossaryEditorPanel } from '../../src/gl/components/admin/GLGlossaryEditorPanel.jsx';

const apiGlMock = vi.fn();

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
}));

describe('GLGlossaryEditorPanel', () => {
  beforeEach(() => {
    apiGlMock.mockReset();
    apiGlMock.mockImplementation(async (path, method) => {
      if (path === '/api/gl/admin/glossary/meta') {
        return {
          categories: [{ id: 'ecologie', label: 'Écologie' }],
          niveaux: [{ id: 'base', label: 'Base' }],
          biomes: [{ slug: 'sahara', nom: 'Sahara' }],
        };
      }
      if (path === '/api/gl/admin/glossary/terms') return { items: [], total: 0 };
      if (path === '/api/gl/admin/glossary/terms/next-code') return { glossary_code: 'GL9999' };
      if (method === 'POST') {
        return {
          ok: true,
          created: true,
          term: {
            glossary_code: 'GL9999',
            terme: 'Nouveau',
            categorie: 'ecologie',
            niveau: 'base',
            all_biomes: true,
            statut: 'actif',
            biome_slugs: [],
            related_codes: [],
          },
        };
      }
      return {};
    });
  });

  test('affiche le formulaire et crée un terme automatiquement', async () => {
    render(<GLGlossaryEditorPanel />);

    await waitFor(() => {
      expect(screen.getByText('Saisie manuelle — glossaire scientifique')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '+ Nouveau terme' }));

    await waitFor(() => {
      expect(screen.getByDisplayValue('GL9999')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Terme *'), { target: { value: 'Photosynthèse test' } });

    await waitFor(
      () => {
        expect(apiGlMock).toHaveBeenCalledWith(
          '/api/gl/admin/glossary/terms',
          'POST',
          expect.objectContaining({
            terme: 'Photosynthèse test',
          }),
        );
      },
      { timeout: 3000 },
    );
  });
});
