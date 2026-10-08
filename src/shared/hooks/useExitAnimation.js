import { useCallback, useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from './usePrefersReducedMotion.js';

/** Durée de fermeture des fiches et popovers — miroir de `--motion-exit` (`motion.css`). */
export const EXIT_ANIMATION_MS = 150;

/** Marge du minuteur de secours : `animationend` peut ne jamais arriver (onglet masqué, jsdom). */
const EXIT_FALLBACK_SLACK_MS = 60;

/**
 * Fermeture animée d'une surcouche (fiche, panneau, popover) : `runExit(close)` pose l'état
 * « en fermeture » — le composant ajoute alors la classe `fm-is-exiting` — puis appelle
 * `close()` à la fin de l'animation (`onAnimationEnd`) ou, à défaut, du minuteur de secours.
 *
 * - Mouvement réduit : `close()` est appelé tout de suite, sans état intermédiaire.
 * - Une seconde demande pendant la fermeture est ignorée (double clic, Échap + clic).
 * - L'état retombe après `close()` : si le parent ignore la fermeture, la surcouche réapparaît
 *   au lieu de rester invisible.
 *
 * @param {object} [options]
 * @param {number} [options.durationMs]
 * @param {boolean} [options.reducedMotion] force la préférence (sinon lue sur le système).
 * @param {string} [options.animationName] keyframes attendues par `onAnimationEnd` : une fin
 *   d'animation d'entrée ou d'un enfant ne doit pas démonter la surcouche.
 * @returns {{ closing: boolean, runExit: (close?: () => void) => void,
 *   onAnimationEnd: (event?: AnimationEvent) => void }}
 */
export function useExitAnimation({
  durationMs = EXIT_ANIMATION_MS,
  reducedMotion,
  animationName = '',
} = {}) {
  const systemReduced = usePrefersReducedMotion();
  const reduced = reducedMotion ?? systemReduced;
  const [closing, setClosing] = useState(false);
  const pendingRef = useRef(null);

  const finish = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    clearTimeout(pending.timer);
    setClosing(false);
    pending.close?.();
  }, []);

  const runExit = useCallback(
    (close) => {
      if (pendingRef.current) return;
      if (reduced || !(durationMs > 0)) {
        close?.();
        return;
      }
      pendingRef.current = {
        close,
        timer: setTimeout(finish, durationMs + EXIT_FALLBACK_SLACK_MS),
      };
      setClosing(true);
    },
    [reduced, durationMs, finish],
  );

  const onAnimationEnd = useCallback(
    (event) => {
      if (!pendingRef.current) return;
      if (event && event.target !== event.currentTarget) return;
      if (animationName && event?.animationName && event.animationName !== animationName) return;
      finish();
    },
    [animationName, finish],
  );

  useEffect(
    () => () => {
      if (pendingRef.current) clearTimeout(pendingRef.current.timer);
      pendingRef.current = null;
    },
    [],
  );

  return { closing, runExit, onAnimationEnd };
}
