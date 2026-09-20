import { describe, test, expect } from 'vitest';
import {
  visibleMapsForScope,
  pickDefaultMapId,
  resolveScopedMapId,
} from '../../src/utils/appMapScope';

const MAPS = [
  { id: 'foret', is_active: true },
  { id: 'n3', is_active: true },
  { id: 'archive', is_active: false },
];

describe('visibleMapsForScope', () => {
  test('toutes les cartes actives, quel que soit le contexte (le serveur borne déjà /api/maps)', () => {
    expect(visibleMapsForScope(MAPS).map((m) => m.id)).toEqual(['foret', 'n3']);
    expect(visibleMapsForScope(MAPS, { isTeacher: true }).map((m) => m.id)).toEqual([
      'foret',
      'n3',
    ]);
  });

  test('aucune carte active : repli sur la liste complète ; entrée invalide → []', () => {
    expect(visibleMapsForScope([{ id: 'archive', is_active: false }]).map((m) => m.id)).toEqual([
      'archive',
    ]);
    expect(visibleMapsForScope(null)).toEqual([]);
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

  test('aucune carte visible → repli sur la demande, puis chaîne vide', () => {
    expect(resolveScopedMapId({ visibleMaps: [], currentMapId: 'foret' })).toBe('foret');
    expect(resolveScopedMapId({})).toBe('');
  });
});
