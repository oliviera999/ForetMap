import { afterEach, beforeEach, describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/**
 * Chantier collège, flux C5 — fiche de lieu de la Visite : ordre et plafond de la liste
 * passée aux vignettes (`VisitBiodiversityPanel`, flux C1), « à chercher » et
 * « Voir les N autres ». La présence vient des espèces du lieu (contenu de visite) : aucune
 * requête.
 */

const fetchMapSpeciesPresence = vi.fn();
vi.mock('../../../src/services/biodivApi', () => ({
  fetchMapSpeciesPresence: (...args) => fetchMapSpeciesPresence(...args),
}));

import { VisitDetailPanel } from '../../../src/components/visit/VisitDetailPanel.jsx';
import { BiodivPedagoContext } from '../../../src/contexts/BiodivPedagoContext.jsx';

const NAMES = Array.from({ length: 15 }, (_, i) => `Espèce ${String(i + 1).padStart(2, '0')}`);

function species() {
  return NAMES.map((name, i) => ({
    id: i + 1,
    name,
    emoji: '🌱',
    is_featured: name === 'Espèce 10' || name === 'Espèce 14',
    validation_status:
      name === 'Espèce 02' ? 'a_confirmer' : name === 'Espèce 05' ? 'documentaire' : 'attendu',
  }));
}

function profile({ featuredFirst, cap }) {
  return {
    canShow: (feature) => (feature === 'featured_first' ? featuredFirst : true),
    visibility: (feature) => (feature === 'zone_tiles_cap' ? cap : 'show'),
    palierRule: () => null,
  };
}

function setup(ctx, selectedOverrides = {}) {
  const props = {
    selected: {
      id: 3,
      name: 'Verger',
      visit_media: [],
      living_beings_list: NAMES,
      species: species(),
      ...selectedOverrides,
    },
    selectedType: 'zone',
    onClose: vi.fn(),
    onRequestClose: null,
    comfortableReading: false,
    onToggleComfortableReading: vi.fn(),
    onOpenLightbox: vi.fn(),
    onOpenTutorialPreview: vi.fn(),
    seen: new Set(),
    savingSeen: false,
    onToggleSeen: vi.fn(),
    roleTerms: {},
    markerEmojis: ['📍'],
    plants: NAMES.map((name, i) => ({ id: i + 1, name, emoji: '🌱' })),
    onOpenPlantCatalogPreview: vi.fn(),
  };
  return render(
    <BiodivPedagoContext.Provider value={ctx}>
      <VisitDetailPanel {...props} />
    </BiodivPedagoContext.Provider>,
  );
}

function tileNames() {
  return [...document.body.querySelectorAll('.visit-biodiv__grid [data-species-name]')].map((el) =>
    el.getAttribute('data-species-name'),
  );
}

const originalMatchMedia = window.matchMedia;
beforeEach(() => {
  fetchMapSpeciesPresence.mockReset();
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: /min-width:\s*1024px/.test(query),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }));
});
afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

describe('VisitDetailPanel — collège (C5)', () => {
  test('phares d’abord, 12 vignettes, « Voir les 3 autres », « à chercher » en dernier', () => {
    setup(profile({ featuredFirst: true, cap: 12 }));
    const shown = tileNames();
    expect(shown).toHaveLength(12);
    expect(shown.slice(0, 2)).toEqual(['Espèce 10', 'Espèce 14']);
    expect(shown).not.toContain('Espèce 02');
    expect(shown).not.toContain('Espèce 05');
    // Aucune requête : la présence vient du contenu de visite.
    expect(fetchMapSpeciesPresence).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Voir les 3 autres' }));
    const all = tileNames();
    expect(all).toHaveLength(15);
    expect(all.slice(-2)).toEqual(['Espèce 02', 'Espèce 05']);
    expect(screen.getByText(/Espèce 02, Espèce 05/)).toHaveTextContent(
      'leur présence ici reste à confirmer',
    );
    expect(screen.queryByRole('button', { name: /Voir les/ })).toBeNull();
  });

  test('repli : aucune phare ni « à chercher » → ordre reçu', () => {
    setup(profile({ featuredFirst: true, cap: 12 }), {
      species: NAMES.map((name, i) => ({ id: i + 1, name, emoji: '🌱' })),
    });
    expect(tileNames()).toEqual(NAMES.slice(0, 12));
    expect(screen.queryByText(/reste à confirmer/)).toBeNull();
  });
});

describe('VisitDetailPanel — lycée (inchangé)', () => {
  test('ordre reçu, toutes les vignettes, aucune mention', () => {
    setup(profile({ featuredFirst: false, cap: null }));
    expect(tileNames()).toEqual(NAMES);
    expect(screen.queryByRole('button', { name: /Voir les/ })).toBeNull();
    expect(screen.queryByText(/reste à confirmer/)).toBeNull();
  });
});
