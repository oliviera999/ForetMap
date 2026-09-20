import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { PlantCatalogFilterPanel } from '../../../src/components/biodiv/PlantCatalogFilterPanel.jsx';
import { ZONE_PRESENCE_FILTER } from '../../../src/utils/plantFilters.js';
import { BIODIV_SORT } from '../../../src/utils/biodivCatalogLoad.js';

const PLANTS = [
  {
    id: 1,
    name: 'Menthe',
    taxon_kingdom: 'Végétal',
    taxon_group: 'Herbacée',
    taxon_family: 'Lamiacées',
    habitat: 'Bordure',
    trophic_role: 'producteur',
    habitat_type: 'Jardin',
    is_edible: 1,
    iucn_status: 'LC',
    map_ids: ['foret'],
  },
  {
    id: 2,
    name: 'Merle',
    taxon_kingdom: 'Animal',
    taxon_group: 'Oiseau',
    taxon_family: 'Turdidés',
    habitat: 'Haie',
    trophic_role: 'consommateur',
    habitat_type: 'Boisement',
    is_edible: 0,
    iucn_status: 'CR',
    map_ids: ['n3'],
  },
];

const MAPS = [
  { id: 'foret', name: 'Forêt comestible' },
  { id: 'n3', name: 'N3' },
];

function setup(overrides = {}) {
  const setters = Object.fromEntries(
    [
      'setSearch',
      'setGroup1',
      'setGroup2',
      'setGroup3',
      'setHabitat',
      'setTrophicRole',
      'setHabitatType',
      'setOriginStatus',
      'setIucnStatus',
      'setZonePresence',
      'setEdibleOnly',
      'setIucnThreatenedOnly',
      'setObservationChip',
      'setSortKey',
    ].map((k) => [k, vi.fn()]),
  );
  const onActiveMapChange = vi.fn();
  const props = {
    plants: PLANTS,
    maps: MAPS,
    activeMapId: 'foret',
    onActiveMapChange,
    showZonePresence: true,
    search: '',
    group1: '',
    group2: '',
    group3: '',
    habitat: '',
    trophicRole: '',
    habitatType: '',
    originStatus: '',
    iucnStatus: '',
    zonePresence: ZONE_PRESENCE_FILTER.IN_MAP,
    defaultZonePresence: ZONE_PRESENCE_FILTER.IN_MAP,
    edibleOnly: false,
    iucnThreatenedOnly: false,
    observationChip: '',
    sortKey: BIODIV_SORT.NAME_ASC,
    enableObservationChips: true,
    countsReady: true,
    ...setters,
    ...overrides,
  };
  if (overrides.onActiveMapChange === undefined) props.onActiveMapChange = onActiveMapChange;
  const view = render(<PlantCatalogFilterPanel {...props} />);
  return { ...setters, onActiveMapChange: props.onActiveMapChange, props, ...view };
}

describe('PlantCatalogFilterPanel — surface carte / présence / chips', () => {
  test('carte, présence, recherche et règne sont hors « Filtres avancés »', () => {
    setup();
    expect(screen.getByLabelText('Sélection de carte active')).toBeInTheDocument();
    expect(screen.getByLabelText('Présence sur la carte')).toBeInTheDocument();
    expect(screen.getByLabelText('Recherche')).toBeInTheDocument();
    expect(screen.getByLabelText('Règne')).toBeInTheDocument();
    const advanced = screen.getByText('Filtres avancés').closest('details');
    expect(advanced.open).toBe(false);
    expect(within(advanced).queryByLabelText('Présence sur la carte')).toBeNull();
  });

  test('changer de carte appelle onActiveMapChange', () => {
    const { onActiveMapChange } = setup();
    fireEvent.change(screen.getByLabelText('Sélection de carte active'), {
      target: { value: 'n3' },
    });
    expect(onActiveMapChange).toHaveBeenCalledWith('n3');
  });

  test('réinitialiser restaure defaultZonePresence IN_MAP', () => {
    const { setZonePresence } = setup({
      zonePresence: ZONE_PRESENCE_FILTER.ALL,
      defaultZonePresence: ZONE_PRESENCE_FILTER.IN_MAP,
    });
    fireEvent.click(screen.getByText('Filtres avancés'));
    fireEvent.click(screen.getByText('Réinitialiser les filtres'));
    expect(setZonePresence).toHaveBeenCalledWith(ZONE_PRESENCE_FILTER.IN_MAP);
  });

  test('chip Comestible bascule setEdibleOnly', () => {
    const { setEdibleOnly } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Comestible' }));
    expect(setEdibleOnly).toHaveBeenCalledWith(true);
  });
});
