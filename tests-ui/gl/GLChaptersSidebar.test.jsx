import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GLChaptersSidebar } from '../../src/gl/components/admin/chapters/GLChaptersSidebar.jsx';

const CHAPTERS = [
  { id: 1, slug: 'foret', title: 'La Forêt', biomes: [{ slug: 'temperate' }] },
  { id: 2, slug: 'sahara', title: '', biomes: [] },
];

function renderSidebar(props = {}) {
  return render(
    <GLChaptersSidebar
      chapters={CHAPTERS}
      selectedId={null}
      onSelect={vi.fn()}
      onNew={vi.fn()}
      {...props}
    />,
  );
}

describe('GLChaptersSidebar', () => {
  test('affiche le titre ou, à défaut, le slug', () => {
    renderSidebar();
    expect(screen.getByText('La Forêt')).toBeInTheDocument();
    // Chapitre sans titre : le slug sert de libellé (strong) et de sous-titre.
    expect(screen.getAllByText('sahara').length).toBeGreaterThan(0);
  });

  test('affiche le nombre de biomes quand il y en a', () => {
    renderSidebar();
    expect(screen.getByText('1 biome(s)')).toBeInTheDocument();
  });

  test('marque le chapitre sélectionné comme actif', () => {
    const { container } = renderSidebar({ selectedId: 1 });
    const active = container.querySelector('button.is-active');
    expect(active).toBeTruthy();
    expect(active.getAttribute('data-chapter-id')).toBe('1');
  });

  test('clic sur un chapitre appelle onSelect avec son slug', () => {
    const onSelect = vi.fn();
    renderSidebar({ onSelect });
    fireEvent.click(screen.getByText('La Forêt'));
    expect(onSelect).toHaveBeenCalledWith('foret');
  });

  test('« Nouveau chapitre » appelle onNew', () => {
    const onNew = vi.fn();
    renderSidebar({ onNew });
    fireEvent.click(screen.getByText('+ Nouveau chapitre'));
    expect(onNew).toHaveBeenCalledTimes(1);
  });
});
