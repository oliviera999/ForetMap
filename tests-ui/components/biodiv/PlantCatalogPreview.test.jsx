import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { fetchPlantObservationCounts } from '../../../src/components/PlantSpeciesDiscoveryAcknowledge';

vi.mock('../../../src/components/map-views', () => ({
  CatalogRemarksSection: () => <div data-testid="catalog-remarks" />,
}));
vi.mock('../../../src/components/PlantSpeciesDiscoveryAcknowledge', () => ({
  PlantSpeciesDiscoveryAcknowledgeButton: ({ myObservationCount }) => (
    <button data-testid="discovery-ack">obs:{myObservationCount}</button>
  ),
  fetchPlantObservationCounts: vi.fn(async () => ({})),
}));
vi.mock('../../../src/components/context-comments', () => ({
  ContextComments: ({ contextId }) => <div data-testid="context-comments">plant:{contextId}</div>,
}));
vi.mock('../../../src/shared/platform/useOverlayHistoryBack', () => ({
  useOverlayHistoryBack: vi.fn(),
}));
vi.mock('../../../src/contexts/PublicSettingsContext.jsx', () => ({
  usePublicSettings: () => ({ modules: {} }),
}));
vi.mock('../../../src/contexts/SessionContext.jsx', () => ({
  useSession: () => ({ canParticipateContextComments: true }),
}));
// Données du contexte, modifiables test par test (présence fournie par la visite, carte active).
const dataState = { current: { zones: [], markers: [] } };
vi.mock('../../../src/contexts/DataContext.jsx', () => ({
  useData: () => dataState.current,
}));
vi.mock('../../../src/services/biodivApi', () => ({
  fetchMapSpeciesPresence: vi.fn(async () => ({ species: [] })),
}));

import {
  PlantBiodiversityCatalogPreviewCard,
  PlantCatalogPreviewModal,
} from '../../../src/components/biodiv/PlantCatalogPreview.jsx';
import { fetchMapSpeciesPresence } from '../../../src/services/biodivApi';

const PLANT = {
  id: 7,
  name: 'Tomate',
  emoji: '🍅',
  scientific_name: '',
  description: '',
  group_2: 'Angiosperme',
};

beforeEach(() => {
  fetchPlantObservationCounts.mockClear();
  fetchPlantObservationCounts.mockResolvedValue({});
  fetchMapSpeciesPresence.mockClear();
  dataState.current = { zones: [], markers: [] };
});
afterEach(() => vi.restoreAllMocks());

describe('PlantBiodiversityCatalogPreviewCard', () => {
  test('rend nom, repli nom scientifique, repli description et chip groupe', () => {
    render(<PlantBiodiversityCatalogPreviewCard plant={PLANT} />);
    expect(screen.getByText('Tomate')).toBeInTheDocument();
    expect(screen.getByText('Nom scientifique non renseigne')).toBeInTheDocument();
    expect(screen.getByText('Pas de description')).toBeInTheDocument();
    // « Angiosperme » apparaît en chip d'en-tête et dans la section identité des métadonnées
    expect(screen.getAllByText('Angiosperme').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('catalog-remarks')).toBeInTheDocument();
  });

  test('sans zone ni repère liés → message d’absence, pas de section « Sur la carte »', () => {
    render(<PlantBiodiversityCatalogPreviewCard plant={PLANT} zones={[]} markers={[]} />);
    expect(screen.getByText(/Pas encore associé à une zone/)).toBeInTheDocument();
    expect(screen.queryByText('Sur la carte')).not.toBeInTheDocument();
  });

  test('zone liée (species_ids) → chips « Sur la carte » + nom de zone', () => {
    const zones = [{ id: 1, name: 'Mare', species_ids: [7], living_beings_list: ['Tomate'] }];
    render(<PlantBiodiversityCatalogPreviewCard plant={PLANT} zones={zones} />);
    expect(screen.getByText('Sur la carte')).toBeInTheDocument();
    expect(screen.getByText('Mare')).toBeInTheDocument();
  });

  test('nom seul (ancien nom mono-espèce, sans jonction) → la zone n’est plus liée', () => {
    const zones = [
      { id: 1, name: 'Mare', current_plant: 'Tomate', living_beings_list: ['Tomate'] },
    ];
    render(<PlantBiodiversityCatalogPreviewCard plant={PLANT} zones={zones} />);
    expect(screen.queryByText('Mare')).not.toBeInTheDocument();
  });

  test('présence connue, registre seul → provenance sans chips de lieu', () => {
    render(
      <PlantBiodiversityCatalogPreviewCard
        plant={PLANT}
        presenceKnown
        presenceEntry={{ plant_id: 7, sources: ['registre'], zones: [], markers: [] }}
      />,
    );
    expect(screen.getByText('Sur la carte')).toBeInTheDocument();
    expect(screen.getByTestId('plant-presence-line')).toHaveTextContent(
      'Présente sur cette carte : au registre du site',
    );
    expect(screen.queryByText('Zones et repères')).not.toBeInTheDocument();
  });

  test('présence connue, zone et repère → provenance comptée + chips', () => {
    const zones = [{ id: 'z1', name: 'Mare', species_ids: [7] }];
    render(
      <PlantBiodiversityCatalogPreviewCard
        plant={PLANT}
        zones={zones}
        presenceKnown
        presenceEntry={{
          plant_id: 7,
          sources: ['zone', 'repere'],
          zones: [{ id: 'z1', name: 'Mare' }],
          markers: [{ id: 'm1', label: 'Nichoir' }],
        }}
      />,
    );
    expect(screen.getByTestId('plant-presence-line')).toHaveTextContent(
      'Présente sur cette carte : dans 1 zone · sur 1 repère',
    );
    expect(screen.getByText('Mare')).toBeInTheDocument();
  });

  test('présence connue, espèce absente → « Pas encore signalée sur cette carte »', () => {
    render(
      <PlantBiodiversityCatalogPreviewCard plant={PLANT} presenceKnown presenceEntry={null} />,
    );
    expect(screen.getByText('Pas encore signalée sur cette carte')).toBeInTheDocument();
    expect(screen.queryByText('Sur la carte')).not.toBeInTheDocument();
  });

  test('showContextComments=false masque les commentaires ; plant null → rien', () => {
    const { container, rerender } = render(
      <PlantBiodiversityCatalogPreviewCard plant={PLANT} showContextComments={false} />,
    );
    expect(screen.queryByTestId('context-comments')).not.toBeInTheDocument();
    rerender(<PlantBiodiversityCatalogPreviewCard plant={null} />);
    expect(container.querySelector('.biodiv-card')).toBeNull();
  });
});

describe('PlantCatalogPreviewModal', () => {
  test('rend le titre, la carte et charge les compteurs d’observation de la fiche', async () => {
    fetchPlantObservationCounts.mockResolvedValueOnce({
      7: { my_observation_count: 3, site_observation_count: 9 },
    });
    render(<PlantCatalogPreviewModal plant={PLANT} onClose={vi.fn()} />);
    expect(document.getElementById('plant-catalog-preview-title')).toHaveTextContent('Tomate');
    await waitFor(() => expect(fetchPlantObservationCounts).toHaveBeenCalledWith([7]));
    expect(await screen.findByText('obs:3')).toBeInTheDocument();
  });

  test('carte active → présence demandée au serveur et affichée dans la fiche', async () => {
    fetchMapSpeciesPresence.mockResolvedValueOnce({
      species: [{ plant_id: 7, sources: ['registre', 'zone'], zones: [], markers: [] }],
    });
    dataState.current = { zones: [], markers: [], plants: [], activeMapId: 'foret' };
    render(<PlantCatalogPreviewModal plant={PLANT} onClose={vi.fn()} />);
    expect(await screen.findByTestId('plant-presence-line')).toHaveTextContent(
      'au registre du site · dans une zone',
    );
    expect(fetchMapSpeciesPresence).toHaveBeenCalledWith('foret', expect.any(Object));
  });

  test('présence fournie par l’écran (visite) → aucune requête', async () => {
    dataState.current = {
      zones: [],
      markers: [],
      activeMapId: 'foret',
      mapSpeciesPresence: [{ plant_id: 7, sources: ['repere'], zones: [], markers: [] }],
    };
    render(<PlantCatalogPreviewModal plant={PLANT} onClose={vi.fn()} />);
    expect(await screen.findByTestId('plant-presence-line')).toHaveTextContent('sur un repère');
    expect(fetchMapSpeciesPresence).not.toHaveBeenCalled();
  });

  test('plant null → rien rendu', () => {
    const { container } = render(<PlantCatalogPreviewModal plant={null} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByText(/🌱/)).not.toBeInTheDocument();
  });
});
