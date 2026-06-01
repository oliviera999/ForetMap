import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GLSpeciesCatalog } from '../../src/gl/components/GLSpeciesCatalog.jsx';

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: vi.fn(),
}));

import { apiGL } from '../../src/gl/services/apiGL.js';

describe('GLSpeciesCatalog', () => {
  beforeEach(() => {
    vi.mocked(apiGL).mockReset();
  });

  test('affiche un hint si aucun biome catalogue', () => {
    render(<GLSpeciesCatalog biomes={[]} />);
    expect(screen.getByText(/Aucun biome du catalogue/i)).toBeInTheDocument();
  });

  test('affiche les espèces groupées par type en tuiles compactes', async () => {
    vi.mocked(apiGL).mockResolvedValue({
      biome: { slug: 'sahara', nom: 'Désert chaud (Sahara)' },
      items: [
        {
          species_code: 'SP0001',
          type: 'faune',
          groupe: 'mammifère',
          nom_commun: 'Fennec',
          nom_scientifique: 'Vulpes zerda',
          description_courte: 'Petit renard du désert',
        },
        {
          species_code: 'SP0010',
          type: 'flore',
          groupe: 'arbuste',
          nom_commun: 'Acacia',
          description_courte: 'Arbre épineux',
        },
      ],
    });
    render(<GLSpeciesCatalog biomes={[{ slug: 'sahara', nom: 'Désert chaud (Sahara)' }]} />);
    await waitFor(() => {
      expect(screen.getByText('Fennec')).toBeInTheDocument();
    });
    expect(screen.getByText('Faune')).toBeInTheDocument();
    expect(screen.getByText('Flore')).toBeInTheDocument();
    expect(screen.getByText('Acacia')).toBeInTheDocument();
    expect(screen.queryByText(/Rôle :/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/En savoir plus/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Adaptations :/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ouvrir la fiche de Fennec/i })).toBeInTheDocument();
  });

  test('affiche des onglets pour plusieurs biomes', async () => {
    vi.mocked(apiGL).mockResolvedValue({
      biome: { slug: 'sahara', nom: 'Désert chaud (Sahara)' },
      items: [{ species_code: 'SP0001', type: 'faune', groupe: 'm', nom_commun: 'Fennec' }],
    });
    render(
      <GLSpeciesCatalog
        biomes={[
          { slug: 'sahara', nom: 'Désert chaud (Sahara)' },
          { slug: 'toundra', nom: 'Toundra arctique' },
        ]}
      />
    );
    expect(screen.getByRole('tab', { name: 'Désert chaud (Sahara)' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Toundra arctique' })).toBeInTheDocument();
    expect(screen.getByText(/Biomes de ce chapitre/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Fennec')).toBeInTheDocument();
    });
  });

  test('ouvre la modale fiche complète au clic sur une tuile', async () => {
    const onOpenGlossaryTerm = vi.fn();
    vi.mocked(apiGL).mockResolvedValue({
      biome: { slug: 'sahara', nom: 'Désert chaud (Sahara)' },
      items: [
        {
          species_code: 'SP0001',
          type: 'faune',
          groupe: 'mammifère',
          nom_commun: 'Fennec',
          role_ecologique: 'Prédateur nocturne',
          wikipedia_url: 'https://fr.wikipedia.org/wiki/Fennec',
          wikipedia_title: 'Fennec',
          glossaryTerms: [{ glossary_code: 'GL0001', terme: 'Biome' }],
        },
      ],
    });
    render(
      <GLSpeciesCatalog
        biomes={[{ slug: 'sahara', nom: 'Désert chaud (Sahara)' }]}
        onOpenGlossaryTerm={onOpenGlossaryTerm}
      />
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Ouvrir la fiche de Fennec/i })).toBeInTheDocument();
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Ouvrir la fiche de Fennec/i }));
    const dialog = screen.getByRole('dialog', { name: /Fennec/i });
    expect(within(dialog).getByText('Prédateur nocturne')).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Fennec' })).toHaveAttribute(
      'href',
      'https://fr.wikipedia.org/wiki/Fennec'
    );
    expect(screen.queryByText(/Rôle :/i)).not.toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Biome' }));
    expect(onOpenGlossaryTerm).toHaveBeenCalledWith('GL0001');
  });
});
