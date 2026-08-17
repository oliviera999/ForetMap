// @vitest-environment jsdom
import { describe, test, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useVisitMascotStateMachine from '../../src/hooks/useVisitMascotStateMachine.js';
import { VISIT_MASCOT_STORAGE_KEY } from '../../src/utils/visitMascotCatalog.js';

const PACK_EXTRAS = [
  {
    id: 'srv-abeille',
    label: 'Abeille du verger',
    renderer: 'sprite_cut',
    fallbackSilhouette: 'gnome',
    spriteCut: { frameWidth: 32, frameHeight: 32, stateFrames: { idle: { srcs: ['/a.png'] } } },
  },
];

describe('useVisitMascotStateMachine — choix de la mascotte', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test('sans préférence de profil : la mascotte par défaut livrée est retenue', () => {
    const { result } = renderHook(() => useVisitMascotStateMachine({}));
    expect(result.current.visitMascotId).toBe('renard2-cut-spritesheet');
  });

  test('le défaut configuré par l’admin s’applique, y compris un pack publié', () => {
    const { result } = renderHook(() =>
      useVisitMascotStateMachine({
        extraCatalogEntries: PACK_EXTRAS,
        defaultMascotId: 'srv-abeille',
      }),
    );
    expect(result.current.visitMascotId).toBe('srv-abeille');
  });

  test('la préférence de profil prime à l’ouverture', () => {
    const { result } = renderHook(() =>
      useVisitMascotStateMachine({ preferredMascotId: 'sprout-rive' }),
    );
    expect(result.current.visitMascotId).toBe('sprout-rive');
    expect(localStorage.getItem(VISIT_MASCOT_STORAGE_KEY)).toBe('sprout-rive');
  });

  test('le dernier choix gagne : un changement en visite n’est plus écrasé par le profil', () => {
    const { result, rerender } = renderHook((props) => useVisitMascotStateMachine(props), {
      initialProps: { preferredMascotId: 'sprout-rive', extraCatalogEntries: [] },
    });
    expect(result.current.visitMascotId).toBe('sprout-rive');

    act(() => result.current.onChangeVisitMascotId('gnome1'));
    expect(result.current.visitMascotId).toBe('gnome1');

    // Une dépendance bouge (arrivée des packs publiés) : l'ancien code re-forçait le profil.
    rerender({ preferredMascotId: 'sprout-rive', extraCatalogEntries: PACK_EXTRAS });
    expect(result.current.visitMascotId).toBe('gnome1');
  });

  test('une préférence de profil qui change reprend la main', () => {
    const { result, rerender } = renderHook((props) => useVisitMascotStateMachine(props), {
      initialProps: { preferredMascotId: 'sprout-rive' },
    });
    act(() => result.current.onChangeVisitMascotId('gnome1'));
    expect(result.current.visitMascotId).toBe('gnome1');

    rerender({ preferredMascotId: 'olu-spritesheet' });
    expect(result.current.visitMascotId).toBe('olu-spritesheet');
  });

  test('un choix devenu interdit retombe sur le défaut', () => {
    const { result, rerender } = renderHook((props) => useVisitMascotStateMachine(props), {
      initialProps: { allowedMascotIds: [], defaultMascotId: 'sprout-rive' },
    });
    act(() => result.current.onChangeVisitMascotId('gnome1'));
    expect(result.current.visitMascotId).toBe('gnome1');

    rerender({ allowedMascotIds: ['sprout-rive'], defaultMascotId: 'sprout-rive' });
    expect(result.current.visitMascotId).toBe('sprout-rive');
  });
});
