import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const apiGLMock = vi.fn();
vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGLMock(...args),
}));

import { useGlNarrator, invalidateGlNarratorCache } from '../../src/gl/hooks/useGlNarrator.js';

const NARRATOR = {
  enabled: true,
  speakerName: 'OLU',
  fallbackSilhouette: 'olu',
  portraits: { neutre: { bust: '/uploads/media-library/image/olu-neutre.webp' } },
};

describe('useGlNarrator', () => {
  beforeEach(() => {
    apiGLMock.mockReset();
    invalidateGlNarratorCache();
  });

  test('lit le réglage partagé sous /api/gl/* — jamais /api/settings/*', async () => {
    apiGLMock.mockResolvedValue(NARRATOR);
    const { result } = renderHook(() => useGlNarrator());

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(apiGLMock).toHaveBeenCalledWith('/api/gl/content/narrator');
    expect(result.current.narrator.portraits.neutre.bust).toBe(
      '/uploads/media-library/image/olu-neutre.webp',
    );
    expect(result.current.speakerName).toBe('OLU');
  });

  test('un seul appel réseau pour plusieurs consommateurs (cache de module)', async () => {
    apiGLMock.mockResolvedValue(NARRATOR);
    const first = renderHook(() => useGlNarrator());
    await waitFor(() => expect(first.result.current.ready).toBe(true));
    const second = renderHook(() => useGlNarrator());
    await waitFor(() => expect(second.result.current.ready).toBe(true));
    expect(apiGLMock).toHaveBeenCalledTimes(1);
  });

  test('réseau en échec : repli silencieux, jamais d’écran vide', async () => {
    apiGLMock.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useGlNarrator());

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.narrator.fallbackSilhouette).toBe('olu');
    expect(result.current.speakerName).toBe('OLU');
  });

  test('narrateur éteint : plus d’étiquette de locuteur', async () => {
    apiGLMock.mockResolvedValue({ ...NARRATOR, enabled: false });
    const { result } = renderHook(() => useGlNarrator());

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.speakerName).toBe('');
  });
});
