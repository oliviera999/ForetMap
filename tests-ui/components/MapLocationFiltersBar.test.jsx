import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { MapLocationFiltersBar } from '../../src/components/map/MapLocationFiltersBar.jsx';
import { MAP_LOCATION_FILTER_DEFAULTS } from '../../src/utils/mapLocationFilters.js';

function mockMatchMedia(compact) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: compact,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  }));
}

function renderBar(overrides = {}) {
  const setFilters = vi.fn((updater) => {
    if (typeof updater === 'function') {
      updater({ ...MAP_LOCATION_FILTER_DEFAULTS, ...(overrides.filters || {}) });
    }
  });
  render(
    <MapLocationFiltersBar
      filters={{ ...MAP_LOCATION_FILTER_DEFAULTS, ...(overrides.filters || {}) }}
      setFilters={setFilters}
      speciesOptions={[{ id: '10', label: 'Tomate' }]}
      zoneMatchCount={overrides.zoneMatchCount ?? 0}
      markerMatchCount={overrides.markerMatchCount ?? 0}
      {...overrides}
    />,
  );
  return { setFilters };
}

describe('MapLocationFiltersBar', () => {
  beforeEach(() => {
    mockMatchMedia(false);
    vi.useFakeTimers();
    window.localStorage?.clear?.();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test('affiche le champ de recherche avec aria-label', () => {
    renderBar();
    expect(screen.getByLabelText('Rechercher une zone ou un repère')).toBeTruthy();
  });

  test('debounce texte : setFilters appelé après 200 ms', () => {
    const { setFilters } = renderBar();
    fireEvent.change(screen.getByLabelText('Rechercher une zone ou un repère'), {
      target: { value: 'mare' },
    });
    expect(setFilters).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(setFilters).toHaveBeenCalled();
  });

  test('compteur résultats quand filtre actif', () => {
    renderBar({
      filters: { text: 'mare' },
      zoneMatchCount: 2,
      markerMatchCount: 1,
    });
    expect(screen.getByText('2 zones · 1 repère')).toBeTruthy();
  });

  test('chip actif et retrait par clic', () => {
    const { setFilters } = renderBar({
      filters: { kinds: 'zones' },
    });
    const chips = screen.getByRole('group', { name: 'Filtres actifs' });
    fireEvent.click(within(chips).getByRole('button', { name: 'Retirer le filtre type' }));
    expect(setFilters).toHaveBeenCalled();
  });

  test('effacer tout remet les filtres par défaut', () => {
    const { setFilters } = renderBar({
      filters: { text: 'olivier', kinds: 'markers' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Effacer recherche et filtres' }));
    expect(setFilters).toHaveBeenCalledWith({ ...MAP_LOCATION_FILTER_DEFAULTS });
  });

  test('écran compact : le panneau s’ouvre en feuille modale', () => {
    mockMatchMedia(true);
    renderBar();
    fireEvent.click(screen.getByRole('button', { name: 'Filtres' }));
    expect(screen.getByRole('dialog', { name: 'Filtres carte' })).toBeTruthy();
  });
});
