import { describe, expect, test } from 'vitest';

import {
  buildRouteUrl,
  nextRouteIndex,
  readRouteSlugFromLocation,
  resolveRouteSteps,
  routeStepTitle,
} from '../../src/plan/utils/planRoutes.js';

const PLACES = [
  { id: 'z1', kind: 'zone', name: 'Accueil' },
  { id: 'm1', kind: 'marker', name: 'Infirmerie' },
];

const ROUTE = {
  slug: 'tour',
  steps: [
    { position: 0, target_type: 'zone', target_id: 'z1', step_title: 'Départ', step_text: 'Badge' },
    { position: 1, target_type: 'marker', target_id: 'm1', step_title: '' },
    { position: 2, target_type: 'zone', target_id: 'disparue', step_title: 'Fantôme' },
  ],
};

describe('lien profond ?parcours=', () => {
  test('readRouteSlugFromLocation', () => {
    expect(readRouteSlugFromLocation('?parcours=tour')).toBe('tour');
    expect(readRouteSlugFromLocation('?lieu=z1')).toBe('');
    expect(readRouteSlugFromLocation('')).toBe('');
  });

  test('buildRouteUrl pose le parcours et retire le lieu (le parcours pilote la sélection)', () => {
    expect(buildRouteUrl({ pathname: '/', search: '?lieu=z1' }, 'tour')).toBe('/?parcours=tour');
    expect(buildRouteUrl({ pathname: '/', search: '?parcours=tour&x=1' }, '')).toBe('/?x=1');
  });
});

describe('resolveRouteSteps', () => {
  test('résout les étapes en lieux réels, numérote, et écarte les lieux supprimés', () => {
    const steps = resolveRouteSteps(ROUTE, PLACES);
    expect(steps).toHaveLength(2);
    expect(steps.map((s) => s.number)).toEqual([1, 2]);
    expect(steps[0].place.name).toBe('Accueil');
    expect(steps[1].place.id).toBe('m1');
  });

  test('parcours vide ou absent : aucune étape', () => {
    expect(resolveRouteSteps(null, PLACES)).toEqual([]);
    expect(resolveRouteSteps({ steps: [] }, PLACES)).toEqual([]);
  });
});

describe('routeStepTitle', () => {
  test('le titre de l’étape, sinon le nom du lieu', () => {
    const [first, second] = resolveRouteSteps(ROUTE, PLACES);
    expect(routeStepTitle(first)).toBe('Départ');
    expect(routeStepTitle(second)).toBe('Infirmerie');
    expect(routeStepTitle(null)).toBe('');
  });
});

describe('nextRouteIndex', () => {
  test('borne aux extrémités : la fin est la fin, pas une boucle', () => {
    expect(nextRouteIndex(0, 3, 1)).toBe(1);
    expect(nextRouteIndex(2, 3, 1)).toBe(2);
    expect(nextRouteIndex(0, 3, -1)).toBe(0);
    expect(nextRouteIndex(5, 3, 0)).toBe(2);
    expect(nextRouteIndex(0, 0, 1)).toBe(0);
  });
});
