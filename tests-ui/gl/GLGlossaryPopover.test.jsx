import React from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { GLGlossaryPopover } from '../../src/gl/components/GLGlossaryPopover.jsx';

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: vi.fn(),
}));

import { apiGL } from '../../src/gl/services/apiGL.js';

const TERM_DETAIL = {
  term: {
    glossary_code: 'GL0001',
    terme: 'Biome',
    categorie: 'biome',
    categorie_label: 'Biome',
    niveau: 'base',
    definition_courte: 'Grande région écologique homogène.',
    definition_complete: "Ensemble d'écosystèmes caractéristiques d'une vaste région.",
    exemple: 'La toundra est un biome froid.',
    etymologie: 'Du grec bios, vie.',
  },
  relatedTerms: [{ glossary_code: 'GL0002', terme: 'Écosystème' }],
  relatedSpecies: [],
};

const RELATED_DETAIL = {
  term: {
    glossary_code: 'GL0002',
    terme: 'Écosystème',
    categorie: 'ecosysteme',
    categorie_label: 'Écosystème',
    niveau: 'base',
    definition_courte: 'Communauté vivante et milieu.',
  },
  relatedTerms: [],
  relatedSpecies: [],
};

describe('GLGlossaryPopover', () => {
  beforeEach(() => {
    vi.mocked(apiGL).mockReset();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.classList.remove('gl-glossary-popover-open');
    document.body.style.overflow = '';
  });

  test('affiche la fiche au chargement', async () => {
    vi.mocked(apiGL).mockResolvedValue(TERM_DETAIL);

    render(
      <GLGlossaryPopover
        open
        glossaryCode="GL0001"
        biomeSlugs={['sahara']}
        onClose={vi.fn()}
        onOpenFullGlossary={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Biome/i })).toBeInTheDocument();
    });
    expect(screen.getByText(/Grande région écologique homogène/i)).toBeInTheDocument();
    expect(screen.getByText(/La toundra est un biome froid/i)).toBeInTheDocument();
    expect(apiGL).toHaveBeenCalledWith('/api/gl/glossary/GL0001?biomeSlugs=sahara');
  });

  test('ferme avec Escape après animation', async () => {
    vi.mocked(apiGL).mockResolvedValue(TERM_DETAIL);
    const onClose = vi.fn();

    render(
      <GLGlossaryPopover
        open
        glossaryCode="GL0001"
        onClose={onClose}
        onOpenFullGlossary={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Biome/i })).toBeInTheDocument();
    });

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(200);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('navigue vers un terme lié sans fermer', async () => {
    vi.mocked(apiGL).mockImplementation((url) => {
      if (String(url).includes('GL0002')) return Promise.resolve(RELATED_DETAIL);
      return Promise.resolve(TERM_DETAIL);
    });

    render(
      <GLGlossaryPopover
        open
        glossaryCode="GL0001"
        onClose={vi.fn()}
        onOpenFullGlossary={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Biome/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Écosystème' }));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Écosystème/i })).toBeInTheDocument();
    });
    expect(apiGL).toHaveBeenCalledWith('/api/gl/glossary/GL0002');
  });

  test('CTA ouvre le glossaire complet', async () => {
    vi.mocked(apiGL).mockResolvedValue(TERM_DETAIL);
    const onClose = vi.fn();
    const onOpenFullGlossary = vi.fn();

    render(
      <GLGlossaryPopover
        open
        glossaryCode="GL0001"
        onClose={onClose}
        onOpenFullGlossary={onOpenFullGlossary}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Biome/i })).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', { name: /Voir le glossaire scientifique complet/i }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onOpenFullGlossary).toHaveBeenCalledWith('GL0001');
  });

  test("masque le lien glossaire complet sur l'onglet glossaire", async () => {
    vi.mocked(apiGL).mockResolvedValue(TERM_DETAIL);

    render(
      <GLGlossaryPopover
        open
        glossaryCode="GL0001"
        onClose={vi.fn()}
        onOpenFullGlossary={vi.fn()}
        showFullGlossaryLink={false}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Biome/i })).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('button', { name: /Voir le glossaire scientifique complet/i }),
    ).not.toBeInTheDocument();
  });

  test("n'est pas rendu quand fermé", () => {
    render(
      <GLGlossaryPopover
        open={false}
        glossaryCode="GL0001"
        onClose={vi.fn()}
        onOpenFullGlossary={vi.fn()}
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
