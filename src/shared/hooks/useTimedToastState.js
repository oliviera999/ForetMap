import { useEffect, useState } from 'react';

/** Durée d'affichage (ms) d'un toast « long » (narration, refus). */
export const TIMED_TOAST_LONG_MS = 6000;
/** Durée d'affichage (ms) d'un toast « court » (changement de tour, confirmation). */
export const TIMED_TOAST_SHORT_MS = 4000;

/**
 * État de toast auto-expirant (kit d'interface, lot 3 — sorti de `useGlToasts` G&L) :
 * identique à un `useState(null)` accompagné d'un `useEffect` qui remet la valeur à `null`
 * après `durationMs` dès qu'elle devient truthy (minuterie nettoyée si la valeur change ou
 * si le composant se démonte). Le rendu du toast lui-même passe par `TimedToast` /
 * `FixedToast` (`src/shared/components/`).
 *
 * @param {number} durationMs durée d'affichage avant effacement automatique.
 * @returns {[any, Function]} paire `[toast, setToast]` (contrat de `useState`).
 */
export function useTimedToastState(durationMs = TIMED_TOAST_SHORT_MS) {
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), durationMs);
    return () => clearTimeout(id);
  }, [toast, durationMs]);

  return [toast, setToast];
}
