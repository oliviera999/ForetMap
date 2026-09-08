import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GLBiodiversityView } from '../../src/gl/components/GLBiodiversityView.jsx';

vi.mock('../../src/gl/components/GLSpeciesCatalog.jsx', () => ({
  GLSpeciesCatalog: () => <div data-testid="species-catalog">catalogue</div>,
}));

vi.mock('../../src/gl/components/GLFoodWebPanel.jsx', () => ({
  GLFoodWebPanel: () => <div data-testid="food-web-panel">réseau</div>,
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
    expect(screen.getByRole('tab', { name: 'Catalogue' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Réseau' })).toBeInTheDocument();
    expect(screen.getByTestId('species-catalog')).toBeInTheDocument();
  });

  test('le sous-onglet Réseau remplace le catalogue', () => {
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
    fireEvent.click(screen.getByRole('tab', { name: 'Réseau' }));
    expect(screen.getByTestId('food-web-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('species-catalog')).toBeNull();
  });
});
