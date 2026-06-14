import { useEffect, useMemo, useRef, useState } from 'react';

import { shouldUseDesktopSplitLayout } from '../utils/appShellHelpers';

/**
 * Suivi autonome du viewport et de la visibilité de l'onglet (extrait de App.jsx, O5) :
 * - `viewportWidth` : largeur fenêtre, mise à jour via `resize` coalescé en requestAnimationFrame ;
 * - `isTabVisible` : état de visibilité (Page Visibility API) ;
 * - `shouldUseDesktopSplit` : dérivé layout (carte/tâches côte à côte sur grand écran).
 *
 * Aucun couplage au cœur fetchAll/polling/realtime/session : c'est une pure concern UI-state.
 * Iso-comportement avec l'ancien état inline d'App.jsx (mêmes valeurs / même logique).
 */
export function useViewportLayout() {
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth || 0);
  const [isTabVisible, setIsTabVisible] = useState(() => document.visibilityState !== 'hidden');
  const viewportResizeRafRef = useRef(null);

  useEffect(() => {
    const onResize = () => {
      if (viewportResizeRafRef.current != null) return;
      viewportResizeRafRef.current = window.requestAnimationFrame(() => {
        viewportResizeRafRef.current = null;
        setViewportWidth(window.innerWidth || 0);
      });
    };
    window.addEventListener('resize', onResize, { passive: true });
    return () => {
      window.removeEventListener('resize', onResize);
      if (viewportResizeRafRef.current != null) {
        window.cancelAnimationFrame(viewportResizeRafRef.current);
        viewportResizeRafRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => setIsTabVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  const shouldUseDesktopSplit = useMemo(
    () => shouldUseDesktopSplitLayout(viewportWidth),
    [viewportWidth],
  );

  return {
    viewportWidth,
    isTabVisible,
    shouldUseDesktopSplit,
  };
}
