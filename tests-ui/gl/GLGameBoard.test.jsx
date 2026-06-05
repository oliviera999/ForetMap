import React from 'react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { GLGameBoard } from '../../src/gl/components/GLGameBoard.jsx';

const markerArrivalEnabledRef = { value: null };

vi.mock('../../src/gl/hooks/useGLMarkerArrival.js', () => ({
  useGLMarkerArrival: (options) => {
    markerArrivalEnabledRef.value = options.enabled;
    return {
      popover: null,
      closePopover: vi.fn(),
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
  });

  test('useGLMarkerArrival enabled quand markerArrivalEnabled=true', () => {
    render(<GLGameBoard {...baseProps} markerArrivalEnabled />);
    expect(markerArrivalEnabledRef.value).toBe(true);
  });

  test('useGLMarkerArrival désactivé quand markerArrivalEnabled=false', () => {
    render(<GLGameBoard {...baseProps} markerArrivalEnabled={false} />);
    expect(markerArrivalEnabledRef.value).toBe(false);
  });
});
