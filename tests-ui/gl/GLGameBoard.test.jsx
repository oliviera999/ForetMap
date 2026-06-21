import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { GLGameBoard } from '../../src/gl/components/GLGameBoard.jsx';

const plateauBoardImgMock = vi.fn(() => '/uploads/media-library/image/2026/06/plateau-2.jpg');

vi.mock('../../src/gl/assets/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    plateauBoardImg: (...args) => plateauBoardImgMock(...args),
    loadGlAssetRuntime: vi.fn(() => Promise.resolve({ keys: {}, images: {}, audio: {} })),
  };
});

const markerArrivalEnabledRef = { value: null };

vi.mock('../../src/gl/hooks/useGLMarkerArrival.js', () => ({
  useGLMarkerArrival: (options) => {
    markerArrivalEnabledRef.value = options.enabled;
    return {
      popover: null,
      effectPopover: null,
      closePopover: vi.fn(),
      closeEffectPopover: vi.fn(),
      reshuffle: vi.fn(),
      setResult: vi.fn(),
      schedulePresentOnArrival: vi.fn(),
    };
  },
}));

vi.mock('../../src/gl/hooks/useGLBoardMascotMotion.js', () => ({
  useGLBoardMascotMotion: () => ({
    getPositionForTeam: () => ({ xp: 50, yp: 50 }),
    getMotionForTeam: () => ({}),
    moveTeamTo: vi.fn(),
  }),
}));

vi.mock('../../src/gl/hooks/useGlPctMapGestures.js', () => ({
  useGlPctMapGestures: () => ({}),
}));

vi.mock('../../src/gl/hooks/usePrefersReducedMotion.js', () => ({
  usePrefersReducedMotion: () => false,
}));

const baseProps = {
  chapter: { map_image_url: '/maps/map-foret.svg' },
  markers: [],
  teams: [{ id: 1, name: 'Eq', type: 'gnome', color: '#65a30d' }],
  gameId: 10,
  watchTeamId: 1,
  canMoveMascot: false,
  canRequestAction: false,
  markerArrivalEnabled: true,
  selectedTeamId: null,
  currentTeamId: null,
};

describe('GLGameBoard', () => {
  beforeEach(() => {
    markerArrivalEnabledRef.value = null;
    plateauBoardImgMock.mockClear();
  });

  test('useGLMarkerArrival enabled quand markerArrivalEnabled=true', () => {
    render(<GLGameBoard {...baseProps} markerArrivalEnabled />);
    expect(markerArrivalEnabledRef.value).toBe(true);
  });

  test('useGLMarkerArrival désactivé quand markerArrivalEnabled=false', () => {
    render(<GLGameBoard {...baseProps} markerArrivalEnabled={false} />);
    expect(markerArrivalEnabledRef.value).toBe(false);
  });

  test('affiche le fond plateau conventionnel après chargement des assets', async () => {
    render(<GLGameBoard {...baseProps} chapter={{ title: 'Savane', plateau_number: 2 }} />);
    await waitFor(() => {
      expect(plateauBoardImgMock).toHaveBeenCalledWith(2);
    });
    expect(screen.getByRole('img', { name: 'Savane' })).toHaveAttribute(
      'src',
      '/uploads/media-library/image/2026/06/plateau-2.jpg',
    );
  });
});
