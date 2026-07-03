import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useTransientMessage } from '../../src/components/mascot/useTransientMessage.js';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useTransientMessage', () => {
  it('affiche le message puis l’efface après le délai par défaut', () => {
    const { result } = renderHook(() => useTransientMessage(2000));
    expect(result.current[0]).toBe('');

    act(() => result.current[1]('Enregistré.'));
    expect(result.current[0]).toBe('Enregistré.');

    act(() => vi.advanceTimersByTime(1999));
    expect(result.current[0]).toBe('Enregistré.');
    act(() => vi.advanceTimersByTime(1));
    expect(result.current[0]).toBe('');
  });

  it('accepte un délai ponctuel différent du défaut', () => {
    const { result } = renderHook(() => useTransientMessage(2000));
    act(() => result.current[1]('Copié.', 500));
    act(() => vi.advanceTimersByTime(500));
    expect(result.current[0]).toBe('');
  });

  it('annule le timer précédent entre deux déclenchements (le dernier message gagne)', () => {
    const { result } = renderHook(() => useTransientMessage(1000));
    act(() => result.current[1]('Premier'));
    act(() => vi.advanceTimersByTime(900));
    act(() => result.current[1]('Second'));
    // Le timer du premier message (échéance t=1000) ne doit pas effacer « Second ».
    act(() => vi.advanceTimersByTime(100));
    expect(result.current[0]).toBe('Second');
    act(() => vi.advanceTimersByTime(900));
    expect(result.current[0]).toBe('');
  });

  it('show("") efface immédiatement sans réarmer de timer', () => {
    const { result } = renderHook(() => useTransientMessage(1000));
    act(() => result.current[1]('Message'));
    act(() => result.current[1](''));
    expect(result.current[0]).toBe('');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clear() efface le message et le timer', () => {
    const { result } = renderHook(() => useTransientMessage(1000));
    act(() => result.current[1]('Message'));
    act(() => result.current[2]());
    expect(result.current[0]).toBe('');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('nettoie le timer au démontage (pas de setState orphelin)', () => {
    const { result, unmount } = renderHook(() => useTransientMessage(1000));
    act(() => result.current[1]('Message'));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    // Aucun warning React « setState on unmounted component » attendu.
    act(() => vi.runAllTimers());
  });

  it('show garde une identité stable entre rendus', () => {
    const { result, rerender } = renderHook(() => useTransientMessage(1000));
    const firstShow = result.current[1];
    rerender();
    expect(result.current[1]).toBe(firstShow);
  });
});
