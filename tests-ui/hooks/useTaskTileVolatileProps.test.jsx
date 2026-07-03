import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useTaskTileVolatileProps } from '../../src/hooks/useTaskTileVolatileProps.js';

const BASE = {
  loading: {},
  quickAssignTaskId: null,
  quickAssignStudentIds: [],
  draggingTaskId: null,
};

function setup(initialProps = BASE) {
  return renderHook((props) => useTaskTileVolatileProps(props), { initialProps });
}

describe('useTaskTileVolatileProps', () => {
  it('retourne la même référence par tuile tant que rien ne change (React.memo reste vrai)', () => {
    const { result, rerender } = setup();
    const first = result.current({ id: 42 });
    rerender({ ...BASE, loading: { '42assign': false } }); // false ≡ absent pour le rendu
    const second = result.current({ id: 42 });
    expect(second).toBe(first);
  });

  it('un changement de loading[42…] n’invalide que la tuile 42', () => {
    const { result, rerender } = setup();
    const t7Before = result.current({ id: 7 });
    const t42Before = result.current({ id: 42 });
    rerender({ ...BASE, loading: { '42assign': true } });
    expect(result.current({ id: 7 })).toBe(t7Before);
    const t42After = result.current({ id: 42 });
    expect(t42After).not.toBe(t42Before);
    expect(t42After.loading['42assign']).toBe(true);
    // Retour à false : la tuile 42 est invalidée à nouveau (le bouton se réactive).
    rerender({ ...BASE, loading: { '42assign': false } });
    expect(result.current({ id: 42 })).not.toBe(t42After);
    expect(result.current({ id: 42 }).loading['42assign']).toBeUndefined();
  });

  it('ne confond pas la tâche 4 avec les clés de la tâche 42 (préfixe numérique)', () => {
    const { result, rerender } = setup();
    const t4Before = result.current({ id: 4 });
    rerender({ ...BASE, loading: { '42statusdone': true } });
    expect(result.current({ id: 4 })).toBe(t4Before);
    expect(result.current({ id: 4 }).loading).toEqual({});
    expect(result.current({ id: 42 }).loading['42statusdone']).toBe(true);
  });

  it('capte les clés composées (statut, affectation groupe, part collective)', () => {
    const loading = {
      '42statusdone': true,
      '42assign-group': true,
      '42_teacher_collective_done_9': true,
      '42dnd:p1:end': true,
    };
    const { result } = setup({ ...BASE, loading });
    expect(result.current({ id: 42 }).loading).toEqual(loading);
  });

  it('ne transmet la sélection d’affectation rapide qu’à la tuile ouverte', () => {
    const ids = ['1', '2'];
    const { result, rerender } = setup({
      ...BASE,
      quickAssignTaskId: 42,
      quickAssignStudentIds: ids,
    });
    const open = result.current({ id: 42 });
    expect(open.quickAssignTaskId).toBe(42);
    expect(open.quickAssignStudentIds).toBe(ids);
    const closed = result.current({ id: 7 });
    expect(closed.quickAssignTaskId).toBeNull();
    expect(closed.quickAssignStudentIds).toEqual([]);
    // Une coche de plus : seule la tuile ouverte reçoit de nouvelles références.
    rerender({ ...BASE, quickAssignTaskId: 42, quickAssignStudentIds: ['1', '2', '3'] });
    expect(result.current({ id: 7 })).toBe(closed);
    expect(result.current({ id: 42 })).not.toBe(open);
  });

  it('ne transmet draggingTaskId qu’à la tuile glissée', () => {
    const { result } = setup({ ...BASE, draggingTaskId: '42' });
    expect(result.current({ id: 42 }).draggingTaskId).toBe('42');
    expect(result.current({ id: 7 }).draggingTaskId).toBeNull();
  });
});
