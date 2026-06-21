import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GLBiodiversityView } from '../../src/gl/components/GLBiodiversityView.jsx';

vi.mock('../../src/gl/components/GLSpeciesCatalog.jsx', () => ({
  GLSpeciesCatalog: () => <div data-testid="species-catalog">catalogue</div>,
}));

describe('GLBiodiversityView', () => {
  test('affiche le titre Biodiversité et le catalogue espèces', () => {
    render(
      <GLBiodiversityView
        gameState={{
          game: {
            id: 1,
            chapter_biomes: [{ slug: 'sahara', nom: 'Désert chaud (Sahara)' }],
          },
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Biodiversité' })).toBeInTheDocument();
    expect(screen.getByTestId('species-catalog')).toBeInTheDocument();
  });
});
