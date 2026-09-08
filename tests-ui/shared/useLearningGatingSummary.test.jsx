import { describe, test, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useLearningGatingSummary } from '../../src/shared/hooks/useLearningGatingSummary.js';
import {
  LEARNING_GATING_CHANGED_EVENT,
  notifyLearningGatingChanged,
} from '../../src/shared/utils/learningGatingEvents.js';

// D4 (docs/AUDIT_VALIDATION_QUIZ_2026-09.md) : la pastille passe de « ? » à « ✓ » sans fermer
// la fenêtre — le résumé se recharge sur l'événement commun, dans les deux applications.
describe('useLearningGatingSummary — rechargement sur changement', () => {
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
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    unmount();
    act(() => {
      window.dispatchEvent(new CustomEvent(LEARNING_GATING_CHANGED_EVENT));
    });
    expect(request).toHaveBeenCalledTimes(1);
  });
});
