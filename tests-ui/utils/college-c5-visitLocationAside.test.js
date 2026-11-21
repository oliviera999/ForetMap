import { describe, test, expect } from 'vitest';
import {
  computeVisitLocationAside,
  EMPTY_VISIT_LOCATION_ASIDE,
} from '../../src/utils/visitLocationAside.js';

/**
 * Chantier collège, flux C5 — présence des espèces d'un lieu de visite (`is_featured`,
 * `validation_status`) : toujours celle du contenu de visite, même quand les noms viennent de
 * la zone de la carte ; zone et repère passent par la même dérivation (refacto C5).
 */

const VISIT_SPECIES = [
  { id: 1, name: 'Ronce', emoji: '🌿', is_featured: true, validation_status: 'confirme_site' },
  { id: 2, name: 'Lézard', emoji: '🦎', is_featured: false, validation_status: 'a_confirmer' },
];

describe('computeVisitLocationAside — présence (C5)', () => {
  test('zone : noms de la carte, présence du contenu de visite', () => {
    const aside = computeVisitLocationAside(
      { id: 'z1', living_beings_list: ['Ronce', 'Lézard'], species: VISIT_SPECIES },
      'zone',
      {
        mapId: 'foret',
        mapZones: [
          {
            id: 'z1',
            map_id: 'foret',
            living_beings_list: ['Lézard', 'Ronce'],
            species: [{ id: 2, name: 'Lézard' }],
          },
        ],
      },
    );
    expect(aside.primaryLivingNames).toEqual(['Lézard', 'Ronce']);
    expect(aside.primaryLivingPresence).toBe(VISIT_SPECIES);
    expect(aside.locationKind).toBe('zone');
  });

  test('repère : même forme, présence du contenu de visite', () => {
    const aside = computeVisitLocationAside(
      { id: 'm1', living_beings_list: ['Ronce'], species: VISIT_SPECIES.slice(0, 1) },
      'marker',
      { mapId: 'foret' },
    );
    expect(aside.locationKind).toBe('marker');
    expect(aside.showBiodiversity).toBe(true);
    expect(aside.primaryLivingPresence).toEqual(VISIT_SPECIES.slice(0, 1));
  });

  test('lieu sans espèces publiées : présence vide ; aucune sélection : aside vide', () => {
    const aside = computeVisitLocationAside({ id: 'z2' }, 'zone', { mapId: 'foret' });
    expect(aside.primaryLivingPresence).toEqual([]);
    expect(computeVisitLocationAside(null, null)).toBe(EMPTY_VISIT_LOCATION_ASIDE);
    expect(EMPTY_VISIT_LOCATION_ASIDE.primaryLivingPresence).toEqual([]);
  });

  test('zone d’infrastructure : pas de biodiversité ; repère : jamais masqué par la catégorie', () => {
    const infra = { id: 'z3', is_infrastructure: true, living_beings_list: ['Ronce'] };
    expect(computeVisitLocationAside(infra, 'zone', { mapId: 'foret' }).showBiodiversity).toBe(
      false,
    );
    expect(
      computeVisitLocationAside({ ...infra, id: 'm3' }, 'marker', { mapId: 'foret' })
        .showBiodiversity,
    ).toBe(true);
  });
});
