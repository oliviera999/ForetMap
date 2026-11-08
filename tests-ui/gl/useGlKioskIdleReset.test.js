import { renderHook, act } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { useGlKioskIdleReset } from '../../src/gl/hooks/useGlKioskIdleReset.js';

describe('useGlKioskIdleReset', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test('appelle onIdle une fois après le délai sans geste', () => {
    const onIdle = vi.fn();
    renderHook(() => useGlKioskIdleReset({ enabled: true, idleMs: 1000, onIdle }));
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(onIdle).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onIdle).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  test('un geste relance le compte à rebours', () => {
    const onIdle = vi.fn();
    renderHook(() => useGlKioskIdleReset({ enabled: true, idleMs: 1000, onIdle }));
    act(() => {
      vi.advanceTimersByTime(800);
      window.dispatchEvent(new Event('pointerdown'));
      vi.advanceTimersByTime(800);
    });
    expect(onIdle).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  test('désactivé : rien ne se passe, et le démontage nettoie', () => {
    const onIdle = vi.fn();
    const { unmount, rerender } = renderHook(
      ({ enabled }) => useGlKioskIdleReset({ enabled, idleMs: 500, onIdle }),
      { initialProps: { enabled: false } },
    );
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onIdle).not.toHaveBeenCalled();
    rerender({ enabled: true });
    unmount();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onIdle).not.toHaveBeenCalled();
  });
});
