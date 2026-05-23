// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGLBoardMascotMotion } from '../../src/gl/hooks/useGLBoardMascotMotion.js';

describe('useGLBoardMascotMotion', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initialise les positions depuis les équipes', () => {
    const teams = [{ id: 1, position_x_pct: 30, position_y_pct: 40, mascot_id: 'gl-gnome-mousse' }];
    const { result } = renderHook(() => useGLBoardMascotMotion({ teams, boardHeightPx: 400 }));
    expect(result.current.getPositionForTeam(1)).toEqual({ xp: 30, yp: 40 });
    expect(result.current.getMotionForTeam(1).walking).toBe(false);
  });

  it('active walking puis le coupe après MAP_VIEW_MASCOT_MOVE_MS', () => {
    const teams = [{ id: 2, position_x_pct: 10, position_y_pct: 10 }];
    const { result } = renderHook(() => useGLBoardMascotMotion({ teams, boardHeightPx: 500 }));
    act(() => {
      result.current.moveTeamTo(2, 80, 70);
    });
    expect(result.current.getMotionForTeam(2).walking).toBe(true);
    expect(result.current.getPositionForTeam(2).xp).toBe(80);
    act(() => {
      vi.advanceTimersByTime(560);
    });
    expect(result.current.getMotionForTeam(2).walking).toBe(false);
  });
});
