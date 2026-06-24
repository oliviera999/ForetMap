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
      useGLBrandTheme({ colors: { primary: '#013a40' } }, { colors: { primary: '#112233' } }),
    );
    expect(result.current.brand.colors.primary).toBe('#112233');
    expect(result.current.brand.fonts.heading).toBeTruthy();
  });

  it('remplace le favicon quand brand.faviconUrl est renseigné', () => {
    document.head.innerHTML = '';
    const { unmount } = renderHook(() =>
      useGLBrandTheme({ faviconUrl: '/uploads/gl_brand/favicon.png' }, null),
    );
    const link = document.getElementById('gl-brand-favicon');
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toContain('/uploads/gl_brand/favicon.png');
    expect(link.getAttribute('type')).toBe('image/png');
    unmount();
  });
});
