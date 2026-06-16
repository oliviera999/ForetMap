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
    vi.mocked(apiGL).mockResolvedValue({
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

    render(
      <GLGlossaryView
        gameState={{
          game: {
            chapter_biomes: [{ slug: 'sahara', nom: 'Désert chaud (Sahara)' }],
          },
        }}
        focusCode={null}
        onOpenPopover={vi.fn()}
        onFocusHandled={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Biome')).toBeInTheDocument();
    });
    expect(screen.getByText(/Biomes du chapitre/i)).toBeInTheDocument();
  });

  test('ouvre le popover glossaire au clic sur un terme', async () => {
    const user = userEvent.setup();
    const onOpenPopover = vi.fn();

    vi.mocked(apiGL).mockResolvedValue({
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

    render(
      <GLGlossaryView
        gameState={{ game: {} }}
        focusCode={null}
        onOpenPopover={onOpenPopover}
        onFocusHandled={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Désert/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Désert/i }));

    expect(onOpenPopover).toHaveBeenCalledWith('GL0002');
  });

  test('focusCode déclenche le popover', async () => {
    const onOpenPopover = vi.fn();
    const onFocusHandled = vi.fn();

    vi.mocked(apiGL).mockResolvedValue({ biome: null, items: [] });

    render(
      <GLGlossaryView
        gameState={{ game: {} }}
        focusCode="GL0099"
        onOpenPopover={onOpenPopover}
        onFocusHandled={onFocusHandled}
      />,
    );

    await waitFor(() => {
      expect(onOpenPopover).toHaveBeenCalledWith('GL0099');
      expect(onFocusHandled).toHaveBeenCalled();
    });
  });
});
