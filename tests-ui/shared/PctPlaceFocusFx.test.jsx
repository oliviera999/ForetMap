import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, render, renderHook } from '@testing-library/react';

import { PctPlaceFocusFx } from '../../src/shared/pct-map/PctPlaceFocusFx.jsx';
import { usePlaceFocusFx } from '../../src/shared/pct-map/usePlaceFocusFx.js';

/**
 * Effets du « zoom sur le lieu » : emoji qui s'envole / atterrit, projecteur, étincelles.
 */

const zone = {
  kind: 'zone',
  id: 7,
  points: [
    { xp: 10, yp: 10 },
    { xp: 30, yp: 10 },
    { xp: 30, yp: 30 },
    { xp: 10, yp: 30 },
  ],
};
const marker = { kind: 'marker', id: 3, x_pct: 40, y_pct: 60, emoji: '🍄' };

const ALL = { emoji: true, spotlight: true, sparkles: true };

describe('usePlaceFocusFx', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('zoom → fiche ouverte (projecteur léger) → retour → plus rien', () => {
    const { result } = renderHook(() => usePlaceFocusFx(ALL));
    act(() =>
      result.current.onFx({ type: 'in', place: zone, fromScale: 1, toScale: 3, durationMs: 300 }),
    );
    expect(result.current.fx).toMatchObject({ phase: 'in', place: zone, holeScale: 3 });
    act(() => vi.advanceTimersByTime(700));
    expect(result.current.fx.phase).toBe('hold');
    act(() =>
      result.current.onFx({ type: 'out', place: zone, fromScale: 3, toScale: 1, durationMs: 300 }),
    );
    expect(result.current.fx).toMatchObject({ phase: 'out', holeScale: 3 });
    act(() => vi.advanceTimersByTime(300));
    expect(result.current.fx).toBeNull();
  });

  test('annulation : tout s’éteint', () => {
    const { result } = renderHook(() => usePlaceFocusFx(ALL));
    act(() =>
      result.current.onFx({ type: 'in', place: zone, fromScale: 1, toScale: 3, durationMs: 300 }),
    );
    act(() => result.current.onFx({ type: 'cancel' }));
    expect(result.current.fx).toBeNull();
  });

  test('aucun effet activé : aucun état', () => {
    const { result } = renderHook(() => usePlaceFocusFx({}));
    act(() =>
      result.current.onFx({ type: 'in', place: zone, fromScale: 1, toScale: 3, durationMs: 300 }),
    );
    expect(result.current.fx).toBeNull();
  });
});

function fxOf(overrides = {}) {
  return {
    key: 1,
    phase: 'in',
    place: marker,
    fromScale: 1,
    toScale: 2.5,
    durationMs: 350,
    holeScale: 2.5,
    effects: ALL,
    ...overrides,
  };
}

describe('PctPlaceFocusFx', () => {
  test('repère : emoji qui s’envole, projecteur et étincelles', () => {
    const { container, getByTestId } = render(
      <PctPlaceFocusFx
        fx={fxOf()}
        fitWidth={1000}
        fitHeight={500}
        emojiOf={(p) => p.emoji || ''}
      />,
    );
    const root = getByTestId('place-focus-fx');
    expect(root.getAttribute('aria-hidden')).toBe('true');
    const emoji = container.querySelector('.fm-place-fx__emoji--in');
    expect(emoji.textContent).toBe('🍄');
    expect(emoji.style.left).toBe('40%');
    expect(emoji.style.top).toBe('60%');
    expect(container.querySelector('.fm-place-fx__spot path').getAttribute('d')).toMatch(
      /^M0 0H100V100H0ZM/,
    );
    expect(container.querySelectorAll('.fm-place-fx__sparkle')).toHaveLength(10);
  });

  test('zone sans emoji : projecteur seul, à l’ancre fournie', () => {
    const { container } = render(
      <PctPlaceFocusFx
        fx={fxOf({ place: zone, effects: { emoji: true, spotlight: true } })}
        fitWidth={1000}
        fitHeight={500}
        emojiOf={() => ''}
      />,
    );
    expect(container.querySelector('.fm-place-fx__emoji')).toBeNull();
    expect(container.querySelector('.fm-place-fx__sparkles')).toBeNull();
    expect(container.querySelector('.fm-place-fx__spot path').getAttribute('d')).toBe(
      'M0 0H100V100H0ZM10 10L30 10L30 30L10 30Z',
    );
  });

  test('fiche ouverte : plus d’emoji ni d’étincelles, le projecteur reste', () => {
    const { container } = render(
      <PctPlaceFocusFx
        fx={fxOf({ phase: 'hold' })}
        fitWidth={1000}
        fitHeight={500}
        emojiOf={(p) => p.emoji}
      />,
    );
    expect(container.querySelector('.fm-place-fx__emoji')).toBeNull();
    expect(container.querySelector('.fm-place-fx__sparkles')).toBeNull();
    expect(container.querySelector('.fm-place-fx__spot--hold')).not.toBeNull();
  });

  test('retour : l’emoji atterrit à l’ancre de son étiquette', () => {
    const { container } = render(
      <PctPlaceFocusFx
        fx={fxOf({ phase: 'out', place: zone, fromScale: 3, toScale: 1 })}
        fitWidth={1000}
        fitHeight={500}
        emojiOf={() => '🌳'}
        anchorOf={() => ({ xp: 12, yp: 14 })}
      />,
    );
    const emoji = container.querySelector('.fm-place-fx__emoji--out');
    expect(emoji.textContent).toBe('🌳');
    expect(emoji.style.left).toBe('12%');
    expect(emoji.style.getPropertyValue('--fx-k1')).toBe('1');
  });

  test('sans état : rien', () => {
    const { container } = render(<PctPlaceFocusFx fx={null} fitWidth={100} fitHeight={100} />);
    expect(container.innerHTML).toBe('');
  });
});
