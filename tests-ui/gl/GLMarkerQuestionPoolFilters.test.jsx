import React from 'react';
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GLMarkerQuestionPoolFilters } from '../../src/gl/components/GLMarkerQuestionPoolFilters.jsx';

const BASE_BIOME_POOL = {
  biomeMode: 'chapter',
  biomeSlugs: [],
  categorieSlugs: [],
  niveaux: [],
  difficulteMin: null,
  difficulteMax: null,
  searchQuery: '',
};

const BASE_LORE_POOL = {
  chapitreMode: 'chapter',
  chapitreSlugs: [],
  categorieSlugs: [],
  tierLore: [],
  niveaux: [],
  difficulteMin: null,
  difficulteMax: null,
  searchQuery: '',
};

function renderFilters(props = {}) {
  return render(
    <GLMarkerQuestionPoolFilters
      pool={BASE_BIOME_POOL}
      isLoreSet={false}
      chapterBiomeSlugs={['foret', 'lac']}
      loreScopeOptions={[]}
      additionalBiomeOptions={[{ value: 'desert', label: 'Désert' }]}
      categoryOptions={[]}
      tierLoreOptions={[{ value: 'cle', label: 'Clé' }]}
      niveauOptions={[]}
      onPatchPool={vi.fn()}
      {...props}
    />,
  );
}

describe('GLMarkerQuestionPoolFilters — biome', () => {
  test('affiche le sélecteur de biomes et pas le tier lore', () => {
    renderFilters();
    expect(screen.getByText('Biomes du pool')).toBeInTheDocument();
    expect(screen.getByText('Catégories QCM')).toBeInTheDocument();
    expect(screen.queryByText('Tier lore')).not.toBeInTheDocument();
  });

  test('mode custom liste les biomes du chapitre', () => {
    renderFilters({ pool: { ...BASE_BIOME_POOL, biomeMode: 'custom' } });
    expect(screen.getByText(/foret, lac/)).toBeInTheDocument();
    expect(screen.getByText('Biomes additionnels')).toBeInTheDocument();
  });

  test('change de mode biome via onPatchPool', () => {
    const onPatchPool = vi.fn();
    renderFilters({ onPatchPool });
    fireEvent.change(screen.getByDisplayValue('Biomes du chapitre (défaut)'), {
      target: { value: 'custom' },
    });
    expect(onPatchPool).toHaveBeenCalledWith({ biomeMode: 'custom' });
  });

  test('saisie de difficulté min remonte un nombre', () => {
    const onPatchPool = vi.fn();
    renderFilters({ onPatchPool });
    fireEvent.change(screen.getByLabelText('Difficulté min'), { target: { value: '3' } });
    expect(onPatchPool).toHaveBeenCalledWith({ difficulteMin: 3 });
  });

  test('vider la difficulté max remonte null', () => {
    const onPatchPool = vi.fn();
    renderFilters({ onPatchPool, pool: { ...BASE_BIOME_POOL, difficulteMax: 4 } });
    fireEvent.change(screen.getByLabelText('Difficulté max'), { target: { value: '' } });
    expect(onPatchPool).toHaveBeenCalledWith({ difficulteMax: null });
  });

  test('recherche remonte la chaîne', () => {
    const onPatchPool = vi.fn();
    renderFilters({ onPatchPool });
    fireEvent.change(screen.getByLabelText(/Recherche/), { target: { value: 'eau' } });
    expect(onPatchPool).toHaveBeenCalledWith({ searchQuery: 'eau' });
  });
});

describe('GLMarkerQuestionPoolFilters — lore', () => {
  test('affiche les scopes lore et le tier lore', () => {
    renderFilters({ isLoreSet: true, pool: BASE_LORE_POOL });
    expect(screen.getByText('Chapitres lore du pool')).toBeInTheDocument();
    expect(screen.getByText('Catégories lore')).toBeInTheDocument();
    expect(screen.getByText('Tier lore')).toBeInTheDocument();
    expect(screen.queryByText('Biomes du pool')).not.toBeInTheDocument();
  });

  test("mode chapter affiche l'aide, custom affiche le dropdown de scopes", () => {
    const { rerender } = renderFilters({ isLoreSet: true, pool: BASE_LORE_POOL });
    expect(screen.getByText(/Inclut automatiquement/)).toBeInTheDocument();
    rerender(
      <GLMarkerQuestionPoolFilters
        pool={{ ...BASE_LORE_POOL, chapitreMode: 'custom' }}
        isLoreSet
        chapterBiomeSlugs={[]}
        loreScopeOptions={[{ value: 's1', label: 'Scope 1' }]}
        additionalBiomeOptions={[]}
        categoryOptions={[]}
        tierLoreOptions={[]}
        niveauOptions={[]}
        onPatchPool={vi.fn()}
      />,
    );
    expect(screen.getByText('Scopes chapitre lore')).toBeInTheDocument();
  });

  test('change de mode chapitre lore via onPatchPool', () => {
    const onPatchPool = vi.fn();
    renderFilters({ isLoreSet: true, pool: BASE_LORE_POOL, onPatchPool });
    fireEvent.change(screen.getByDisplayValue(/Chapitre courant/), {
      target: { value: 'custom' },
    });
    expect(onPatchPool).toHaveBeenCalledWith({ chapitreMode: 'custom' });
  });
});
