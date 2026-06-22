import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GLEcosystemsView } from '../../src/gl/components/GLEcosystemsView.jsx';

vi.mock('../../src/gl/hooks/useGlMarkdownWithLegacyMedia.js', () => ({
  useGlMarkdownWithLegacyMedia: (value) => value,
}));

vi.mock('../../src/gl/components/GLFeuilletIllustration.jsx', () => ({
  useGlAssetsReady: () => false,
}));

vi.mock('../../src/gl/components/GLChapterIllustration.jsx', () => ({
  GLChapterIllustration: () => null,
}));

describe('GLEcosystemsView', () => {
  test('affiche biotope et biocénose regroupés pour un écosystème', () => {
    render(
      <GLEcosystemsView
        gameState={{
          game: {
            biotope_markdown: 'Milieu sec',
            biocenose_markdown: 'Espèces associées',
            chapter_biomes: [{ slug: 'sahara', nom: 'Désert chaud (Sahara)' }],
          },
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Écosystèmes' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Désert chaud (Sahara)' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Biotope' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Biocénose' })).toBeInTheDocument();
    expect(screen.getByText('Milieu sec')).toBeInTheDocument();
    expect(screen.getByText('Espèces associées')).toBeInTheDocument();
  });

  test('plusieurs écosystèmes : onglets et contenu isolé par biome', async () => {
    const user = userEvent.setup();
    render(
      <GLEcosystemsView
        gameState={{
          game: {
            biotope_markdown: '## Désert chaud (Sahara)\n\nSec',
            biocenose_markdown: "## Jungle d'Afrique centrale\n\nHumide",
            chapter_biomes: [
              { slug: 'sahara', nom: 'Désert chaud (Sahara)' },
              { slug: 'jungle_afc', nom: "Jungle d'Afrique centrale" },
            ],
          },
        }}
      />,
    );

    expect(screen.getByRole('tablist', { name: 'Écosystèmes du chapitre' })).toBeInTheDocument();
    expect(screen.getByText('Sec')).toBeInTheDocument();
    expect(screen.queryByText('Humide')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: "Jungle d'Afrique centrale" }));
    expect(screen.getByText('Humide')).toBeInTheDocument();
    expect(screen.queryByText('Sec')).not.toBeInTheDocument();
  });
});
