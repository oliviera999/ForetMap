import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthedImage } from '../../src/components/AuthedImage.jsx';

describe('AuthedImage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url, init) => {
        expect(String(url)).toContain('/api/observations/1/image');
        expect(init.headers.get('Authorization')).toMatch(/^Bearer /);
        return {
          ok: true,
          blob: async () => new Blob(['x'], { type: 'image/jpeg' }),
        };
      }),
    );
    URL.createObjectURL = vi.fn(() => 'blob:authed-img');
    localStorage.setItem(
      'foretmap_session',
      JSON.stringify({ token: 'test-token', user: { id: '1' } }),
    );
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  test('charge l’image avec le jeton Bearer puis affiche un blob URL', async () => {
    render(<AuthedImage src="/api/observations/1/image" alt="photo protégée" />);
    const img = await screen.findByAltText('photo protégée');
    expect(img.getAttribute('src')).toBe('blob:authed-img');
    expect(fetch).toHaveBeenCalled();
  });
});
