// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const apiMock = vi.fn();
vi.mock('../../src/services/api', () => ({
  api: (...args) => apiMock(...args),
  getAuthToken: () => '',
  AccountDeletedError: class AccountDeletedError extends Error {},
}));

const pedago = { current: null };
vi.mock('../../src/contexts/BiodivPedagoContext.jsx', () => ({
  useBiodivPedago: () => pedago.current,
}));

import { useFoodWebProfile } from '../../src/hooks/useFoodWebProfile.js';

/** Profil collège simulé (le socle rend encore le comportement actuel tant que C1 n'a pas fusionné). */
function collegeContext({ cycle4 = false } = {}) {
  const hidden = new Set(['foodweb_full_by_default', 'foodweb_offmap_species']);
  return {
    canShow: (key) => !hidden.has(key),
    foodWebTypes: (all) =>
      all.filter((t) =>
        [
          'herbivorie',
          'predation',
          'frugivorie',
          'granivorie',
          ...(cycle4 ? ['symbiose', 'competition'] : []),
        ].includes(t),
      ),
  };
}

const lyceeContext = { canShow: () => true, foodWebTypes: (all) => all };

beforeEach(() => {
  apiMock.mockReset();
});

describe('useFoodWebProfile', () => {
  it('6e (cycle 3) : mode collège, sans symbiose, libellés en verbe', () => {
    pedago.current = collegeContext();
    const { result } = renderHook(() => useFoodWebProfile());
    expect(result.current.collegeMode).toBe(true);
    expect(result.current).not.toHaveProperty('hideOffMap');
    expect(result.current.allowedTypes).not.toContain('symbiose');
    expect(result.current.typeLabel('frugivorie')).toBe('mange des fruits (frugivorie)');
  });
  it('3e (cycle 4) : symbiose et compétition en plus', () => {
    pedago.current = collegeContext({ cycle4: true });
    const { result } = renderHook(() => useFoodWebProfile());
    expect(result.current.allowedTypes).toEqual(
      expect.arrayContaining(['symbiose', 'competition']),
    );
    expect(result.current.typeLabel('competition')).toBe('est en concurrence avec (compétition)');
  });
  it('lycée : réseau complet, libellés savants', () => {
    pedago.current = lyceeContext;
    const { result } = renderHook(() => useFoodWebProfile());
    expect(result.current.collegeMode).toBe(false);
    expect(result.current.typeLabel('frugivorie')).toBe('Frugivorie');
    expect(result.current.focusDepths).toEqual([0, 1, 2]);
  });
});
