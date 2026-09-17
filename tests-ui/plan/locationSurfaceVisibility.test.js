import { describe, test, expect } from 'vitest';

import {
  isLocationVisibleOnSurface,
  visibleSurfacesOfLocation,
  countLocationsBySurface,
} from '../../src/utils/locationSurfaceVisibility.js';

/**
 * Miroir client de `isVisibleOnSurface()` (`lib/locationSurfaces.js`). Les cas rejoués ici sont
 * ceux de `tests/location-surfaces.test.js` côté serveur : les deux implémentations doivent
 * répondre la même chose, sans quoi la console admin annoncerait une visibilité que la charge
 * servie ne respecte pas.
 */
describe('isLocationVisibleOnSurface — mêmes règles que le serveur', () => {
  test('sans catégorie : visible partout où le lieu n’est pas masqué', () => {
    const item = { hidden_surfaces: ['plan'] };
    expect(isLocationVisibleOnSurface(item, 'map')).toBe(true);
    expect(isLocationVisibleOnSurface(item, 'visit')).toBe(true);
    expect(isLocationVisibleOnSurface(item, 'staff')).toBe(true);
    expect(isLocationVisibleOnSurface(item, 'plan')).toBe(false);
  });

  test('avec catégories : il faut qu’au moins une apparaisse sur la surface', () => {
    const item = {
      hidden_surfaces: [],
      categories: [{ surfaces: ['map', 'staff'] }, { surfaces: ['map'] }],
    };
    expect(isLocationVisibleOnSurface(item, 'map')).toBe(true);
    expect(isLocationVisibleOnSurface(item, 'staff')).toBe(true);
    expect(isLocationVisibleOnSurface(item, 'plan')).toBe(false);
  });

  test('le masquage du lieu l’emporte sur la catégorie', () => {
    const item = { hidden_surfaces: ['staff'], categories: [{ surfaces: ['map', 'staff'] }] };
    expect(isLocationVisibleOnSurface(item, 'staff')).toBe(false);
  });

  test('surface inconnue : jamais visible', () => {
    expect(isLocationVisibleOnSurface({ hidden_surfaces: [] }, 'inexistante')).toBe(false);
    expect(isLocationVisibleOnSurface({ hidden_surfaces: [] }, '')).toBe(false);
  });

  test('accepte la forme SQL (`"map,plan"`) comme le serveur', () => {
    const item = { hidden_surfaces: 'plan,visit' };
    expect(visibleSurfacesOfLocation(item)).toEqual(['map', 'staff']);
  });
});

describe('countLocationsBySurface — bandeau de la revue des surfaces', () => {
  test('compte, pour chaque surface, les lieux qui y sortent', () => {
    const counts = countLocationsBySurface([
      { hidden_surfaces: [] },
      { hidden_surfaces: ['plan'] },
      { hidden_surfaces: ['plan', 'visit'] },
      { hidden_surfaces: [], categories: [{ surfaces: ['staff'] }] },
    ]);
    expect(counts).toEqual({ map: 3, visit: 2, plan: 1, staff: 4 });
  });

  test('liste vide : des zéros, pas un objet vide', () => {
    expect(countLocationsBySurface([])).toEqual({ map: 0, visit: 0, plan: 0, staff: 0 });
  });
});
