import { describe, test, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useMapRouteMode } from '../../src/shared/map-routes/useMapRouteMode.js';

const places = [
  { kind: 'zone', id: 1, name: 'Verger' },
  { kind: 'marker', id: 11, name: 'Compost' },
  { kind: 'marker', id: 12, name: 'Mare' },
];
const route = {
  slug: 'tour-du-jardin',
  title: 'Le tour du jardin',
  steps: [
    { target_type: 'zone', target_id: 1 },
    { target_type: 'marker', target_id: 11 },
    { target_type: 'marker', target_id: 12 },
  ],
};

function setup(overrides = {}) {
  return renderHook((props) => useMapRouteMode({ routes: [route], places, ...props }), {
    initialProps: overrides,
  });
}

describe('useMapRouteMode', () => {
  test('démarrer un parcours ouvre sa première étape', () => {
    const { result } = setup();
    act(() => result.current.startRoute(route));
    expect(result.current.activeRoute?.slug).toBe('tour-du-jardin');
    expect(result.current.routeSteps).toHaveLength(3);
    expect(result.current.routeIndex).toBe(0);
  });

  test('l’avancement est borné aux deux bouts : la fin est la fin', () => {
    const { result } = setup();
    act(() => result.current.startRoute(route));
    act(() => result.current.goToRouteIndex(-1));
    expect(result.current.routeIndex).toBe(0);
    act(() => result.current.goToRouteIndex(9));
    expect(result.current.routeIndex).toBe(2);
  });

  test('« Reprendre » reprend à l’étape quittée, pas à la première', () => {
    const { result } = setup();
    act(() => result.current.startRoute(route));
    act(() => result.current.goToRouteIndex(2));
    act(() => result.current.exitRoute());
    expect(result.current.activeRoute).toBe(null);
    expect(result.current.resumableRouteSlug).toBe('tour-du-jardin');

    act(() => result.current.resumeRoute());
    expect(result.current.activeRoute?.slug).toBe('tour-du-jardin');
    expect(result.current.routeIndex).toBe(2);
    // Reprendre consomme la reprise : le bouton n'a plus lieu d'être affiché.
    expect(result.current.resumableRouteSlug).toBe('');
  });

  test('relancer le parcours depuis la liste repart bien du début', () => {
    const { result } = setup();
    act(() => result.current.startRoute(route));
    act(() => result.current.goToRouteIndex(2));
    act(() => result.current.exitRoute());
    act(() => result.current.startRoute(route));
    expect(result.current.routeIndex).toBe(0);
  });

  test('un parcours raccourci depuis la sortie reprend à sa dernière étape existante', () => {
    const { result, rerender } = renderHook(
      ({ list }) => useMapRouteMode({ routes: [route], places: list }),
      { initialProps: { list: places } },
    );
    act(() => result.current.startRoute(route));
    act(() => result.current.goToRouteIndex(2));
    act(() => result.current.exitRoute());
    // Les deux repères ont disparu de la carte entre-temps : reprendre dans le vide n'a pas de sens.
    rerender({ list: [places[0]] });
    act(() => result.current.resumeRoute());
    expect(result.current.routeSteps).toHaveLength(1);
    expect(result.current.routeIndex).toBe(0);
  });

  test('changer de carte oublie le parcours et son étape', () => {
    const { result } = setup();
    act(() => result.current.startRoute(route));
    act(() => result.current.goToRouteIndex(1));
    act(() => result.current.exitRoute());
    act(() => result.current.resetForMapChange());
    expect(result.current.resumableRouteSlug).toBe('');

    act(() => result.current.startRoute(route));
    expect(result.current.routeIndex).toBe(0);
  });

  test('l’étape courante est annoncée à l’appelant (recentrage carte, fiche du lieu)', () => {
    const onStepPlace = vi.fn();
    const { result } = setup({ onStepPlace });
    act(() => result.current.startRoute(route));
    expect(onStepPlace).toHaveBeenLastCalledWith(
      expect.objectContaining({ place: places[0], number: 1 }),
    );
    act(() => result.current.goToRouteIndex(1));
    expect(onStepPlace).toHaveBeenLastCalledWith(
      expect.objectContaining({ place: places[1], number: 2 }),
    );
  });

  test('quitter laisse l’appelant nettoyer son écran', () => {
    const onExitExtra = vi.fn();
    const { result } = setup({ onExitExtra });
    act(() => result.current.startRoute(route));
    act(() => result.current.exitRoute());
    expect(onExitExtra).toHaveBeenCalledTimes(1);
  });
});
