// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

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
  const hidden = new Set(['foodweb_full_by_default']);
  return {
    canShow: (key) => !hidden.has(key),
    visibility: (key) => (key === 'foodweb_default_preset' ? 'all' : 'show'),
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

const lyceeContext = {
  canShow: (key) => key !== 'foodweb_go_further',
  visibility: (key) => (key === 'foodweb_default_preset' ? 'alimentaire' : 'show'),
  foodWebTypes: (all) => all,
};

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

describe('useFoodWebProfile — chantier du 22/11/2026', () => {
  it('collège : cadrage « Tout », « Pour aller plus loin » proposé', () => {
    pedago.current = collegeContext();
    const { result } = renderHook(() => useFoodWebProfile());
    expect(result.current.defaultPreset).toBe('all');
    expect(result.current.canGoFurther).toBe(true);
    expect(result.current.goFurther).toBe(false);
  });
  it('« plus loin » activé : réseau complet, tous types, verbes gardés', () => {
    pedago.current = collegeContext();
    const { result } = renderHook(() => useFoodWebProfile({ goFurther: true }));
    expect(result.current.collegeMode).toBe(false);
    expect(result.current.allowedTypes).toBeNull();
    expect(result.current.goFurther).toBe(true);
    expect(result.current.palierTypes).not.toContain('symbiose');
    expect(result.current.typeLabel('frugivorie')).toBe('mange des fruits (frugivorie)');
  });
  it('lycée : « Réseau alimentaire », pas de bouton, `goFurther` sans effet', () => {
    pedago.current = lyceeContext;
    const { result } = renderHook(() => useFoodWebProfile({ goFurther: true }));
    expect(result.current.defaultPreset).toBe('alimentaire');
    expect(result.current.canGoFurther).toBe(false);
    expect(result.current.goFurther).toBe(false);
  });
  it('contexte sans `visibility` exploitable : repli « Réseau alimentaire »', () => {
    pedago.current = { canShow: () => true, visibility: () => 'show', foodWebTypes: (a) => a };
    const { result } = renderHook(() => useFoodWebProfile());
    expect(result.current.defaultPreset).toBe('alimentaire');
  });
});
