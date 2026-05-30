import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useGLBrandTheme } from '../../src/gl/hooks/useGLBrandTheme.js';

describe('useGLBrandTheme', () => {
  it('ne plante pas sans brand serveur (guest / chargement config)', () => {
    const { result } = renderHook(() => useGLBrandTheme(undefined, null));
    expect(result.current.brand.fonts.body).toBeTruthy();
    expect(result.current.brand.slots.hero).toBeTruthy();
    expect(result.current.style['--gl-font-body']).toBeTruthy();
  });

  it('fusionne les couleurs chapitre sur la charte normalisée', () => {
    const { result } = renderHook(() =>
      useGLBrandTheme({ colors: { primary: '#013a40' } }, { colors: { primary: '#112233' } })
    );
    expect(result.current.brand.colors.primary).toBe('#112233');
    expect(result.current.brand.fonts.heading).toBeTruthy();
  });
});
