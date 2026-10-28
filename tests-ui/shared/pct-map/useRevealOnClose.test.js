import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import {
  REVEAL_ON_CLOSE_MS,
  revealPlaceKey,
  useRevealOnClose,
} from '../../../src/shared/pct-map/useRevealOnClose.js';

const CDI = { kind: 'zone', id: 'z-cdi' };
const FABLAB = { kind: 'marker', id: 12 };

function mount(enabled = true, initial = null) {
  return renderHook(({ place, on }) => useRevealOnClose(place, on), {
    initialProps: { place: initial, on: enabled },
  });
}

describe('revealPlaceKey', () => {
  test('clé par type et identifiant ; vide si incomplète', () => {
    expect(revealPlaceKey('zone', 'z-cdi')).toBe('zone:z-cdi');
    expect(revealPlaceKey('marker', 12)).toBe('marker:12');
    expect(revealPlaceKey('marker', '')).toBe('');
    expect(revealPlaceKey('route', 'r1')).toBe('');
  });
});

describe('useRevealOnClose', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('fiche refermée : halo sur ce lieu, puis plus rien après la durée du halo', () => {
    const { result, rerender } = mount(true, CDI);
    expect(result.current('zone', 'z-cdi')).toBe(false);
    rerender({ place: null, on: true });
    expect(result.current('zone', 'z-cdi')).toBe(true);
    // Même identifiant, autre type : pas le même lieu.
    expect(result.current('marker', 'z-cdi')).toBe(false);
    act(() => vi.advanceTimersByTime(REVEAL_ON_CLOSE_MS));
    expect(result.current('zone', 'z-cdi')).toBe(false);
  });

  test('identifiant numérique ou texte : même lieu', () => {
    const { result, rerender } = mount(true, FABLAB);
    rerender({ place: null, on: true });
    expect(result.current('marker', '12')).toBe(true);
    expect(result.current('marker', 12)).toBe(true);
  });

  test('passer d’une fiche à une autre ne déclenche rien', () => {
    const { result, rerender } = mount(true, CDI);
    rerender({ place: FABLAB, on: true });
    expect(result.current('zone', 'z-cdi')).toBe(false);
    expect(result.current('marker', 12)).toBe(false);
  });

  test('rouvrir une fiche pendant le halo l’éteint aussitôt', () => {
    const { result, rerender } = mount(true, CDI);
    rerender({ place: null, on: true });
    expect(result.current('zone', 'z-cdi')).toBe(true);
    rerender({ place: FABLAB, on: true });
    expect(result.current('zone', 'z-cdi')).toBe(false);
    // Le minuteur du halo éteint ne rallume rien en expirant.
    act(() => vi.advanceTimersByTime(REVEAL_ON_CLOSE_MS));
    expect(result.current('marker', 12)).toBe(false);
  });

  test('désactivé : jamais de halo', () => {
    const { result, rerender } = mount(false, CDI);
    rerender({ place: null, on: false });
    expect(result.current('zone', 'z-cdi')).toBe(false);
  });
});
