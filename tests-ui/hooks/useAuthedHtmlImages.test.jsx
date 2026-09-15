import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAuthedHtmlImages } from '../../src/hooks/useAuthedHtmlImages.js';

describe('useAuthedHtmlImages', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, init) => {
        expect(String(url)).toContain('/api/user-journal/assets/9/file');
        expect(init.headers.get('Authorization')).toMatch(/^Bearer /);
        return {
          ok: true,
          blob: async () => new Blob(['x'], { type: 'image/png' }),
        };
      }),
    );
    URL.createObjectURL = vi.fn(() => 'blob:journal-img');
    localStorage.setItem(
      'foretmap_session',
      JSON.stringify({ token: 'test-token', user: { id: '1' } }),
    );
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  test('réécrit une image de carnet en blob authentifié', async () => {
    const html = '<p>x</p><img src="/api/user-journal/assets/9/file" alt="">';
    const { result } = renderHook(() => useAuthedHtmlImages(html));
    await waitFor(() => {
      expect(result.current).toContain('blob:journal-img');
    });
    expect(fetch).toHaveBeenCalled();
  });

  test('laisse intact un HTML sans image protégée', () => {
    const html = '<p>sans image</p>';
    const { result } = renderHook(() => useAuthedHtmlImages(html));
    expect(result.current).toBe(html);
    expect(fetch).not.toHaveBeenCalled();
  });
});
