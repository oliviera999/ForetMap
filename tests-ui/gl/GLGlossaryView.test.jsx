import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GLGlossaryView } from '../../src/gl/components/GLGlossaryView.jsx';

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: vi.fn(),
}));

import { apiGL } from '../../src/gl/services/apiGL.js';

describe('GLGlossaryView', () => {
  beforeEach(() => {
    vi.mocked(apiGL).mockReset();
  });

  test('affiche la liste groupée par catégorie', async () => {
    vi.mocked(apiGL).mockImplementation((url) => {
      if (String(url).includes('/api/gl/glossary/GL0001')) {
        return Promise.resolve({
          term: {
            glossary_code: 'GL0001',
            terme: 'Biome',
            categorie: 'biome',
            categorie_label: 'Biome',
            niveau: 'base',
            definition_courte: 'Grande région écologique',
          },
          relatedTerms: [],
          relatedSpecies: [],
        });
      }
      return Promise.resolve({
        biome: { slug: 'sahara', nom: 'Désert chaud (Sahara)' },
        items: [
          {
            glossary_code: 'GL0001',
            terme: 'Biome',
            categorie: 'biome',
            categorie_label: 'Biome',
            niveau: 'base',
            definition_courte: 'Grande région écologique',
          },
        ],
      });
    });

    render(
      <GLGlossaryView
        gameState={{ game: { biome_slug: 'sahara', biome_nom: 'Désert chaud (Sahara)' } }}
        focusCode={null}
        onOpenTerm={vi.fn()}
        onFocusHandled={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Biome')).toBeInTheDocument();
    });
    expect(screen.getByText(/Désert chaud \(Sahara\)/i)).toBeInTheDocument();
  });

  test('ouvre une fiche au clic sur un terme', async () => {
    const user = userEvent.setup();
    vi.mocked(apiGL).mockImplementation((url) => {
      if (String(url).includes('/api/gl/glossary/GL0002')) {
        return Promise.resolve({
          term: {
            glossary_code: 'GL0002',
            terme: 'Désert',
            categorie: 'biome',
            categorie_label: 'Biome',
            niveau: 'base',
            definition_courte: 'Milieu aride',
            definition_complete: 'Région où les précipitations sont très faibles.',
          },
          relatedTerms: [],
          relatedSpecies: [{ species_code: 'SP0001', nom_commun: 'Fennec', type: 'faune' }],
        });
      }
      return Promise.resolve({
        biome: null,
        items: [
          {
            glossary_code: 'GL0002',
            terme: 'Désert',
            categorie: 'biome',
            categorie_label: 'Biome',
            niveau: 'base',
            definition_courte: 'Milieu aride',
          },
        ],
      });
    });

    render(<GLGlossaryView gameState={{ game: {} }} focusCode={null} onOpenTerm={vi.fn()} onFocusHandled={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Désert/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Désert/i }));

    await waitFor(() => {
      expect(screen.getByText(/Milieu aride/i)).toBeInTheDocument();
      expect(screen.getByText('Fennec')).toBeInTheDocument();
    });
  });
});
