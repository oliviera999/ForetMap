import React from 'react';
import { describe, expect, test, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { TimedToast } from '../../src/shared/components/TimedToast.jsx';

describe('TimedToast', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('affiche le message puis appelle onDone après le délai', async () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<TimedToast msg="Test toast" onDone={onDone} durationMs={1000} />);
    expect(screen.getByText('Test toast')).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
