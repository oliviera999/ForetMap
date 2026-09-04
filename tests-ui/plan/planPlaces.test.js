import { describe, expect, test } from 'vitest';

import {
  buildPlaceUrl,
  countPlacesByCategory,
  filterPlacesByCategories,
  planPlaceFocusPct,
  planPlacesFromContent,
  readPlaceIdFromLocation,
} from '../../src/plan/utils/planPlaces.js';
import { parsePctPolygonPoints } from '../../src/shared/pct-map/pctPolygon.js';

const CONTENT = {
  zones: [
    { id: 'z1', name: 'Verger', points: '[{"xp":0,"yp":0},{"xp":10,"yp":0},{"xp":10,"yp":10}]' },
    { id: 'z2', name: 'atelier', category_ids: ['c1'] },
  ],
  markers: [
    { id: 'm1', label: 'Infirmerie', x_pct: 40, y_pct: 60, category_ids: ['c1', 'c2'] },
    { id: 'm2', label: 'Bibliothèque', x_pct: 1, y_pct: 2, category_ids: ['c2'] },
  ],
};

describe('planPlacesFromContent', () => {
  test('unifie zones et repères, pose `kind` et trie par nom (fr, sans casse ni accent)', () => {
    const places = planPlacesFromContent(CONTENT);
    expect(places.map((p) => p.name)).toEqual(['atelier', 'Bibliothèque', 'Infirmerie', 'Verger']);
    expect(places.find((p) => p.id === 'z1').kind).toBe('zone');
    expect(places.find((p) => p.id === 'm1').kind).toBe('marker');
    expect(places.find((p) => p.id === 'm1').x_pct).toBe(40);
  });

  test('contenu vide ou absent → liste vide', () => {
    expect(planPlacesFromContent(null)).toEqual([]);
    expect(planPlacesFromContent({})).toEqual([]);
  });
});

describe('filterPlacesByCategories', () => {
  const places = planPlacesFromContent(CONTENT);

  test('aucune sélection → tout', () => {
    expect(filterPlacesByCategories(places, [])).toHaveLength(4);
    expect(filterPlacesByCategories(places, new Set())).toHaveLength(4);
  });

  test('sélection → lieux portant au moins une catégorie retenue', () => {
    expect(filterPlacesByCategories(places, ['c2']).map((p) => p.id)).toEqual(['m2', 'm1']);
    expect(
      filterPlacesByCategories(places, new Set(['c1']))
        .map((p) => p.id)
        .sort(),
    ).toEqual(['m1', 'z2']);
  });

  test('les lieux sans catégorie sortent dès qu’un filtre est actif', () => {
    expect(filterPlacesByCategories(places, ['c1']).some((p) => p.id === 'z1')).toBe(false);
  });
});

describe('countPlacesByCategory', () => {
  test('compte les lieux par catégorie', () => {
    const counts = countPlacesByCategory(planPlacesFromContent(CONTENT));
    expect(counts.get('c1')).toBe(2);
    expect(counts.get('c2')).toBe(2);
    expect(counts.get('inconnue')).toBeUndefined();
  });
});

describe('lien profond ?lieu=', () => {
  test('readPlaceIdFromLocation', () => {
    expect(readPlaceIdFromLocation('?lieu=z1')).toBe('z1');
    expect(readPlaceIdFromLocation('?a=1&lieu=%20m2%20')).toBe('m2');
    expect(readPlaceIdFromLocation('')).toBe('');
    expect(readPlaceIdFromLocation('?autre=1')).toBe('');
  });

  test('buildPlaceUrl conserve les autres paramètres et retire `lieu` quand vide', () => {
    expect(buildPlaceUrl({ pathname: '/', search: '?x=1' }, 'z1')).toBe('/?x=1&lieu=z1');
    expect(buildPlaceUrl({ pathname: '/', search: '?lieu=z1&x=1' }, '')).toBe('/?x=1');
    expect(buildPlaceUrl({ pathname: '/plan', search: '?lieu=z1' }, '')).toBe('/plan');
  });
});

describe('planPlaceFocusPct', () => {
  test('repère → ses coordonnées ; zone → centre du polygone ; sinon null', () => {
    const places = planPlacesFromContent(CONTENT);
    const marker = places.find((p) => p.id === 'm1');
    expect(planPlaceFocusPct(marker, parsePctPolygonPoints)).toEqual({ xp: 40, yp: 60 });
    const zone = places.find((p) => p.id === 'z1');
    const focus = planPlaceFocusPct(zone, parsePctPolygonPoints);
    expect(focus.xp).toBeCloseTo(6.667, 2);
    expect(focus.yp).toBeCloseTo(3.333, 2);
    expect(planPlaceFocusPct(null, parsePctPolygonPoints)).toBeNull();
    expect(planPlaceFocusPct({ kind: 'zone', points: '[]' }, parsePctPolygonPoints)).toBeNull();
    expect(planPlaceFocusPct({ kind: 'marker' }, parsePctPolygonPoints)).toBeNull();
  });
});
