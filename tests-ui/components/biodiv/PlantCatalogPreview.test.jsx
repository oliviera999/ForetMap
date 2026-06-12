import React from 'react';
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
vi.mock('../../../src/hooks/useOverlayHistoryBack', () => ({
  useOverlayHistoryBack: vi.fn(),
}));
vi.mock('../../../src/contexts/PublicSettingsContext.jsx', () => ({
  usePublicSettings: () => ({ modules: {} }),
}));
vi.mock('../../../src/contexts/SessionContext.jsx', () => ({
  useSession: () => ({ canParticipateContextComments: true }),
}));
vi.mock('../../../src/contexts/DataContext.jsx', () => ({
  useData: () => ({ zones: [], markers: [] }),
}));

import {
  PlantBiodiversityCatalogPreviewCard,
  PlantCatalogPreviewModal,
} from '../../../src/components/biodiv/PlantCatalogPreview.jsx';

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

  test('zone liée (living_beings_list) → chips « Sur la carte » + nom de zone', () => {
    const zones = [{ id: 1, name: 'Mare', living_beings_list: ['Tomate'] }];
    render(<PlantBiodiversityCatalogPreviewCard plant={PLANT} zones={zones} />);
    expect(screen.getByText('Sur la carte')).toBeInTheDocument();
    expect(screen.getByText('📍 Mare')).toBeInTheDocument();
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
    expect(screen.getByText('🌱 Tomate')).toBeInTheDocument();
    await waitFor(() => expect(fetchPlantObservationCounts).toHaveBeenCalledWith([7]));
    expect(await screen.findByText('obs:3')).toBeInTheDocument();
  });

  test('plant null → rien rendu', () => {
    const { container } = render(<PlantCatalogPreviewModal plant={null} onClose={vi.fn()} />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByText(/🌱/)).not.toBeInTheDocument();
  });
});
