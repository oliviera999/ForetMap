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

vi.mock('../../src/gl/components/GLBoardMarkers.jsx', () => ({
  GLBoardMarkers: ({ markerPathNumbers }) => (
    <div
      data-testid="board-markers"
      data-has-path-numbers={markerPathNumbers != null ? '1' : '0'}
    />
  ),
}));

vi.mock('../../src/gl/components/GLBoardChrome.jsx', () => ({
  GLBoardChrome: () => null,
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

  test('masque les numéros de parcours par défaut', () => {
    const { container } = render(
      <GLGameBoard
        {...baseProps}
        markers={[{ id: 1, label: 'Départ', x_pct: 10, y_pct: 20, order_index: 0 }]}
        boardMovement={{ isNumberedPath: true, startIndex: 1 }}
      />,
    );
    expect(container.querySelector('[data-has-path-numbers="0"]')).toBeTruthy();
  });

  test('affiche les numéros de parcours si réglage actif en mode numéroté', () => {
    const { container } = render(
      <GLGameBoard
        {...baseProps}
        markers={[{ id: 1, label: 'Départ', x_pct: 10, y_pct: 20, order_index: 0 }]}
        boardMovement={{ isNumberedPath: true, startIndex: 1 }}
        showMarkerPathNumbers
      />,
    );
    expect(container.querySelector('[data-has-path-numbers="1"]')).toBeTruthy();
  });
});
