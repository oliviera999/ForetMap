import { describe, test, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useMapGuidance } from '../../src/shared/map-guide/useMapGuidance.js';

const places = [
  { kind: 'zone', id: 3, name: 'Verger' },
  { kind: 'marker', id: 3, name: 'Compost' },
];

describe('useMapGuidance', () => {
  test('aucun lieu visé au départ', () => {
    const { result } = renderHook(() => useMapGuidance({ places }));
    expect(result.current.guidedPlace).toBe(null);
    expect(result.current.isTarget(places[0])).toBe(false);
  });

  test('viser un lieu le retrouve par son type **et** son identifiant', () => {
    const { result } = renderHook(() => useMapGuidance({ places }));
    act(() => result.current.goTo(places[1]));
    expect(result.current.guidedPlace).toEqual(places[1]);
    // Le repère 3 est visé, pas la zone 3 : sans le type, les deux se confondraient.
    expect(result.current.isTarget(places[1])).toBe(true);
    expect(result.current.isTarget(places[0])).toBe(false);
  });

  test('« Arrêter » est le seul chemin qui coupe le guidage, et il se signale', () => {
    const onStop = vi.fn();
    const { result } = renderHook(() => useMapGuidance({ places, onStop }));
    act(() => result.current.goTo(places[0]));
    act(() => result.current.stop());
    expect(result.current.guidedPlace).toBe(null);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  test('le départ prévient l’appelant (position à activer, fiche à refermer, journal)', () => {
    const onGoTo = vi.fn();
    const { result } = renderHook(() => useMapGuidance({ places, onGoTo }));
    act(() => result.current.goTo(places[0]));
    expect(onGoTo).toHaveBeenCalledWith(places[0]);
  });

  test('un lieu sans identifiant ne devient pas une cible', () => {
    const onGoTo = vi.fn();
    const { result } = renderHook(() => useMapGuidance({ places, onGoTo }));
    act(() => result.current.goTo({ kind: 'zone' }));
    expect(result.current.guidedPlace).toBe(null);
    expect(onGoTo).not.toHaveBeenCalled();
  });

  test('changer de carte efface la cible sans rejouer l’arrêt (pas d’effet de bord)', () => {
    const onStop = vi.fn();
    const { result } = renderHook(() => useMapGuidance({ places, onStop }));
    act(() => result.current.goTo(places[0]));
    act(() => result.current.reset());
    expect(result.current.guidedPlace).toBe(null);
    expect(onStop).not.toHaveBeenCalled();
  });

  test('le lieu visé disparu du jeu de lieux ne fait pas planter le guidage', () => {
    const { result, rerender } = renderHook(({ list }) => useMapGuidance({ places: list }), {
      initialProps: { list: places },
    });
    act(() => result.current.goTo(places[0]));
    rerender({ list: [places[1]] });
    expect(result.current.guidedPlace).toBe(null);
  });
});
