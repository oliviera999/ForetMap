import { useCallback, useLayoutEffect, useRef, useState } from 'react';

/** Débounce du commit molette : même délai court que useMapGestures (80 ms). */
const VISIT_MAP_TRANSFORM_COMMIT_DEBOUNCE_MS = 80;

/**
 * Transform pan/zoom du plan de visite sans re-render par frame de geste.
 *
 * Pendant un geste (drag, pinch, molette, zoom animé), la valeur vit dans `liveRef`
 * et est appliquée impérativement sur `worldRef.current.style.transform` sous
 * requestAnimationFrame — aucun setState, donc aucun re-render du composant hôte
 * à chaque frame. L'état React `transform` (lu par le rendu et les calculs dérivés,
 * ex. typographie des zones) n'est resynchronisé qu'en fin de geste via `commit()` :
 * comportement visuel identique, un seul re-render par geste. Même pattern que
 * `useMapGestures` (`tx` + `commit`, src/hooks/useMapGestures.js).
 *
 * @param {{ current: HTMLElement|null }} worldRef calque monde recevant `style.transform`.
 * @param {{ x: number, y: number, s: number }} [initial] transformation initiale.
 * @returns {{
 *   transform: { x: number, y: number, s: number },
 *   liveRef: { current: { x: number, y: number, s: number } },
 *   applyLive: () => void,
 *   setLive: (next: { x: number, y: number, s: number }) => void,
 *   commit: (next?: { x: number, y: number, s: number }|null) => void,
 *   scheduleCommit: (delayMs?: number) => void,
 * }}
 */
export function useVisitMapTransform(worldRef, initial = { x: 0, y: 0, s: 1 }) {
  const [transform, setTransform] = useState(initial);
  const liveRef = useRef({ ...initial });
  const applyRafRef = useRef(null);
  const commitTimerRef = useRef(null);

  /** Applique immédiatement la valeur vive sur le calque monde (style impératif). */
  const applyLive = useCallback(() => {
    const el = worldRef?.current;
    if (!el) return;
    const { x, y, s } = liveRef.current;
    el.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
  }, [worldRef]);

  /** Frame de geste : mute la ref et applique le style au prochain rAF, sans re-render. */
  const setLive = useCallback(
    (next) => {
      liveRef.current = next;
      if (applyRafRef.current != null) return;
      applyRafRef.current = requestAnimationFrame(() => {
        applyRafRef.current = null;
        applyLive();
      });
    },
    [applyLive],
  );

  /**
   * Fin de geste : fige la valeur vive (ou `next` si fourni) dans l'état React.
   * Sans changement effectif, l'état est conservé tel quel (aucun re-render, ex. tap sans drag).
   */
  const commit = useCallback(
    (next = null) => {
      if (next) liveRef.current = { ...next };
      if (commitTimerRef.current != null) {
        clearTimeout(commitTimerRef.current);
        commitTimerRef.current = null;
      }
      const snap = { ...liveRef.current };
      setTransform((prev) =>
        prev.x === snap.x && prev.y === snap.y && prev.s === snap.s ? prev : snap,
      );
      applyLive();
    },
    [applyLive],
  );

  /** Commit débouncé : chaque appel repousse l'échéance (rafales molette). */
  const scheduleCommit = useCallback(
    (delayMs = VISIT_MAP_TRANSFORM_COMMIT_DEBOUNCE_MS) => {
      if (commitTimerRef.current != null) clearTimeout(commitTimerRef.current);
      commitTimerRef.current = setTimeout(() => {
        commitTimerRef.current = null;
        commit();
      }, delayMs);
    },
    [commit],
  );

  // Un re-render pendant un geste réécrit `style.transform` avec l'état commité (en retard
  // d'un geste) : on ré-applique la valeur vive après chaque render — écriture no-op au repos.
  useLayoutEffect(() => {
    applyLive();
  });

  useLayoutEffect(
    () => () => {
      if (applyRafRef.current != null) cancelAnimationFrame(applyRafRef.current);
      if (commitTimerRef.current != null) clearTimeout(commitTimerRef.current);
    },
    [],
  );

  return { transform, liveRef, applyLive, setLive, commit, scheduleCommit };
}

export { VISIT_MAP_TRANSFORM_COMMIT_DEBOUNCE_MS };
