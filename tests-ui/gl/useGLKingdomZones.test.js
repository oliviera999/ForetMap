import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useGLKingdomZones } from '../../src/gl/hooks/useGLKingdomZones.js';

const AUDIO_A = '/uploads/media-library/audio/a.mp3';
const AUDIO_B = '/uploads/media-library/audio/b.mp3';

const apiGlMock = vi.fn();

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: (...args) => apiGlMock(...args),
}));

describe('useGLKingdomZones', () => {
  beforeEach(() => {
    apiGlMock.mockReset();
  });

  test('charge les zones pour un chapitre', async () => {
    apiGlMock.mockResolvedValue({
      zones: [{ id: 3, label: 'Nord', points: [{ x: 1, y: 2 }] }],
    });

    const { result } = renderHook(() => useGLKingdomZones(7));

    await waitFor(() => {
      expect(result.current.zones).toHaveLength(1);
    });
    expect(result.current.zones[0].label).toBe('Nord');
    expect(apiGlMock).toHaveBeenCalledWith('/api/gl/kingdom-map/zones?chapterId=7');
  });

  test('updateZone transmet la playlist musicUrls (pluriel) à l’API', async () => {
    apiGlMock.mockResolvedValue({ zones: [] });
    const { result } = renderHook(() => useGLKingdomZones(7, { zoneMusicEnabled: true }));
    await waitFor(() => expect(apiGlMock).toHaveBeenCalled());
    apiGlMock.mockClear();
    apiGlMock.mockResolvedValue({ zones: [] });

    await act(async () => {
      await result.current.updateZone(42, { musicUrls: [AUDIO_A, AUDIO_B], musicVolume: 0.4 });
    });

    expect(apiGlMock).toHaveBeenCalledWith(
      '/api/gl/kingdom-map/zones/42',
      'PUT',
      expect.objectContaining({ musicUrls: [AUDIO_A, AUDIO_B], musicVolume: 0.4 }),
    );
  });

  test('updateZone transmet une playlist vide (retrait de la musique)', async () => {
    apiGlMock.mockResolvedValue({ zones: [] });
    const { result } = renderHook(() => useGLKingdomZones(7, { zoneMusicEnabled: true }));
    await waitFor(() => expect(apiGlMock).toHaveBeenCalled());
    apiGlMock.mockClear();
    apiGlMock.mockResolvedValue({ zones: [] });

    await act(async () => {
      await result.current.updateZone(42, { musicUrls: [] });
    });

    expect(apiGlMock).toHaveBeenCalledWith(
      '/api/gl/kingdom-map/zones/42',
      'PUT',
      expect.objectContaining({ musicUrls: [] }),
    );
  });

  test('createZone transmet musicUrls (pluriel) — duplication d’une zone avec musique', async () => {
    apiGlMock.mockResolvedValue({ zones: [] });
    const { result } = renderHook(() => useGLKingdomZones(7, { zoneMusicEnabled: true }));
    await waitFor(() => expect(apiGlMock).toHaveBeenCalled());
    apiGlMock.mockClear();
    apiGlMock.mockResolvedValue({ zones: [] });

    await act(async () => {
      await result.current.createZone({
        label: 'Clairière (copie)',
        color: '#ff0000',
        points: [
          { x: 1, y: 1 },
          { x: 2, y: 2 },
          { x: 3, y: 3 },
        ],
        musicUrls: [AUDIO_A],
        musicVolume: 0.5,
      });
    });

    expect(apiGlMock).toHaveBeenCalledWith(
      '/api/gl/kingdom-map/zones',
      'POST',
      expect.objectContaining({ musicUrls: [AUDIO_A], musicVolume: 0.5 }),
    );
  });
});
