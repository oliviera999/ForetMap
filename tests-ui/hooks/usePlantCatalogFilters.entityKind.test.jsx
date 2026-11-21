import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePlantCatalogFilters } from '../../src/hooks/usePlantCatalogFilters.js';

/**
 * Fiches « ressource » (`plants.entity_kind`) : absentes de la liste et de la recherche des
 * élèves, gardées côté gestion. Le réseau trophique, les liens et les clés lisent le catalogue
 * entier (`plants`), jamais la sortie de ce hook.
 */
const PLANTS = [
  { id: 1, name: 'Cloporte', entity_kind: 'taxon' },
  { id: 2, name: 'Litière de feuilles', entity_kind: 'ressource' },
  { id: 3, name: 'Phytoplancton', entity_kind: 'groupe_fonctionnel' },
  { id: 4, name: 'Biofilm', entity_kind: 'consortium' },
  // Catalogue d'une base non migrée, ou objet partiel : jamais masqué.
  { id: 5, name: 'Ancienne fiche' },
];

const names = (list) => list.map((p) => p.name);

describe('usePlantCatalogFilters — fiches « ressource »', () => {
  it('liste élève (défaut) : la ressource est retirée, le reste est gardé', () => {
    const { result } = renderHook(() => usePlantCatalogFilters(PLANTS, null));
    expect(names(result.current.filteredPlants)).toEqual([
      'Ancienne fiche',
      'Biofilm',
      'Cloporte',
      'Phytoplancton',
    ]);
    expect(names(result.current.catalogPlants)).not.toContain('Litière de feuilles');
    expect(result.current.countScopePlants).toHaveLength(4);
  });

  it('recherche élève : le nom d’une ressource ne rend rien', () => {
    const { result } = renderHook(() => usePlantCatalogFilters(PLANTS, null));
    act(() => result.current.filterPanelProps.setSearch('litière'));
    expect(result.current.filteredPlants).toEqual([]);
    act(() => result.current.filterPanelProps.setSearch('cloporte'));
    expect(names(result.current.filteredPlants)).toEqual(['Cloporte']);
  });

  it('gestion (includeResourceEntities) : tout le catalogue, recherche comprise', () => {
    const { result } = renderHook(() =>
      usePlantCatalogFilters(PLANTS, null, { includeResourceEntities: true }),
    );
    expect(result.current.catalogPlants).toBe(PLANTS);
    expect(result.current.filteredPlants).toHaveLength(PLANTS.length);
    act(() => result.current.filterPanelProps.setSearch('litière'));
    expect(names(result.current.filteredPlants)).toEqual(['Litière de feuilles']);
  });

  it('catalogue sans ressource : la liste d’origine est rendue telle quelle', () => {
    const plain = PLANTS.filter((p) => p.entity_kind !== 'ressource');
    const { result } = renderHook(() => usePlantCatalogFilters(plain, null));
    expect(result.current.catalogPlants).toBe(plain);
  });
});
