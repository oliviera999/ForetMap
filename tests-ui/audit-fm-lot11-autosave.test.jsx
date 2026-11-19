import { describe, test, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebouncedAutoSave } from '../src/shared/hooks/useDebouncedAutoSave.js';

/**
 * Audit ForetMap du 19/11/2026, lot 11 — F5 : la sauvegarde « de démontage » ne doit partir
 * qu'au vrai démontage, pas quand `enabled` passe à faux. Scénario de l'audit : effacer le
 * titre d'une tâche en édition (`TaskFormModal`, `enabled` = titre non vide) envoyait
 * aussitôt un PUT au titre vide.
 */
const flushMicrotasks = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

function renderAutoSave(initial, onSave) {
  return renderHook(
    ({ value, enabled }) =>
      useDebouncedAutoSave({
        value,
        enabled,
        debounceMs: 20,
        onSave,
      }),
    { initialProps: initial },
  );
}

describe('useDebouncedAutoSave — F5 (sauvegarde de démontage)', () => {
  test('effacer le titre (enabled → false) n’envoie aucune sauvegarde', async () => {
    vi.useFakeTimers();
    try {
      const onSave = vi.fn(async () => {});
      const { rerender, unmount } = renderAutoSave(
        { value: { title: 'Arroser' }, enabled: true },
        onSave,
      );
      // Titre effacé : la valeur change et `enabled` tombe à faux dans le même rendu.
      rerender({ value: { title: '' }, enabled: false });
      await flushMicrotasks();
      await act(async () => {
        vi.advanceTimersByTime(100);
      });
      await flushMicrotasks();
      expect(onSave).not.toHaveBeenCalled();
      // Démontage alors que la sauvegarde est désactivée : toujours rien.
      unmount();
      await flushMicrotasks();
      expect(onSave).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  test('un titre en cours de frappe n’est pas sauvé au passage enabled → false puis true', async () => {
    vi.useFakeTimers();
    try {
      const onSave = vi.fn(async () => {});
      const { rerender, unmount } = renderAutoSave(
        { value: { title: 'Arroser' }, enabled: true },
        onSave,
      );
      rerender({ value: { title: 'Arroser les' }, enabled: true });
      rerender({ value: { title: '' }, enabled: false });
      await flushMicrotasks();
      expect(onSave).not.toHaveBeenCalled();
      rerender({ value: { title: 'Pailler' }, enabled: true });
      await act(async () => {
        vi.advanceTimersByTime(100);
      });
      await flushMicrotasks();
      // Une seule sauvegarde, après le debounce, avec la valeur valide.
      expect(onSave).toHaveBeenCalledTimes(1);
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  test('le vrai démontage sauvegarde encore une modification en attente', async () => {
    vi.useFakeTimers();
    try {
      const onSave = vi.fn(async () => {});
      const { rerender, unmount } = renderAutoSave(
        { value: { title: 'Arroser' }, enabled: true },
        onSave,
      );
      rerender({ value: { title: 'Arroser le potager' }, enabled: true });
      unmount();
      await flushMicrotasks();
      expect(onSave).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
