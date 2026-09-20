import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useLearningGatingSummary } from '../../src/shared/hooks/useLearningGatingSummary.js';
import {
  LEARNING_GATING_CHANGED_EVENT,
  notifyLearningGatingChanged,
} from '../../src/shared/utils/learningGatingEvents.js';

describe('useLearningGatingSummary — rechargement sur changement', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  async function flush() {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
  }

  function requestFactory() {
    let calls = 0;
    const request = vi.fn(async () => {
      calls += 1;
      return {
        items: [{ resource_ref: '1', required: true, satisfied: calls > 1, pending_count: 0 }],
      };
    });
    return request;
  }

  test('se recharge quand le conditionnement change', async () => {
    const request = requestFactory();
    const { result } = renderHook(() =>
      useLearningGatingSummary({
        request,
        basePath: '/api/learning/gating/summary',
        resourceType: 'tutorial',
        refs: ['1'],
      }),
    );
    await flush();
    await waitFor(() => expect(result.current.summaries.get('1')?.satisfied).toBe(false));
    act(() => {
      notifyLearningGatingChanged({ resourceType: 'tutorial', resourceRef: '1' });
    });
    await waitFor(() => expect(result.current.summaries.get('1')?.satisfied).toBe(true));
    expect(request).toHaveBeenCalledTimes(2);
  });

  test('se recharge aussi sur l’événement de session du produit', async () => {
    const request = requestFactory();
    renderHook(() =>
      useLearningGatingSummary({
        request,
        basePath: '/api/gl/learning/gating/summary',
        resourceType: 'species',
        refs: ['ESP001'],
        sessionEventName: 'gl_session_changed',
      }),
    );
    await flush();
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    act(() => {
      window.dispatchEvent(new CustomEvent('gl_session_changed'));
    });
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  });

  test('se désabonne au démontage', async () => {
    const request = requestFactory();
    const { unmount } = renderHook(() =>
      useLearningGatingSummary({
        request,
        basePath: '/api/learning/gating/summary',
        resourceType: 'tutorial',
        refs: ['1'],
      }),
    );
    await flush();
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    unmount();
    act(() => {
      window.dispatchEvent(new CustomEvent(LEARNING_GATING_CHANGED_EVENT));
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  test('250 refs → 2 appels HTTP (lots de 200)', async () => {
    const request = vi.fn(async (path) => {
      const refs = new URL(path, 'http://x').searchParams.get('resourceRefs') || '';
      const ids = refs.split(',').filter(Boolean);
      return { items: ids.map((id) => ({ resource_ref: id, required: false })) };
    });
    const refs = Array.from({ length: 250 }, (_, i) => String(i + 1));
    const { result } = renderHook(() =>
      useLearningGatingSummary({
        request,
        basePath: '/api/learning/gating/summary',
        resourceType: 'plant',
        refs,
      }),
    );
    await flush();
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.summaries.size).toBe(250));
  });
});
