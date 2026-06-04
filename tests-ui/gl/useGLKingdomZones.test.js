import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useGLKingdomZones } from '../../src/gl/hooks/useGLKingdomZones.js';

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
});
