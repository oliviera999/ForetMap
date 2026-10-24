import { useEffect, useState } from 'react';

/**
 * Détection unique de `prefers-reduced-motion: reduce` (ForetMap + GL).
 * Un seul `matchMedia` + liste d'abonnés : les hooks et les moteurs (refs rAF)
 * partagent la même source (ANIM-21).
 */

const QUERY = '(prefers-reduced-motion: reduce)';

let mediaQuery = null;
let cached = false;
const listeners = new Set();

function ensureMedia() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  if (mediaQuery) return mediaQuery;
  mediaQuery = window.matchMedia(QUERY);
  cached = Boolean(mediaQuery.matches);
  const apply = () => {
    cached = Boolean(mediaQuery.matches);
    listeners.forEach((fn) => {
      try {
        fn(cached);
      } catch (_) {
        /* un abonné ne doit pas casser les autres */
      }
    });
  };
  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', apply);
  } else {
    mediaQuery.addListener?.(apply);
  }
  return mediaQuery;
}

/** Lecture synchrone (effets one-shot, garde-fous hors React). */
export function getPrefersReducedMotion() {
  ensureMedia();
  return cached;
}

/**
 * Abonnement hors rendu React (moteurs de vue / position qui tiennent une ref).
 * @param {(reduced: boolean) => void} listener
 * @returns {() => void} désabonnement
 */
export function subscribePrefersReducedMotion(listener) {
  if (typeof listener !== 'function') return () => {};
  ensureMedia();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Respecte la préférence système prefers-reduced-motion (ForetMap + GL). */
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => getPrefersReducedMotion());
  useEffect(() => {
    ensureMedia();
    setReduced(getPrefersReducedMotion());
    return subscribePrefersReducedMotion(setReduced);
  }, []);
  return reduced;
}
