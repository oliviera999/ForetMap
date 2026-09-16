import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useServiceWorkerUpdate } from '../../src/hooks/useServiceWorkerUpdate';
import { SW_UPDATE_AVAILABLE_EVENT } from '../../src/shared/pwa/registerServiceWorker.js';

describe('useServiceWorkerUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('ne signale rien tant qu’aucune version n’attend', () => {
    const { result } = renderHook(() => useServiceWorkerUpdate());
    expect(result.current).toBeNull();
  });

  it('expose la mise à jour annoncée par le service worker', () => {
    const { result } = renderHook(() => useServiceWorkerUpdate());
    const apply = vi.fn();

    act(() => {
      window.dispatchEvent(new CustomEvent(SW_UPDATE_AVAILABLE_EVENT, { detail: { apply } }));
    });

    expect(result.current).toEqual({ apply });
    // C'est l'appelant (le bandeau) qui décide de recharger, jamais le hook.
    expect(apply).not.toHaveBeenCalled();
  });

  it('se désabonne au démontage', () => {
    const { result, unmount } = renderHook(() => useServiceWorkerUpdate());
    unmount();
    act(() => {
      window.dispatchEvent(
        new CustomEvent(SW_UPDATE_AVAILABLE_EVENT, { detail: { apply: vi.fn() } }),
      );
    });
    expect(result.current).toBeNull();
  });
});
