import { describe, test, expect } from 'vitest';
import {
  TO_SEARCH_VALIDATION_STATUSES,
  capZoneSpecies,
  orderZoneSpeciesForCollege,
  zoneSpeciesMoreLabel,
  zoneSpeciesPresenceIndex,
  zoneTilesCapValue,
} from '../../src/utils/livingBeings.js';
import { PRESENCE_VALIDATION_STATUS_ENUM } from '../../src/shared/enums/biodivEnums.js';

/**
 * Chantier collège, flux C5 — ordre et plafond des espèces d'une fiche de lieu (fonctions
 * pures de `src/utils/livingBeings.js`).
 */

const PRESENCE = zoneSpeciesPresenceIndex([
  { name: 'Ronce', is_featured: false, validation_status: 'confirme_site' },
  { name: 'Hérisson', is_featured: false, validation_status: 'documentaire' },
  { name: 'Grenade', is_featured: true, validation_status: 'confirme_site' },
  { name: 'Lézard', is_featured: false, validation_status: 'a_confirmer' },
  { name: 'Mésange', is_featured: true, validation_status: 'attendu' },
]);

describe('statuts « à chercher »', () => {
  test('documentaire et a_confirmer, tous deux connus de l’énumération', () => {
    expect([...TO_SEARCH_VALIDATION_STATUSES].sort()).toEqual(['a_confirmer', 'documentaire']);
    for (const v of TO_SEARCH_VALIDATION_STATUSES) {
      expect(PRESENCE_VALIDATION_STATUS_ENUM.values).toContain(v);
    }
  });
});

describe('orderZoneSpeciesForCollege', () => {
  const names = ['Ronce', 'Hérisson', 'Grenade', 'Lézard', 'Mésange', 'Inconnue'];

  test('collège : phares, puis les autres, puis « à chercher » — ordre reçu dans chaque groupe', () => {
    const r = orderZoneSpeciesForCollege(names, PRESENCE, { featuredFirst: true });
    expect(r.ordered).toEqual(['Grenade', 'Mésange', 'Ronce', 'Inconnue', 'Hérisson', 'Lézard']);
    expect([...r.featured]).toEqual(['Grenade', 'Mésange']);
    expect([...r.toSearch]).toEqual(['Hérisson', 'Lézard']);
  });

  test('une espèce phare « à chercher » reste après les autres (décision 5)', () => {
    const presence = zoneSpeciesPresenceIndex([
      { name: 'A', is_featured: true, validation_status: 'a_confirmer' },
      { name: 'B', is_featured: false, validation_status: 'confirme_site' },
    ]);
    const r = orderZoneSpeciesForCollege(['A', 'B'], presence, { featuredFirst: true });
    expect(r.ordered).toEqual(['B', 'A']);
    expect(r.toSearch.has('A')).toBe(true);
  });

  test('repli : aucune phare ni « à chercher » → ordre reçu', () => {
    const presence = zoneSpeciesPresenceIndex([
      { name: 'Ronce', is_featured: false, validation_status: 'confirme_site' },
      { name: 'Grenade', is_featured: false, validation_status: 'attendu' },
    ]);
    const r = orderZoneSpeciesForCollege(['Ronce', 'Grenade', 'Autre'], presence, {
      featuredFirst: true,
    });
    expect(r.ordered).toEqual(['Ronce', 'Grenade', 'Autre']);
    expect(r.featured.size).toBe(0);
    expect(r.toSearch.size).toBe(0);
  });

  test('repli : présence inconnue (non chargée) → ordre reçu', () => {
    const r = orderZoneSpeciesForCollege(names, new Map(), { featuredFirst: true });
    expect(r.ordered).toEqual(names);
    expect(orderZoneSpeciesForCollege(names, null, { featuredFirst: true }).ordered).toEqual(names);
  });

  test('hors collège (featured_first masqué) : ordre reçu, rien de signalé', () => {
    const r = orderZoneSpeciesForCollege(names, PRESENCE, { featuredFirst: false });
    expect(r.ordered).toEqual(names);
    expect(r.toSearch.size).toBe(0);
    expect(r.featured.size).toBe(0);
  });
});

describe('plafond', () => {
  const twenty = Array.from({ length: 20 }, (_, i) => `Espèce ${i + 1}`);

  test('zoneTilesCapValue : entier positif, sinon pas de plafond (fiche E6)', () => {
    expect(zoneTilesCapValue(12)).toBe(12);
    for (const v of [null, undefined, 'show', 'hide', 0, -3, 12.5, '12']) {
      expect(zoneTilesCapValue(v)).toBeNull();
    }
  });

  test('capZoneSpecies : 12 visibles, le reste caché ; sous le plafond, rien de caché', () => {
    const r = capZoneSpecies(twenty, 12);
    expect(r.visible).toHaveLength(12);
    expect(r.hidden).toEqual(twenty.slice(12));
    expect(capZoneSpecies(twenty.slice(0, 12), 12).hidden).toEqual([]);
    expect(capZoneSpecies(twenty, null).visible).toEqual(twenty);
    expect(capZoneSpecies(twenty, 'show').hidden).toEqual([]);
  });

  test('libellé « Voir les N autres »', () => {
    expect(zoneSpeciesMoreLabel(8)).toBe('Voir les 8 autres');
    expect(zoneSpeciesMoreLabel(1)).toBe('Voir l’autre espèce');
    expect(zoneSpeciesMoreLabel(0)).toBe('');
  });
});

describe('zoneSpeciesPresenceIndex', () => {
  test('premier nom gardé, entrées sans nom ignorées, valeurs normalisées', () => {
    const index = zoneSpeciesPresenceIndex([
      { name: ' Ronce ', is_featured: true, validation_status: 'attendu' },
      { name: 'Ronce', is_featured: false, validation_status: 'documentaire' },
      { name: '', is_featured: true },
      null,
      { name: 'Lierre' },
    ]);
    expect(index.get('Ronce')).toEqual({ is_featured: true, validation_status: 'attendu' });
    expect(index.get('Lierre')).toEqual({ is_featured: false, validation_status: null });
    expect(index.size).toBe(2);
  });
});
