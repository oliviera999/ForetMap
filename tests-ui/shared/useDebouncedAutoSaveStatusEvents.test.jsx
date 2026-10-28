import { describe, test, expect } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useDebouncedAutoSave } from '../../src/shared/hooks/useDebouncedAutoSave.js';
import { subscribeAppStatus } from '../../src/shared/appStatusEvents.js';

/** Le hook relaie son état vers la pastille sticky globale via le bus appStatusEvents. */
describe('useDebouncedAutoSave — événements de statut globaux', () => {
  test('publie saving puis saved (avec le même id) autour d’une sauvegarde', async () => {
    const events = [];
    const unsubscribe = subscribeAppStatus((detail) => events.push(detail));
    try {
      const { result, rerender } = renderHook(
        ({ value }) =>
          useDebouncedAutoSave({
            value,
            debounceMs: 10,
            onSave: async () => {},
          }),
        { initialProps: { value: { a: 1 } } },
      );
      rerender({ value: { a: 2 } });
      await act(async () => {
        await result.current.flush();
      });
      const kinds = events.map((e) => e.kind);
      expect(kinds).toContain('saving');
      expect(kinds).toContain('saved');
      const saving = events.find((e) => e.kind === 'saving');
      const saved = events.find((e) => e.kind === 'saved');
      expect(saving.id).toBe(saved.id);
      expect(saving.message).toBe('Enregistrement…');
      expect(saved.message).toBe('Enregistré ✓');
    } finally {
      unsubscribe();
    }
  });

  test('publie error avec le message d’échec, puis clear au démontage', async () => {
    const events = [];
    const unsubscribe = subscribeAppStatus((detail) => events.push(detail));
    try {
      const { result, rerender, unmount } = renderHook(
        ({ value }) =>
          useDebouncedAutoSave({
            value,
            debounceMs: 10,
            onSave: async () => {
              throw new Error('Échec réseau');
            },
          }),
        { initialProps: { value: { a: 1 } } },
      );
      rerender({ value: { a: 2 } });
      await act(async () => {
        await result.current.flush();
      });
      await waitFor(() => {
        expect(events.some((e) => e.kind === 'error' && e.message === 'Échec réseau')).toBe(true);
      });
      const errorEvent = events.find((e) => e.kind === 'error');
      unmount();
      const clears = events.filter((e) => e.kind === 'clear' && e.id === errorEvent.id);
      expect(clears.length).toBeGreaterThan(0);
    } finally {
      unsubscribe();
    }
  });
});

describe('useDebouncedAutoSave — enregistrement sauté pendant un envoi', () => {
  test('relance la valeur posée pendant qu’un enregistrement était en cours', async () => {
    const saved = [];
    const valueRef = { current: 'a' };
    let release = () => {};
    const { result, rerender } = renderHook(
      ({ value }) => {
        valueRef.current = value;
        return useDebouncedAutoSave({
          value,
          debounceMs: 60_000,
          onSave: () => {
            const seen = valueRef.current;
            saved.push(seen);
            return new Promise((resolve) => {
              release = () => resolve(seen);
            });
          },
        });
      },
      { initialProps: { value: 'a' } },
    );

    rerender({ value: 'b' });
    let firstDone;
    await act(async () => {
      firstDone = result.current.flush();
      await Promise.resolve();
    });
    expect(saved).toEqual(['b']);

    rerender({ value: 'c' });
    await act(async () => {
      await result.current.flush();
    });
    expect(saved).toEqual(['b']);

    await act(async () => {
      release();
      await firstDone;
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(saved).toEqual(['b', 'c']);
    await act(async () => {
      release();
    });
  });

  test('ne relance pas en boucle quand l’enregistrement échoue', async () => {
    const calls = [];
    let release = () => {};
    const { result, rerender } = renderHook(
      ({ value }) =>
        useDebouncedAutoSave({
          value,
          debounceMs: 60_000,
          onSave: () => {
            calls.push(value);
            return new Promise((_resolve, reject) => {
              release = () => reject(new Error('réseau'));
            });
          },
        }),
      { initialProps: { value: 1 } },
    );
    rerender({ value: 2 });
    let firstDone;
    await act(async () => {
      firstDone = result.current.flush();
      await Promise.resolve();
    });
    rerender({ value: 3 });
    await act(async () => {
      await result.current.flush();
    });
    await act(async () => {
      release();
      await firstDone.catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(calls).toEqual([2]);
    expect(result.current.status).toBe('error');
  });
});
