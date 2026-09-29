import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAuthedHtmlImages } from '../../src/hooks/useAuthedHtmlImages.js';
import { renderMarkdownToSafeHtml } from '../../src/shared/platform/markdown.js';
import {
  authedImageCacheSizeForTests,
  resetAuthedImageCacheForTests,
} from '../../src/services/authedImageCache.js';

describe('useAuthedHtmlImages', () => {
  beforeEach(() => {
    resetAuthedImageCacheForTests();
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
    URL.revokeObjectURL = vi.fn();
    localStorage.setItem(
      'foretmap_session',
      JSON.stringify({ token: 'test-token', user: { id: '1' } }),
    );
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    resetAuthedImageCacheForTests();
  });

  test('réécrit une image de carnet en blob authentifié', async () => {
    const html = '<p>x</p><img src="/api/user-journal/assets/9/file" alt="">';
    const { result } = renderHook(() => useAuthedHtmlImages(html));
    await waitFor(() => {
      expect(result.current).toContain('blob:journal-img');
    });
    expect(fetch).toHaveBeenCalled();
  });

  test('enchaînement réel : Markdown du carnet → HTML filtré → blob authentifié', async () => {
    const html = renderMarkdownToSafeHtml(
      'Texte\n\n![Mon schéma](/api/user-journal/assets/9/file)',
      { allowImages: true },
    );
    expect(html).toContain('/api/user-journal/assets/9/file');
    const { result } = renderHook(() => useAuthedHtmlImages(html));
    await waitFor(() => {
      expect(result.current).toContain('blob:journal-img');
    });
  });

  test('re-rendu avec le même HTML : pas de second téléchargement ; blob libéré au démontage', async () => {
    const html = '<img src="/api/user-journal/assets/9/file" alt="">';
    const { result, rerender, unmount } = renderHook(({ h }) => useAuthedHtmlImages(h), {
      initialProps: { h: html },
    });
    await waitFor(() => expect(result.current).toContain('blob:journal-img'));
    rerender({ h: `${html}<p>frappe</p>` });
    await waitFor(() => expect(result.current).toContain('frappe'));
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      unmount();
      expect(authedImageCacheSizeForTests()).toBe(1);
      vi.advanceTimersByTime(30_000);
      expect(authedImageCacheSizeForTests()).toBe(0);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:journal-img');
    } finally {
      vi.useRealTimers();
    }
  });

  test('laisse intact un HTML sans image protégée', () => {
    const html = '<p>sans image</p>';
    const { result } = renderHook(() => useAuthedHtmlImages(html));
    expect(result.current).toBe(html);
    expect(fetch).not.toHaveBeenCalled();
  });
});
