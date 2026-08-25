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
