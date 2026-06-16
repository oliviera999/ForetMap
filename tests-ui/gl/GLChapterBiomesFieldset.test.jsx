import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GLChapterBiomesFieldset } from '../../src/gl/components/admin/GLChapterBiomesFieldset.jsx';

const BIOMES = [
  { slug: 'temperate', nom: 'Tempéré', species_count: 12 },
  { slug: 'boreal', nom: 'Boréal', species_count: 5 },
  { slug: 'tropical', nom: 'Tropical', species_count: 0 },
];

function renderFieldset(props = {}) {
  return render(
    <GLChapterBiomesFieldset biomes={BIOMES} selectedSlugs={[]} onChange={vi.fn()} {...props} />,
  );
}

describe('GLChapterBiomesFieldset', () => {
  test('aucune sélection : message dédié', () => {
    renderFieldset();
    expect(screen.getByText('Aucun biome catalogue sélectionné.')).toBeInTheDocument();
  });

  test('liste les biomes sélectionnés avec leur nombre d’espèces', () => {
    const { container } = renderFieldset({ selectedSlugs: ['temperate'] });
    const selected = container.querySelector('.gl-chapter-biomes-selected');
    expect(selected.textContent).toMatch(/Tempéré \(12 esp\.\)/);
  });

  test('cocher un biome ajoute son slug', () => {
    const onChange = vi.fn();
    renderFieldset({ onChange });
    fireEvent.click(screen.getByLabelText(/Boréal/));
    expect(onChange).toHaveBeenCalledWith(['boreal']);
  });

  test('décocher un biome retire son slug', () => {
    const onChange = vi.fn();
    renderFieldset({ selectedSlugs: ['temperate', 'boreal'], onChange });
    fireEvent.click(screen.getByLabelText(/Tempéré/));
    expect(onChange).toHaveBeenCalledWith(['boreal']);
  });

  test('« Retirer » enlève le biome de la sélection', () => {
    const onChange = vi.fn();
    renderFieldset({ selectedSlugs: ['temperate', 'boreal'], onChange });
    fireEvent.click(screen.getAllByText('Retirer')[0]);
    expect(onChange).toHaveBeenCalledWith(['boreal']);
  });

  test('↓ déplace un biome vers le bas', () => {
    const onChange = vi.fn();
    renderFieldset({ selectedSlugs: ['temperate', 'boreal'], onChange });
    fireEvent.click(screen.getAllByText('↓')[0]);
    expect(onChange).toHaveBeenCalledWith(['boreal', 'temperate']);
  });

  test('↑ déplace un biome vers le haut', () => {
    const onChange = vi.fn();
    renderFieldset({ selectedSlugs: ['temperate', 'boreal'], onChange });
    fireEvent.click(screen.getAllByText('↑')[1]);
    expect(onChange).toHaveBeenCalledWith(['boreal', 'temperate']);
  });
});
