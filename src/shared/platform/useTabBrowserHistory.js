import { useCallback, useEffect, useRef } from 'react';
import { isNativeFilePickerGuardActive } from './overlayHistory';
import { buildTabHistoryState, readTabFromHistoryState } from './tabBrowserHistory';

/**
 * Synchronise l’onglet actif avec l’historique du navigateur.
 *
 * - `navigateTab(id)` : changement utilisateur → `pushState` (Retour = onglet précédent).
 * - `setTab(id)` (garde-fous, auth…) : `replaceState` (n’empile pas).
 * - `popstate` : restaure l’onglet mémorisé dans `history.state`, sauf garde file-picker.
 *
 * @param {object} params
 * @param {string} params.tab
 * @param {(next: string) => void} params.setTab
 * @param {(id: string) => boolean} params.isKnownTab
 * @returns {{ navigateTab: (next: string) => void }}
 */
export function useTabBrowserHistory({ tab, setTab, isKnownTab }) {
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const isKnownTabRef = useRef(isKnownTab);
  isKnownTabRef.current = isKnownTab;

  const syncingFromPopRef = useRef(false);
  const pushNextChangeRef = useRef(false);
  const bootstrappedRef = useRef(false);

  const navigateTab = useCallback(
    (next) => {
      const id = String(next ?? '').trim();
      if (!id || !isKnownTabRef.current(id)) {
        setTab(next);
        return;
      }
      if (id === tabRef.current) return;
      pushNextChangeRef.current = true;
      setTab(id);
    },
    [setTab],
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !window.history?.replaceState) return;

    if (syncingFromPopRef.current) {
      syncingFromPopRef.current = false;
      return;
    }

    const nextState = buildTabHistoryState(tab, window.history.state);
    const href = window.location.href;

    if (!bootstrappedRef.current) {
      bootstrappedRef.current = true;
      window.history.replaceState(nextState, '', href);
      return;
    }

    if (pushNextChangeRef.current) {
      pushNextChangeRef.current = false;
      window.history.pushState(nextState, '', href);
      return;
    }

    window.history.replaceState(nextState, '', href);
  }, [tab]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const onPopState = (event) => {
      if (isNativeFilePickerGuardActive()) return;
      const next = readTabFromHistoryState(event.state, isKnownTabRef.current);
      if (!next) return;
      if (next === tabRef.current) return;
      syncingFromPopRef.current = true;
      setTab(next);
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [setTab]);

  return { navigateTab };
}
