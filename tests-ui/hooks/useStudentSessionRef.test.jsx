import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useStudentSessionRef } from '../../src/hooks/useStudentSessionRef';

describe('useStudentSessionRef', () => {
  it('initialise la référence avec la session élève initiale', () => {
    const initial = { id: 1, pseudo: 'Léa' };
    const { result } = renderHook(() => useStudentSessionRef(initial, initial));
    expect(result.current.current).toBe(initial);
  });

  it('reflète la nouvelle valeur de `student` après un re-render', () => {
    const first = { id: 1 };
    const second = { id: 2 };
    const { result, rerender } = renderHook(
      ({ student }) => useStudentSessionRef(first, student),
      { initialProps: { student: first } },
    );
    expect(result.current.current).toBe(first);
    rerender({ student: second });
    expect(result.current.current).toBe(second);
  });

  it('accepte une session nulle (élève déconnecté)', () => {
    const { result, rerender } = renderHook(
      ({ student }) => useStudentSessionRef(null, student),
      { initialProps: { student: { id: 1 } } },
    );
    rerender({ student: null });
    expect(result.current.current).toBeNull();
  });

  it('conserve une référence stable entre les rendus', () => {
    const { result, rerender } = renderHook(
      ({ student }) => useStudentSessionRef(null, student),
      { initialProps: { student: { id: 1 } } },
    );
    const refObject = result.current;
    rerender({ student: { id: 2 } });
    expect(result.current).toBe(refObject);
  });
});
