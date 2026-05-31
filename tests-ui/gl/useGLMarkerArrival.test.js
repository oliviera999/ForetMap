import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGLMarkerArrival } from '../../src/gl/hooks/useGLMarkerArrival.js';

vi.mock('../../src/gl/services/apiGL.js', () => ({
  apiGL: vi.fn(),
}));

import { apiGL } from '../../src/gl/services/apiGL.js';

const QUESTION_MARKER = {
  id: 10,
  label: 'Quiz repère',
  x_pct: 40,
  y_pct: 55,
  event_type: 'question',
  event_config: { version: 1, question: { mode: 'fixed', fixedQuestionCode: 'QCM0001', pool: {} } },
};

describe('useGLMarkerArrival', () => {
  beforeEach(() => {
    vi.mocked(apiGL).mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('schedulePresentOnArrival déclenche present-question après le délai d’animation', async () => {
    vi.mocked(apiGL).mockResolvedValue({
      questionCode: 'QCM0001',
      presentation: { question: 'Test ?', choices: [], presentationToken: 'tok' },
    });

    const { result } = renderHook(() => useGLMarkerArrival({
      teams: [{ id: 1, position_marker_id: null }],
      markers: [QUESTION_MARKER],
      gameId: 42,
      watchTeamId: 1,
    }));

    act(() => {
      result.current.schedulePresentOnArrival(QUESTION_MARKER, 1, { force: true });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(560);
    });

    expect(apiGL).toHaveBeenCalledWith(
      '/api/gl/games/42/markers/10/present-question',
      'POST',
      expect.objectContaining({ teamId: 1 }),
    );
    expect(result.current.popover?.questionCode).toBe('QCM0001');
  });

  test('ignore le second appel synchronisé serveur si déjà déclenché localement', async () => {
    vi.mocked(apiGL).mockResolvedValue({
      questionCode: 'QCM0001',
      presentation: { question: 'Test ?', choices: [], presentationToken: 'tok' },
    });

    const { result, rerender } = renderHook((props) => useGLMarkerArrival(props), {
      initialProps: {
        teams: [{ id: 1, position_marker_id: null }],
        markers: [QUESTION_MARKER],
        gameId: 42,
        watchTeamId: 1,
      },
    });

    act(() => {
      result.current.schedulePresentOnArrival(QUESTION_MARKER, 1, { force: true });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(560);
    });

    rerender({
      teams: [{ id: 1, position_marker_id: 10 }],
      markers: [QUESTION_MARKER],
      gameId: 42,
      watchTeamId: 1,
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(560);
    });

    expect(apiGL).toHaveBeenCalledTimes(1);
  });
});
