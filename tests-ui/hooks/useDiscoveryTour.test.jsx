import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useDiscoveryTour } from '../../src/hooks/useDiscoveryTour';
import {
  getDiscoverySteps,
  hasDiscoveryTour,
  resolveDiscoveryBody,
} from '../../src/constants/discoveryTour';

const SEEN_KEY = 'foretmap_discovery_seen_v1';

describe('constants/discoveryTour', () => {
  it('expose des parcours pour les onglets principaux', () => {
    expect(hasDiscoveryTour('map')).toBe(true);
    expect(hasDiscoveryTour('tasks')).toBe(true);
    expect(hasDiscoveryTour('plants')).toBe(true);
    expect(hasDiscoveryTour('onglet-inexistant')).toBe(false);
  });

  it('filtre les étapes réservées à un rôle', () => {
    const asStudent = getDiscoverySteps('profiles', false);
    const asTeacher = getDiscoverySteps('profiles', true);
    expect(asTeacher.length).toBeGreaterThan(asStudent.length);
  });

  it('résout le texte selon le rôle (prof prioritaire si présent)', () => {
    const step = { body: 'élève', bodyTeacher: 'prof' };
    expect(resolveDiscoveryBody(step, false)).toBe('élève');
    expect(resolveDiscoveryBody(step, true)).toBe('prof');
    expect(resolveDiscoveryBody({ body: 'commun' }, true)).toBe('commun');
  });
});

describe('useDiscoveryTour', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('mémorise les onglets vus dans le localStorage', () => {
    const { result } = renderHook(() => useDiscoveryTour({ isTeacher: false }));
    expect(result.current.hasSeenTour('map')).toBe(false);

    act(() => {
      result.current.markTourSeen('map');
    });

    expect(result.current.hasSeenTour('map')).toBe(true);
    const stored = JSON.parse(localStorage.getItem(SEEN_KEY));
    expect(stored.map).toBe(true);
  });

  it('démarre un parcours forcé sur une étape centrée et progresse jusqu’à la fin', () => {
    const { result } = renderHook(() => useDiscoveryTour({ isTeacher: false }));

    // L'onglet « map » contient une étape centrée (target null) toujours présentable.
    let started = false;
    act(() => {
      started = result.current.startTour('map', { force: true });
    });
    expect(started).toBe(true);
    expect(result.current.isActive).toBe(true);
    expect(result.current.active.index).toBe(0);

    const total = result.current.active.steps.length;
    act(() => {
      result.current.nextStep();
    });
    if (total > 1) {
      expect(result.current.active.index).toBe(1);
    }

    // On consomme toutes les étapes restantes : le parcours se termine et marque vu.
    act(() => {
      for (let i = 0; i < total; i += 1) result.current.nextStep();
    });
    expect(result.current.isActive).toBe(false);
    expect(result.current.hasSeenTour('map')).toBe(true);
  });

  it('marque l’onglet vu dès le démarrage, avant la fin du parcours', () => {
    const { result } = renderHook(() => useDiscoveryTour({ isTeacher: false }));
    act(() => {
      result.current.startTour('map', { force: true });
    });
    // Parcours toujours actif mais déjà mémorisé : recharger/revenir ne le relancera pas.
    expect(result.current.isActive).toBe(true);
    expect(result.current.hasSeenTour('map')).toBe(true);
    expect(JSON.parse(localStorage.getItem(SEEN_KEY)).map).toBe(true);
  });

  it('ne relance pas un parcours déjà vu sans force', () => {
    const { result } = renderHook(() => useDiscoveryTour({ isTeacher: false }));
    act(() => {
      result.current.markTourSeen('map');
    });
    let started = true;
    act(() => {
      started = result.current.startTour('map');
    });
    expect(started).toBe(false);
    expect(result.current.isActive).toBe(false);
  });

  it('marque l’onglet vu et ne démarre pas si aucune étape n’est présentable', () => {
    const { result } = renderHook(() => useDiscoveryTour({ isTeacher: false }));
    // « stats » n'a que des étapes ciblées : aucune cible dans le DOM de test.
    let started = true;
    act(() => {
      started = result.current.startTour('stats', { force: true });
    });
    expect(started).toBe(false);
    expect(result.current.hasSeenTour('stats')).toBe(true);
  });

  it('réinitialise les onglets vus', () => {
    const { result } = renderHook(() => useDiscoveryTour({ isTeacher: false }));
    act(() => {
      result.current.markTourSeen('map');
      result.current.markTourSeen('tasks');
    });
    act(() => {
      result.current.resetSeen();
    });
    expect(result.current.hasSeenTour('map')).toBe(false);
    expect(result.current.hasSeenTour('tasks')).toBe(false);
  });
});
