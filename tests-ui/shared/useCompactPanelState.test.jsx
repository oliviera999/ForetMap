import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import {
  COMPACT_PANEL_QUERY,
  matchesCompactPanel,
  useCompactPanelState,
} from '../../src/shared/hooks/useCompactPanelState.js';
import {
  TASK_FILTERS_COMPACT_MQL,
  matchesTaskFiltersCompact,
  useTaskFiltersPanel,
} from '../../src/hooks/useTaskFiltersPanel.js';
import { useMapLocationFiltersPanel } from '../../src/hooks/useMapLocationFiltersPanel.js';

const KEY = 'foretmap:test:panelOpen';

/** matchMedia contrôlable : `state.compact` pilote la requête, `fire()` simule un `change`. */
function installMatchMedia(compact) {
  const state = { compact, listeners: new Set() };
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    get matches() {
      return query === COMPACT_PANEL_QUERY ? state.compact : false;
    },
    media: query,
    addEventListener: (_type, fn) => state.listeners.add(fn),
    removeEventListener: (_type, fn) => state.listeners.delete(fn),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  }));
  state.fire = () => state.listeners.forEach((fn) => fn());
  return state;
}

describe('useCompactPanelState', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('exports : requête compacte et lecture synchrone', () => {
    installMatchMedia(true);
    expect(COMPACT_PANEL_QUERY).toBe('(max-width: 1023px)');
    expect(matchesCompactPanel()).toBe(true);
    installMatchMedia(false);
    expect(matchesCompactPanel()).toBe(false);
  });

  test('sans matchMedia : jamais compact, pas d’erreur', () => {
    window.matchMedia = undefined;
    expect(matchesCompactPanel()).toBe(false);
    const { result } = renderHook(() => useCompactPanelState({ storageKey: KEY }));
    expect(result.current.compact).toBe(false);
    expect(result.current.open).toBe(true);
  });

  test('écran large : ouvert par défaut, repli mémorisé, réouverture mémorisée', () => {
    installMatchMedia(false);
    const { result } = renderHook(() => useCompactPanelState({ storageKey: KEY }));
    expect(result.current.compact).toBe(false);
    expect(result.current.open).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.open).toBe(false);
    expect(window.localStorage.getItem(KEY)).toBe('0');
    act(() => result.current.openPanel());
    expect(result.current.open).toBe(true);
    expect(window.localStorage.getItem(KEY)).toBe('1');
    act(() => result.current.close());
    expect(result.current.open).toBe(false);
    expect(window.localStorage.getItem(KEY)).toBe('0');
  });

  test('écran large : la préférence mémorisée est relue au montage', () => {
    installMatchMedia(false);
    window.localStorage.setItem(KEY, '0');
    const { result } = renderHook(() => useCompactPanelState({ storageKey: KEY }));
    expect(result.current.open).toBe(false);
  });

  test('wideDefaultOpen=false : fermé par défaut en large', () => {
    installMatchMedia(false);
    const { result } = renderHook(() =>
      useCompactPanelState({ storageKey: KEY, wideDefaultOpen: false }),
    );
    expect(result.current.open).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.open).toBe(true);
    expect(window.localStorage.getItem(KEY)).toBe('1');
  });

  test('écran compact : fermé à l’arrivée même si la préférence large dit « ouvert »', () => {
    installMatchMedia(true);
    window.localStorage.setItem(KEY, '1');
    const { result } = renderHook(() => useCompactPanelState({ storageKey: KEY }));
    expect(result.current.compact).toBe(true);
    expect(result.current.open).toBe(false);
  });

  test('écran compact : l’ouverture est éphémère, jamais mémorisée', () => {
    installMatchMedia(true);
    const { result } = renderHook(() => useCompactPanelState({ storageKey: KEY }));
    act(() => result.current.toggle());
    expect(result.current.open).toBe(true);
    expect(window.localStorage.getItem(KEY)).toBeNull();
    act(() => result.current.close());
    expect(result.current.open).toBe(false);
    expect(window.localStorage.getItem(KEY)).toBeNull();
    act(() => result.current.openPanel());
    expect(result.current.open).toBe(true);
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  test('bascule de largeur : large → compact ferme ; compact → large relit la préférence', () => {
    const mm = installMatchMedia(false);
    const { result } = renderHook(() => useCompactPanelState({ storageKey: KEY }));
    expect(result.current.open).toBe(true);
    act(() => {
      mm.compact = true;
      mm.fire();
    });
    expect(result.current.compact).toBe(true);
    expect(result.current.open).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.open).toBe(true);
    act(() => {
      mm.compact = false;
      mm.fire();
    });
    expect(result.current.compact).toBe(false);
    expect(result.current.open).toBe(true);
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  test('sans storageKey : aucune écriture dans localStorage', () => {
    installMatchMedia(false);
    const { result } = renderHook(() => useCompactPanelState());
    act(() => result.current.toggle());
    expect(result.current.open).toBe(false);
    expect(window.localStorage.length).toBe(0);
  });

  test('compactQuery personnalisée', () => {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query === '(max-width: 599px)',
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    const { result } = renderHook(() =>
      useCompactPanelState({ storageKey: KEY, compactQuery: '(max-width: 599px)' }),
    );
    expect(result.current.compact).toBe(true);
    expect(result.current.open).toBe(false);
  });
});

describe('hooks historiques (délégation)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('useTaskFiltersPanel : mêmes exports, clé foretmap:tasks:filtersOpen, ouvert par défaut', () => {
    installMatchMedia(false);
    expect(TASK_FILTERS_COMPACT_MQL).toBe(COMPACT_PANEL_QUERY);
    expect(matchesTaskFiltersCompact()).toBe(false);
    const { result } = renderHook(() => useTaskFiltersPanel());
    expect(result.current.open).toBe(true);
    act(() => result.current.toggle());
    expect(window.localStorage.getItem('foretmap:tasks:filtersOpen')).toBe('0');
  });

  test('useMapLocationFiltersPanel : clé foretmap:map:locationFiltersOpen, fermé par défaut', () => {
    installMatchMedia(false);
    const { result } = renderHook(() => useMapLocationFiltersPanel());
    expect(result.current.open).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.open).toBe(true);
    expect(window.localStorage.getItem('foretmap:map:locationFiltersOpen')).toBe('1');
  });
});
