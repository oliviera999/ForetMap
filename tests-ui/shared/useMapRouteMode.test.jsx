import { describe, test, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { mapRouteResumeStorageKey } from '../../src/shared/map-routes/mapRouteSteps.js';
import { useMapRouteMode } from '../../src/shared/map-routes/useMapRouteMode.js';

/**
 * Noyau du mode parcours, partagé par les trois surfaces (Visite, carte de travail, les deux
 * plans) depuis que le Plan a cessé d'en porter une copie
 * (`docs/AUDIT_PARCOURS_2026-09-17.md` §2.5).
 */

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
  beforeEach(() => {
    localStorage.clear();
  });

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

  /**
   * Reprise **mémorisée sur l'appareil** : sans elle, l'avancement ne survivait pas à un
   * rechargement de page — la situation du visiteur qui a scanné un QR code et verrouille son
   * téléphone entre deux étapes (`docs/AUDIT_PARCOURS_2026-09-17.md` §2.2). Rien ne part vers
   * le serveur : c'est la promesse faite au visiteur.
   */
  test('avec une clé de stockage, la reprise survit à un rechargement', () => {
    const storageKey = mapRouteResumeStorageKey('visit', 'carte-1');
    const first = setup({ storageKey });
    act(() => first.result.current.startRoute(route));
    act(() => first.result.current.goToRouteIndex(1));
    act(() => first.result.current.exitRoute());
    first.unmount();

    const second = setup({ storageKey });
    expect(second.result.current.resumableRouteSlug).toBe('tour-du-jardin');
    act(() => second.result.current.resumeRoute());
    expect(second.result.current.routeIndex).toBe(1);
  });

  test('sans clé de stockage, la reprise ne vit qu’en mémoire', () => {
    const first = setup();
    act(() => first.result.current.startRoute(route));
    act(() => first.result.current.exitRoute());
    first.unmount();

    const second = setup();
    expect(second.result.current.resumableRouteSlug).toBe('');
  });

  test('une reprise qui ne désigne plus aucun parcours publié s’efface', () => {
    const storageKey = mapRouteResumeStorageKey('visit', 'carte-1');
    const first = setup({ storageKey });
    act(() => first.result.current.startRoute(route));
    act(() => first.result.current.exitRoute());
    first.unmount();

    // Le parcours a été dépublié entre-temps : pas de bouton « Reprendre » qui ne ferait rien.
    const second = renderHook(() =>
      useMapRouteMode({ routes: [{ ...route, slug: 'autre-chose' }], places, storageKey }),
    );
    expect(second.result.current.resumableRouteSlug).toBe('');
    expect(localStorage.getItem(storageKey)).toBe(null);
  });

  test('la clé de reprise est propre à une surface et à une carte', () => {
    expect(mapRouteResumeStorageKey('visit', 'c1')).toBe('foretmap:visit:route-resume:c1');
    expect(mapRouteResumeStorageKey('map', 'c1')).not.toBe(mapRouteResumeStorageKey('visit', 'c1'));
    // Pas de carte : pas de reprise mémorisée (une clé partagée mélangerait deux cartes).
    expect(mapRouteResumeStorageKey('visit', '')).toBe('');
  });

  /**
   * Aperçu d'un lieu **pendant** un parcours : l'étape courante garde la sélection, et changer
   * d'étape rend la main au parcours. C'était l'un des trois apports propres au Plan avant
   * l'unification (`docs/AUDIT_PLAN_NAVIGATION_UX_2026-09-16.md` N5).
   */
  test('changer d’étape referme l’aperçu ouvert sur un autre lieu', () => {
    const { result } = setup();
    act(() => result.current.startRoute(route));
    act(() => result.current.setPeekPlace(places[2]));
    expect(result.current.peekPlace).toBe(places[2]);
    act(() => result.current.goToRouteIndex(1));
    expect(result.current.peekPlace).toBe(null);
  });

  test('les rappels du Plan sont appelés : démarrage, sortie, mesure d’usage', () => {
    const onStartExtra = vi.fn();
    const onExit = vi.fn();
    const onUsage = vi.fn();
    const { result } = setup({ onStartExtra, onExit, onUsage });
    act(() => result.current.startRoute(route));
    expect(onStartExtra).toHaveBeenCalledTimes(1);
    expect(onUsage).toHaveBeenCalledWith('route_start', 'tour-du-jardin');
    act(() => result.current.goToRouteIndex(1));
    expect(onUsage).toHaveBeenLastCalledWith('route_step', 'tour-du-jardin#2');
    act(() => result.current.exitRoute());
    expect(onExit).toHaveBeenCalledWith('tour-du-jardin');
  });
});
