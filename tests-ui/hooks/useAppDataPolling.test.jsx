// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { LIVE_MIN_INTERVAL_MS, useAppDataPolling } from '../../src/hooks/useAppDataPolling.js';
import { POLLING_COARSE_TABS } from '../../src/constants/app-runtime.js';

/** Aligné sur `BACKGROUND_MIN_INTERVAL_MS` dans le hook (non exporté). */
const BACKGROUND_MIN_INTERVAL_MS = 120000;

function mountPolling(overrides = {}) {
  const fetchAll = vi.fn();
  const pauseRef = { current: false };
  const initial = {
    fetchAll,
    tab: 'map',
    rtStatus: 'off',
    refreshMs: 1000,
    isTabVisible: true,
    pauseRef,
    ...overrides,
  };
  const hook = renderHook((props) => useAppDataPolling(props), { initialProps: initial });
  return { fetchAll, pauseRef, ...hook };
}

describe('POLLING_COARSE_TABS', () => {
  it('couvre les onglets pédago et médiathèque (fetch autonome)', () => {
    expect(POLLING_COARSE_TABS.has('glossary')).toBe(true);
    expect(POLLING_COARSE_TABS.has('quiz')).toBe(true);
    expect(POLLING_COARSE_TABS.has('foodweb')).toBe(true);
    expect(POLLING_COARSE_TABS.has('media_library')).toBe(true);
  });

  it('laisse carte, tâches, plantes et visite en cadence nominale', () => {
    expect(POLLING_COARSE_TABS.has('map')).toBe(false);
    expect(POLLING_COARSE_TABS.has('tasks')).toBe(false);
    expect(POLLING_COARSE_TABS.has('maptasks')).toBe(false);
    expect(POLLING_COARSE_TABS.has('plants')).toBe(false);
    expect(POLLING_COARSE_TABS.has('visit')).toBe(false);
  });
});

describe('useAppDataPolling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('double l’intervalle sur un onglet coarse si le temps réel n’est pas live', () => {
    const { fetchAll } = mountPolling({ tab: 'glossary' });

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(fetchAll).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(fetchAll).toHaveBeenCalledTimes(1);
  });

  it('garde un filet fetchAll à 90 s quand rtStatus est live', () => {
    const { fetchAll } = mountPolling({ tab: 'map', rtStatus: 'live', refreshMs: 1000 });

    act(() => {
      vi.advanceTimersByTime(LIVE_MIN_INTERVAL_MS - 1);
    });
    expect(fetchAll).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(fetchAll).toHaveBeenCalledTimes(1);
  });

  it('refetch en quittant un onglet coarse (glossary → map)', () => {
    const { fetchAll, rerender, pauseRef } = mountPolling({ tab: 'glossary' });
    fetchAll.mockClear();

    rerender({
      fetchAll,
      tab: 'map',
      rtStatus: 'off',
      refreshMs: 1000,
      isTabVisible: true,
      pauseRef,
    });
    expect(fetchAll).toHaveBeenCalledTimes(1);
  });

  it('refetch en quittant le forum vers la carte', () => {
    const { fetchAll, rerender, pauseRef } = mountPolling({ tab: 'forum' });
    fetchAll.mockClear();

    rerender({
      fetchAll,
      tab: 'map',
      rtStatus: 'off',
      refreshMs: 1000,
      isTabVisible: true,
      pauseRef,
    });
    expect(fetchAll).toHaveBeenCalledTimes(1);
  });

  it('ne refetch pas en passant de map à tasks (onglets chauds)', () => {
    const { fetchAll, rerender, pauseRef } = mountPolling({ tab: 'map' });
    fetchAll.mockClear();

    rerender({
      fetchAll,
      tab: 'tasks',
      rtStatus: 'off',
      refreshMs: 1000,
      isTabVisible: true,
      pauseRef,
    });
    expect(fetchAll).not.toHaveBeenCalled();
  });

  it('applique le plancher arrière-plan quand l’onglet navigateur n’est pas visible', () => {
    const { fetchAll } = mountPolling({ tab: 'map', isTabVisible: false, refreshMs: 1000 });

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(fetchAll).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(BACKGROUND_MIN_INTERVAL_MS - 1000);
    });
    expect(fetchAll).toHaveBeenCalledTimes(1);
  });
});
