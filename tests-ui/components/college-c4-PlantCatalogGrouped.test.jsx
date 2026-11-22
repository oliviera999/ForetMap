import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Catalogue groupé du collège (chantier collège, flux C4) : sections repliables par groupe
 * d'usage avec effectif, espèces phares d'abord puis présences confirmées / attendues puis
 * « à chercher », filtre unique « Groupe » à la place de Règne › Grand groupe › Famille.
 * Profil simulé par le contexte (`catalog_grouped`, `featured_first`) — fiche § 2.
 */

const profileRef = vi.hoisted(() => ({ college: true }));
const plantsRef = vi.hoisted(() => ({ list: [] }));
const presenceRef = vi.hoisted(() => ({ species: [] }));

vi.mock('../../src/services/api', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    api: async (path) => {
      if (String(path).includes('/observation-counts')) return { counts: {} };
      if (String(path).includes('/gating/summary')) return { items: [] };
      if (/\/api\/maps\/[^/]+\/species/.test(String(path))) {
        return { species: presenceRef.species };
      }
      return {};
    },
    getAuthToken: () => 'jeton-de-test',
  };
});

vi.mock('../../src/contexts/BiodivPedagoContext.jsx', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useBiodivPedago: () => ({
      ...actual.useBiodivPedago(),
      canShow: (feature) =>
        feature === 'catalog_grouped' || feature === 'featured_first' ? profileRef.college : true,
    }),
  };
});

vi.mock('../../src/contexts/DataContext.jsx', () => ({
  useData: () => ({ plants: plantsRef.list, zones: [], markers: [], activeMapId: 'foret' }),
}));
vi.mock('../../src/contexts/PublicSettingsContext.jsx', () => ({
  usePublicSettings: () => ({ modules: {} }),
}));
vi.mock('../../src/contexts/SessionContext.jsx', () => ({
  useSession: () => ({ canParticipateContextComments: true }),
}));
vi.mock('../../src/hooks/useHelp', () => ({
  useHelp: () => ({
    isHelpEnabled: false,
    hasSeenSection: () => true,
    markSectionSeen: vi.fn(),
    trackPanelOpen: vi.fn(),
    trackPanelDismiss: vi.fn(),
  }),
}));

const { PlantViewer } = await import('../../src/components/foretmap-views.jsx');

const OISEAUX = { id: 'oiseaux', label: 'Oiseaux' };
const ARBRES = { id: 'angiospermes', label: 'Plantes à fleurs' };

function plant(id, name, usageGroup, extra = {}) {
  return {
    id,
    name,
    emoji: '🌿',
    description: `Description ${name}`,
    taxon_kingdom: usageGroup === ARBRES ? 'Végétal (Chlorobiontes)' : 'Animal (Métazoaires)',
    usage_group: usageGroup,
    ...extra,
  };
}

function setCatalog() {
  plantsRef.list = [
    plant(1, 'Aigrette', OISEAUX),
    plant(2, 'Bergeronnette', OISEAUX),
    plant(3, 'Chardonneret', OISEAUX),
    plant(4, 'Dattier', ARBRES),
    plant(5, 'Plancton', null),
  ];
  presenceRef.species = [
    { plant_id: 1, sources: ['registre'], validation_status: 'documentaire', is_featured: false },
    { plant_id: 2, sources: ['registre'], validation_status: 'attendu', is_featured: false },
    { plant_id: 3, sources: ['registre'], validation_status: 'confirme_site', is_featured: true },
    { plant_id: 4, sources: ['zone'], validation_status: null, is_featured: false },
    { plant_id: 5, sources: ['registre'], validation_status: 'a_confirmer', is_featured: false },
  ];
}

function tileNames(container) {
  return [...container.querySelectorAll('.biodiv-tile__name')].map((n) => n.textContent.trim());
}

describe('PlantViewer — catalogue groupé (collège)', () => {
  beforeEach(() => {
    profileRef.college = true;
    setCatalog();
  });

  test('sections repliables par groupe d’usage, avec effectif, « Autres » en dernier', async () => {
    render(<PlantViewer />);
    const toggles = await screen.findAllByRole('button', { expanded: false });
    const groupToggles = toggles.filter((b) => b.classList.contains('biodiv-group__toggle'));
    expect(groupToggles.map((b) => b.textContent)).toEqual([
      '▸Oiseaux3 êtres vivants',
      '▸Plantes à fleurs1 être vivant',
      '▸Autres êtres vivants1 être vivant',
    ]);
    expect(screen.getByText(/5 êtres vivants en 3 groupes/)).toBeInTheDocument();
    // Repliées : aucune vignette rendue.
    expect(document.querySelectorAll('.biodiv-tile')).toHaveLength(0);
  });

  test('dans un groupe : phare, puis confirmé / attendu, puis « à chercher »', async () => {
    const user = userEvent.setup();
    const { container } = render(<PlantViewer />);
    await user.click(await screen.findByRole('button', { name: /Oiseaux/ }));
    await screen.findByText('Chardonneret');
    const section = container.querySelector('[data-usage-group-id="oiseaux"]');
    expect(tileNames(section)).toEqual(['Chardonneret', 'Bergeronnette', 'Aigrette']);
    const aigrette = section.querySelector('[data-biodiv-plant-id="1"]');
    expect(within(aigrette).getByText('à chercher')).toBeInTheDocument();
    const bergeronnette = section.querySelector('[data-biodiv-plant-id="2"]');
    expect(within(bergeronnette).queryByText('à chercher')).toBeNull();
  });

  test('filtre unique « Groupe » à la place de Règne / Grand groupe / Famille', async () => {
    const user = userEvent.setup();
    const { container } = render(<PlantViewer />);
    const select = await screen.findByLabelText('Groupe');
    expect(screen.queryByLabelText('Règne')).toBeNull();
    expect(screen.queryByText('Grand groupe')).toBeNull();
    expect(screen.queryByText('Famille')).toBeNull();
    expect([...select.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      'Tous les groupes',
      'Oiseaux',
      'Plantes à fleurs',
      'Autres êtres vivants',
    ]);
    await user.selectOptions(select, 'angiospermes');
    const toggles = container.querySelectorAll('.biodiv-group__toggle');
    expect([...toggles].map((b) => b.textContent)).toEqual(['▸Plantes à fleurs1 être vivant']);
  });

  test('une recherche ouvre les groupes qui ont des résultats', async () => {
    const user = userEvent.setup();
    render(<PlantViewer />);
    await user.type(await screen.findByLabelText('Recherche'), 'dattier');
    expect(await screen.findByText('Dattier')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Plantes à fleurs/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  test('repli : aucune fiche avec groupe d’usage → liste plate et filtre Règne', async () => {
    plantsRef.list = plantsRef.list.map((p) => ({ ...p, usage_group: null }));
    render(<PlantViewer />);
    expect(await screen.findByLabelText('Règne')).toBeInTheDocument();
    expect(screen.queryByLabelText('Groupe')).toBeNull();
    expect(document.querySelectorAll('.biodiv-group')).toHaveLength(0);
    expect(await screen.findByText('Aigrette')).toBeInTheDocument();
  });

  test('lycée (catalog_grouped masquée) : liste plate, comportement actuel', async () => {
    profileRef.college = false;
    render(<PlantViewer />);
    expect(await screen.findByLabelText('Règne')).toBeInTheDocument();
    expect(document.querySelectorAll('.biodiv-group')).toHaveLength(0);
    expect(await screen.findByText('Chardonneret')).toBeInTheDocument();
    expect(screen.queryByText('à chercher')).toBeNull();
  });
});
