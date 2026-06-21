import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
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
const schedulePresentOnArrivalRef = { current: vi.fn() };
const moveTeamToRef = { current: vi.fn() };
let capturedDiceRollHandler = null;

vi.mock('../../src/gl/components/GLBoardChrome.jsx', () => ({
  GLBoardChrome: ({ onRollResult }) => {
    capturedDiceRollHandler = onRollResult;
    return <div data-testid="gl-board-chrome-mock" />;
  },
}));

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
      schedulePresentOnArrival: (...args) => schedulePresentOnArrivalRef.current(...args),
    };
  },
}));

vi.mock('../../src/gl/hooks/useGLBoardMascotMotion.js', () => ({
  useGLBoardMascotMotion: () => ({
    getPositionForTeam: () => ({ xp: 50, yp: 50 }),
    getMotionForTeam: () => ({}),
    moveTeamTo: (...args) => moveTeamToRef.current(...args),
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
    schedulePresentOnArrivalRef.current = vi.fn();
    moveTeamToRef.current = vi.fn();
    capturedDiceRollHandler = null;
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

  test('jet de dés en chemin numéroté anime la mascotte et planifie le popover repère', async () => {
    const onDiceRollResult = vi.fn().mockResolvedValue(undefined);
    const questionMarker = {
      id: 2,
      label: 'Quiz',
      x_pct: 60,
      y_pct: 40,
      order_index: 2,
      event_type: 'question',
      event_config: { version: 1, question: { mode: 'fixed', fixedQuestionCode: 'QCM0001' } },
    };
    render(
      <GLGameBoard
        {...baseProps}
        markers={[
          { id: 1, label: 'Départ', x_pct: 10, y_pct: 70, order_index: 1 },
          questionMarker,
        ]}
        teams={[{ id: 1, name: 'Eq', type: 'gnome', color: '#65a30d', position_marker_id: 1 }]}
        selectedTeamId={1}
        boardMovement={{ isNumberedPath: true, startIndex: 0 }}
        onDiceRollResult={onDiceRollResult}
        virtualDiceEnabled
      />,
    );

    expect(capturedDiceRollHandler).toBeTypeOf('function');
    await act(async () => {
      await capturedDiceRollHandler({ total: 1 });
    });

    expect(moveTeamToRef.current).toHaveBeenCalledWith(
      1,
      60,
      40,
      expect.objectContaining({ triggerHappy: true, arrival: 'marker' }),
    );
    expect(schedulePresentOnArrivalRef.current).toHaveBeenCalledWith(questionMarker, 1, {
      force: true,
    });
    expect(onDiceRollResult).toHaveBeenCalledWith({ total: 1 });
  });
});
