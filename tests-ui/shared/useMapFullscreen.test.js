import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useMapFullscreen, FM_MAP_FULLSCREEN_BODY_CLASS } from '../../src/shared/hooks/useMapFullscreen.js';

describe('useMapFullscreen', () => {
  beforeEach(() => {
    document.body.className = '';
    vi.stubGlobal('localStorage', {
      store: {},
      getItem(key) {
        return this.store[key] ?? null;
      },
      setItem(key, value) {
        this.store[key] = String(value);
      },
      removeItem(key) {
        delete this.store[key];
      },
      clear() {
        this.store = {};
      },
    });
  });

  afterEach(() => {
    document.body.classList.remove(FM_MAP_FULLSCREEN_BODY_CLASS);
    vi.unstubAllGlobals();
  });

  it('active le plein écran et la classe body', () => {
    const { result } = renderHook(() => useMapFullscreen());

    act(() => {
      result.current.openMapFullscreen();
    });

    expect(result.current.mapFullscreen).toBe(true);
    expect(document.body.classList.contains(FM_MAP_FULLSCREEN_BODY_CLASS)).toBe(true);
  });

  it('persiste via persistKey', () => {
    const { result } = renderHook(() =>
      useMapFullscreen({ persistKey: 'foretmap_test_fullscreen' }),
    );

    act(() => {
      result.current.openMapFullscreen();
    });

    expect(localStorage.getItem('foretmap_test_fullscreen')).toBe('1');

    act(() => {
      result.current.closeMapFullscreen();
    });

    expect(localStorage.getItem('foretmap_test_fullscreen')).toBe('0');
  });

  it('ne quitte pas au clavier si escapeBlocked', () => {
    const { result } = renderHook(() => useMapFullscreen({ escapeBlocked: true }));

    act(() => {
      result.current.openMapFullscreen();
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });

    expect(result.current.mapFullscreen).toBe(true);
  });
});
