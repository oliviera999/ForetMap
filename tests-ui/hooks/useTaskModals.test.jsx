import { describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useTaskModals } from '../../src/hooks/useTaskModals.js';

describe('useTaskModals', () => {
  it('expose les 9 états de modale fermés par défaut', () => {
    const { result } = renderHook(() => useTaskModals());
    expect(result.current.showForm).toBe(false);
    expect(result.current.showProjectForm).toBe(false);
    expect(result.current.editProject).toBeNull();
    expect(result.current.showProposalForm).toBe(false);
    expect(result.current.editTask).toBeNull();
    expect(result.current.duplicateTask).toBeNull();
    expect(result.current.logTask).toBeNull();
    expect(result.current.logsTask).toBeNull();
    expect(result.current.confirmTask).toBeNull();
  });

  it('signale l’ouverture puis la fermeture de l’overlay au parent', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useTaskModals(onChange));
    expect(onChange).toHaveBeenLastCalledWith(false);
    act(() => result.current.setShowForm(true));
    expect(onChange).toHaveBeenLastCalledWith(true);
    act(() => result.current.setShowForm(false));
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it.each([
    ['setEditTask', { id: 1 }],
    ['setDuplicateTask', { id: 2 }],
    ['setShowProposalForm', true],
    ['setShowProjectForm', true],
    ['setConfirmTask', { task: { id: 3 }, label: '?', action: async () => {} }],
    ['setLogTask', { id: 4 }],
    ['setLogsTask', { id: 5 }],
  ])('%s ouvre l’overlay du point de vue du parent', (setter, value) => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useTaskModals(onChange));
    act(() => result.current[setter](value));
    expect(onChange).toHaveBeenLastCalledWith(true);
  });

  it('editProject seul n’ouvre pas l’overlay (iso-comportement)', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useTaskModals(onChange));
    onChange.mockClear();
    act(() => result.current.setEditProject({ id: 9 }));
    // Même valeur `open === false` : l'effet renvoie false, jamais true.
    expect(onChange.mock.calls.every(([open]) => open === false)).toBe(true);
  });

  it('remet l’overlay à false au démontage', () => {
    const onChange = vi.fn();
    const { result, unmount } = renderHook(() => useTaskModals(onChange));
    act(() => result.current.setShowForm(true));
    onChange.mockClear();
    unmount();
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('sans callback parent, aucune erreur à l’ouverture ni au démontage', () => {
    const { result, unmount } = renderHook(() => useTaskModals(null));
    act(() => result.current.setShowForm(true));
    expect(result.current.showForm).toBe(true);
    expect(() => unmount()).not.toThrow();
  });
});
