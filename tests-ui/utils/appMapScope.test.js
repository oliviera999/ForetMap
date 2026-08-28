import { describe, test, expect } from 'vitest';
import {
  allowedMapIdsForScope,
  visibleMapsForScope,
  pickDefaultMapId,
  resolveScopedMapId,
} from '../../src/utils/appMapScope';

const MAPS = [
  { id: 'foret', is_active: true },
  { id: 'n3', is_active: true },
  { id: 'archive', is_active: false },
];

describe('allowedMapIdsForScope', () => {
  test('prof ou visite publique : aucune restriction', () => {
    expect(allowedMapIdsForScope({ isTeacher: true, affiliation: 'n3' })).toBeNull();
    expect(allowedMapIdsForScope({ isPublicVisit: true, affiliation: 'n3' })).toBeNull();
  });

  test('élève : restriction issue de l’affiliation', () => {
    expect(allowedMapIdsForScope({ affiliation: 'n3' })).toEqual(['n3']);
    expect(allowedMapIdsForScope({ affiliation: 'both' })).toBeNull();
  });
});

describe('visibleMapsForScope', () => {
  test('prof : toutes les cartes actives', () => {
    expect(visibleMapsForScope(MAPS, { isTeacher: true }).map((m) => m.id)).toEqual([
      'foret',
      'n3',
    ]);
  });

  test('élève n3 : bornée à sa carte', () => {
    expect(visibleMapsForScope(MAPS, { affiliation: 'n3' }).map((m) => m.id)).toEqual(['n3']);
  });
});

describe('pickDefaultMapId', () => {
  const defaults = { student: 'foret', teacher: 'n3', visit: 'visite' };

  test('la visite publique prime sur le rôle', () => {
    expect(pickDefaultMapId({ isTeacher: true, isPublicVisit: true, defaults })).toBe('visite');
  });

  test('prof puis élève', () => {
    expect(pickDefaultMapId({ isTeacher: true, defaults })).toBe('n3');
    expect(pickDefaultMapId({ defaults })).toBe('foret');
  });
});

describe('resolveScopedMapId', () => {
  const visibleMaps = [{ id: 'foret' }, { id: 'n3' }];

  test('carte courante visible → conservée', () => {
    expect(resolveScopedMapId({ visibleMaps, currentMapId: 'n3', defaultMapId: 'foret' })).toBe(
      'n3',
    );
  });

  test('carte courante invisible → carte par défaut', () => {
    expect(
      resolveScopedMapId({ visibleMaps, currentMapId: 'inconnue', defaultMapId: 'foret' }),
    ).toBe('foret');
  });

  test('ni courante ni défaut visibles → première carte visible', () => {
    expect(
      resolveScopedMapId({ visibleMaps, currentMapId: 'inconnue', defaultMapId: 'absente' }),
    ).toBe('foret');
  });

  test('restriction d’affiliation : réoriente la demande avant résolution', () => {
    expect(
      resolveScopedMapId({
        visibleMaps: [{ id: 'n3' }],
        allowedMapIds: ['n3'],
        currentMapId: 'foret',
        defaultMapId: 'foret',
      }),
    ).toBe('n3');
  });

  test('aucune carte visible → repli sur la demande, puis chaîne vide', () => {
    expect(resolveScopedMapId({ visibleMaps: [], currentMapId: 'foret' })).toBe('foret');
    expect(resolveScopedMapId({})).toBe('');
  });
});
