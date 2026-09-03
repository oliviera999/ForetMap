// @vitest-environment jsdom
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * Montage réel du plateau de jeu G&L sur le moteur de carte partagé (lot 2) : contrairement à
 * `GLGameBoard.test.jsx`, `useGlPctMapGestures` n'est PAS simulé — le cadre, le calque monde,
 * l'image et les contrôles zoom doivent sortir du vrai moteur, et le plein écran passe par le
 * shell partagé (`MapFullscreenShell`) en gardant les testids attendus par les e2e GL.
 */

vi.mock('../../src/gl/assets/index.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    plateauBoardImg: () => '/uploads/media-library/image/2026/06/plateau-2.jpg',
    loadGlAssetRuntime: vi.fn(() => Promise.resolve({ keys: {}, images: {}, audio: {} })),
  };
});

const stubs = vi.hoisted(() => {
  const noop = () => {};
  return {
    arrival: {
      popover: null,
      effectPopover: null,
      closePopover: noop,
      closeEffectPopover: noop,
      reshuffle: noop,
      setResult: noop,
      schedulePresentOnArrival: noop,
    },
    motion: {
      getPositionForTeam: () => ({ xp: 50, yp: 50 }),
      getMotionForTeam: () => ({}),
      moveTeamTo: noop,
    },
  };
});

vi.mock('../../src/gl/hooks/useGLMarkerArrival.js', () => ({
  useGLMarkerArrival: () => stubs.arrival,
}));
vi.mock('../../src/gl/hooks/useGLBoardMascotMotion.js', () => ({
  useGLBoardMascotMotion: () => stubs.motion,
}));
vi.mock('../../src/gl/components/GLBoardMarkers.jsx', () => ({
  GLBoardMarkers: () => <div data-testid="board-markers" />,
}));
vi.mock('../../src/gl/components/GLBoardChrome.jsx', () => ({
  GLBoardChrome: ({ mapFullscreen, onCloseFullscreen }) =>
    mapFullscreen ? (
      <button type="button" data-testid="gl-map-fullscreen-close" onClick={onCloseFullscreen}>
        Fermer
      </button>
    ) : null,
}));
vi.mock('../../src/gl/hooks/usePrefersReducedMotion.js', () => ({
  usePrefersReducedMotion: () => false,
}));

const { GLGameBoard } = await import('../../src/gl/components/GLGameBoard.jsx');

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

beforeEach(() => {
  document.body.className = '';
});

describe('GLGameBoard — montage sur le moteur de carte partagé', () => {
  test('cadre, calque monde, image et contrôles zoom rendus par le vrai moteur', async () => {
    const view = render(<GLGameBoard {...baseProps} />);
    const board = view.container.querySelector('.gl-board');
    expect(board).not.toBeNull();
    const world = board.querySelector('.gl-board-world');
    expect(world).not.toBeNull();
    // transform-origin 0 0 est posé par la feuille gl-theme.css (.gl-board-world).
    expect(world.querySelector('.gl-board-fit-layer img')).not.toBeNull();
    expect(board.style.touchAction).toBe('none');
    expect(screen.getByRole('button', { name: 'Zoomer le plateau' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Recentrer le plateau' })).toBeTruthy();
  });

  test('plein écran : shell partagé, testids e2e conservés, Échap referme', async () => {
    render(<GLGameBoard {...baseProps} />);
    fireEvent.click(screen.getByTestId('gl-map-fullscreen-open'));
    const layer = await screen.findByTestId('gl-map-fullscreen-layer');
    expect(layer.classList.contains('fm-map-fullscreen-layer')).toBe(true);
    expect(layer.classList.contains('gl-board-fullscreen-shell')).toBe(true);
    expect(document.body.classList.contains('fm-map-fullscreen-active')).toBe(true);
    expect(screen.queryByTestId('gl-map-fullscreen-open')).toBeNull();
    fireEvent.click(screen.getByTestId('gl-map-fullscreen-close'));
    await waitFor(() => expect(screen.queryByTestId('gl-map-fullscreen-layer')).toBeNull());
    expect(document.body.classList.contains('fm-map-fullscreen-active')).toBe(false);

    fireEvent.click(screen.getByTestId('gl-map-fullscreen-open'));
    await screen.findByTestId('gl-map-fullscreen-layer');
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('gl-map-fullscreen-layer')).toBeNull());
  });
});
