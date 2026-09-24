import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  TAB_HISTORY_STATE_KEY,
  buildTabHistoryState,
  readTabFromHistoryState,
} from '../../src/shared/platform/tabBrowserHistory.js';

const known = (id) => ['map', 'tasks', 'plants', 'visit'].includes(id);

describe('tabBrowserHistory', () => {
  test('buildTabHistoryState pose la clé et retire foretmapOverlay', () => {
    const state = buildTabHistoryState('tasks', { foretmapOverlay: true, other: 1 });
    expect(state[TAB_HISTORY_STATE_KEY]).toBe('tasks');
    expect(state.foretmapOverlay).toBeUndefined();
    expect(state.other).toBe(1);
  });

  test('readTabFromHistoryState accepte un onglet connu', () => {
    expect(readTabFromHistoryState({ [TAB_HISTORY_STATE_KEY]: 'map' }, known)).toBe('map');
  });

  test('readTabFromHistoryState refuse un onglet inconnu ou un état vide', () => {
    expect(readTabFromHistoryState({ [TAB_HISTORY_STATE_KEY]: 'fantome' }, known)).toBeNull();
    expect(readTabFromHistoryState(null, known)).toBeNull();
    expect(readTabFromHistoryState({}, known)).toBeNull();
  });
});

describe('useTabBrowserHistory — empilement et Retour', () => {
  let renderHook;
  let act;
  let useTabBrowserHistory;
  let historyStates;
  let popListeners;

  beforeEach(async () => {
    vi.resetModules();
    historyStates = [{}];
    popListeners = [];

    const history = {
      get state() {
        return historyStates[historyStates.length - 1];
      },
      replaceState(state) {
        historyStates[historyStates.length - 1] = state;
      },
      pushState(state) {
        historyStates.push(state);
      },
      back() {
        history.go(-1);
      },
      go(delta) {
        if (delta >= 0 || historyStates.length <= 1) return;
        historyStates.splice(historyStates.length + delta);
        const event = { state: historyStates[historyStates.length - 1] };
        popListeners.forEach((fn) => fn(event));
      },
    };

    globalThis.window = {
      history,
      location: { href: 'http://localhost/' },
      addEventListener: (type, fn) => {
        if (type === 'popstate') popListeners.push(fn);
      },
      removeEventListener: (type, fn) => {
        if (type === 'popstate') popListeners = popListeners.filter((l) => l !== fn);
      },
    };

    ({ renderHook, act } = await import('@testing-library/react'));
    ({ useTabBrowserHistory } = await import('../../src/shared/platform/useTabBrowserHistory.js'));
  });

  test('navigateTab empile ; Retour restaure l’onglet précédent', () => {
    let tab = 'map';
    const setTab = (next) => {
      tab = next;
    };
    const isKnownTab = (id) => ['map', 'tasks', 'plants'].includes(id);

    const { rerender, result } = renderHook(
      ({ currentTab }) =>
        useTabBrowserHistory({
          tab: currentTab,
          setTab: (next) => {
            setTab(next);
          },
          isKnownTab,
        }),
      { initialProps: { currentTab: tab } },
    );

    // Re-rendre après bootstrap replaceState
    rerender({ currentTab: tab });

    act(() => {
      result.current.navigateTab('tasks');
    });
    // Le setter réel met à jour `tab` ; on re-rend comme le ferait React.
    rerender({ currentTab: 'tasks' });
    expect(historyStates.length).toBe(2);
    expect(historyStates[1][TAB_HISTORY_STATE_KEY]).toBe('tasks');

    act(() => {
      result.current.navigateTab('plants');
    });
    rerender({ currentTab: 'plants' });
    expect(historyStates.length).toBe(3);

    act(() => {
      window.history.back();
    });
    expect(tab).toBe('tasks');
    rerender({ currentTab: tab });

    act(() => {
      window.history.back();
    });
    expect(tab).toBe('map');
  });

  test('setTab programmatique remplace sans empiler', () => {
    let tab = 'map';
    const setTab = vi.fn((next) => {
      tab = next;
    });
    const isKnownTab = (id) => ['map', 'tasks'].includes(id);

    const { rerender } = renderHook(
      ({ currentTab }) =>
        useTabBrowserHistory({
          tab: currentTab,
          setTab,
          isKnownTab,
        }),
      { initialProps: { currentTab: tab } },
    );

    act(() => {
      setTab('tasks');
    });
    rerender({ currentTab: 'tasks' });
    expect(historyStates.length).toBe(1);
    expect(historyStates[0][TAB_HISTORY_STATE_KEY]).toBe('tasks');
  });

  /**
   * Menu mobile de la barre prof : toucher un pôle ouvre la feuille (entrée de surcouche)
   * ET son premier onglet (entrée d'onglet, empilée par-dessus). Choisir un autre onglet
   * dans la feuille la ferme : le recul différé de la surcouche retombait sur l'entrée du
   * premier onglet, et le `popstate` ramenait l'utilisateur dessus — il fallait rouvrir le
   * pôle et cliquer une seconde fois.
   */
  test('fermer une surcouche en changeant d’onglet ne ramène pas l’onglet précédent', async () => {
    const { pushOverlayClose, removeOverlayClose } =
      await import('../../src/shared/platform/overlayHistory.js');
    let tab = 'map';
    const setTab = (next) => {
      tab = next;
    };
    const isKnownTab = (id) => ['map', 'tasks', 'plants'].includes(id);
    const { rerender, result } = renderHook(
      ({ currentTab }) => useTabBrowserHistory({ tab: currentTab, setTab, isKnownTab }),
      { initialProps: { currentTab: tab } },
    );

    const closeSheet = vi.fn();
    act(() => {
      pushOverlayClose(closeSheet);
      result.current.navigateTab('tasks');
    });
    rerender({ currentTab: tab });
    expect(tab).toBe('tasks');

    // Même commit React (clic discret) : l'effet d'onglet empile `plants`, puis le démontage
    // de la feuille programme son recul d'historique en microtâche.
    act(() => {
      result.current.navigateTab('plants');
    });
    rerender({ currentTab: tab });
    await act(async () => {
      removeOverlayClose(closeSheet);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    rerender({ currentTab: tab });

    expect(tab).toBe('plants');
    expect(closeSheet).not.toHaveBeenCalled();
    expect(historyStates[historyStates.length - 1][TAB_HISTORY_STATE_KEY]).toBe('plants');
  });
});
