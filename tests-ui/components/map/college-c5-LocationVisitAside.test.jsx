import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

/**
 * Chantier collège, flux C5 — fiche de lieu de la carte (`LocationVisitAside`) : espèces
 * phares d'abord, « à chercher » en dernier, plafond et « Voir les N autres » au collège ;
 * rien ne change au lycée. Le profil collège est simulé en fournissant le contexte (patron de
 * la fiche § 2), la présence de la carte en simulant la requête partagée.
 */

vi.mock('../../../src/components/MarkdownContent.jsx', () => ({
  MarkdownContent: ({ children }) => <div>{children}</div>,
}));

const fetchMapSpeciesPresence = vi.fn();
vi.mock('../../../src/services/biodivApi', () => ({
  fetchMapSpeciesPresence: (...args) => fetchMapSpeciesPresence(...args),
}));

import { LocationVisitAside } from '../../../src/components/map/mapModalShared.jsx';
import { BiodivPedagoContext } from '../../../src/contexts/BiodivPedagoContext.jsx';

const NAMES = Array.from({ length: 16 }, (_, i) => `Espèce ${String(i + 1).padStart(2, '0')}`);
const PLANTS = NAMES.map((name, i) => ({ id: i + 1, name, emoji: '🌱' }));

function profile({ featuredFirst, cap }) {
  return {
    canShow: (feature) => (feature === 'featured_first' ? featuredFirst : true),
    visibility: (feature) =>
      feature === 'zone_tiles_cap'
        ? cap
        : feature === 'featured_first' && !featuredFirst
          ? 'hide'
          : 'show',
    palierRule: () => null,
  };
}

const COLLEGE = profile({ featuredFirst: true, cap: 12 });
const LYCEE = profile({ featuredFirst: false, cap: null });

function renderAside(ctx, names = NAMES) {
  return render(
    <BiodivPedagoContext.Provider value={ctx}>
      <LocationVisitAside
        entity={{ id: 'z1', map_id: 'foret' }}
        locationKind="zone"
        plants={PLANTS}
        livingNames={names}
        livingBeingsOnlyOnTasks={[]}
        visitAsideSpecies
        visitAsideTutorials={false}
        tutorials={[]}
        onOpenPlantCatalogPreview={vi.fn()}
      />
    </BiodivPedagoContext.Provider>,
  );
}

function chipNames() {
  const group = screen.getByRole('group', { name: /Espèces liées/ });
  return within(group)
    .getAllByRole('button')
    .map((b) => b.textContent.replace('🌱', '').replace('à chercher', '').trim());
}

beforeEach(() => {
  fetchMapSpeciesPresence.mockReset();
  fetchMapSpeciesPresence.mockResolvedValue({
    species: [
      { plant_id: 3, name: 'Espèce 03', is_featured: true, validation_status: 'confirme_site' },
      { plant_id: 15, name: 'Espèce 15', is_featured: true, validation_status: 'attendu' },
      { plant_id: 1, name: 'Espèce 01', is_featured: false, validation_status: 'documentaire' },
    ],
  });
});

describe('LocationVisitAside — collège (C5)', () => {
  test('phares d’abord, « à chercher » en dernier, plafond à 12 puis « Voir les 4 autres »', async () => {
    renderAside(COLLEGE);
    await screen.findByRole('button', { name: 'Voir les 4 autres' });
    // Présence chargée : Espèce 03 et 15 en tête.
    await vi.waitFor(() => expect(chipNames()[0]).toBe('Espèce 03'));
    const shown = chipNames();
    expect(shown).toHaveLength(12);
    expect(shown.slice(0, 2)).toEqual(['Espèce 03', 'Espèce 15']);
    expect(shown).not.toContain('Espèce 01');
    expect(fetchMapSpeciesPresence).toHaveBeenCalledWith('foret', expect.any(Object));

    fireEvent.click(screen.getByRole('button', { name: 'Voir les 4 autres' }));
    const all = chipNames();
    expect(all).toHaveLength(16);
    expect(all[all.length - 1]).toBe('Espèce 01');
    expect(screen.getByRole('button', { name: /Espèce 01, à chercher/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Voir les/ })).toBeNull();
  });

  test('repli : présence sans espèce phare → ordre reçu (plafond conservé)', async () => {
    fetchMapSpeciesPresence.mockResolvedValue({ species: [] });
    renderAside(COLLEGE);
    await vi.waitFor(() => expect(fetchMapSpeciesPresence).toHaveBeenCalled());
    expect(chipNames()).toEqual(NAMES.slice(0, 12));
    expect(screen.getByRole('button', { name: 'Voir les 4 autres' })).toBeInTheDocument();
  });

  test('sous le plafond : aucun bouton « Voir »', async () => {
    renderAside(COLLEGE, NAMES.slice(0, 5));
    await vi.waitFor(() => expect(fetchMapSpeciesPresence).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /Voir les/ })).toBeNull();
  });
});

describe('LocationVisitAside — lycée (inchangé)', () => {
  test('ordre reçu, pas de plafond, aucune requête de présence, aucune mention', () => {
    renderAside(LYCEE);
    expect(chipNames()).toEqual(NAMES);
    expect(screen.queryByRole('button', { name: /Voir les/ })).toBeNull();
    expect(screen.queryByText('à chercher')).toBeNull();
    expect(fetchMapSpeciesPresence).not.toHaveBeenCalled();
  });
});
