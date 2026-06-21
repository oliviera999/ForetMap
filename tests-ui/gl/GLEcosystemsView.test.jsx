import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GLEcosystemsView } from '../../src/gl/components/GLEcosystemsView.jsx';

vi.mock('../../src/gl/hooks/useGlMarkdownWithLegacyMedia.js', () => ({
  useGlMarkdownWithLegacyMedia: (value) => value,
}));

vi.mock('../../src/gl/components/GLFeuilletIllustration.jsx', () => ({
  useGlAssetsReady: () => false,
}));

describe('GLEcosystemsView', () => {
  test('affiche biotope puis biocénose dans le même onglet', () => {
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
    expect(screen.getByRole('heading', { name: 'Biotope' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Biocénose' })).toBeInTheDocument();
    expect(screen.getByText('Milieu sec')).toBeInTheDocument();
    expect(screen.getByText('Espèces associées')).toBeInTheDocument();
  });
});
