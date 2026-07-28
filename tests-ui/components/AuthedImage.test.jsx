import React from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('../../src/services/api.js', () => ({
  withAppBase: (path) => path,
  getAuthToken: () => 'test-token',
}));

import { AuthedImage } from '../../src/components/AuthedImage.jsx';
import { isPassthroughImageUrl } from '../../src/hooks/useAuthedImageSrc.js';

describe('isPassthroughImageUrl', () => {
  test('laisse passer uploads publics, data et http', () => {
    expect(isPassthroughImageUrl('/uploads/tasks/1.jpg')).toBe(true);
    expect(isPassthroughImageUrl('https://cdn.example/p.jpg')).toBe(true);
    expect(isPassthroughImageUrl('data:image/png;base64,xx')).toBe(true);
  });

  test('ne laisse pas passer les routes API protégées', () => {
    expect(isPassthroughImageUrl('/api/tasks/1/logs/2/image')).toBe(false);
    expect(isPassthroughImageUrl('/api/observations/9/image')).toBe(false);
  });
});

describe('AuthedImage', () => {
  beforeEach(() => {
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-authed');
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('affiche une URL publique sans fetch', () => {
    render(<AuthedImage path="https://cdn.example/p.jpg" alt="photo" />);
    expect(screen.getByAltText('photo').getAttribute('src')).toBe('https://cdn.example/p.jpg');
  });

  test('charge une route API avec Authorization Bearer', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob(['img'], { type: 'image/jpeg' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(<AuthedImage path="/api/tasks/7/logs/99/image" alt="rapport" />);

    await waitFor(() => {
      expect(screen.getByAltText('rapport').getAttribute('src')).toBe('blob:mock-authed');
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/tasks/7/logs/99/image');
    expect(opts.headers.get('Authorization')).toBe('Bearer test-token');
  });

  test('reste silencieux si la route API refuse (403)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 403,
        blob: async () => new Blob([]),
      })),
    );

    const { container } = render(<AuthedImage path="/api/tasks/7/logs/99/image" alt="rapport" />);
    await waitFor(() => {
      expect(container.querySelector('img')).toBeNull();
    });
  });
});
