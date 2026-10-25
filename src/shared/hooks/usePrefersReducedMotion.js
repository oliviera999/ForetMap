import { useEffect, useState } from 'react';

/**
 * Détection unique de `prefers-reduced-motion: reduce` (ForetMap + GL).
 * Un seul `matchMedia` + liste d'abonnés : les hooks et les moteurs (refs rAF)
 * partagent la même source (ANIM-21).
 */

const QUERY = '(prefers-reduced-motion: reduce)';

let mediaQuery = null;
/**
 * `window.matchMedia` qui a produit `mediaQuery`. S'il est remplacé (polyfill posé après le
 * premier appel, doublure de test), la requête est refaite : sans cela, la première
 * `MediaQueryList` restait servie pour toute la durée de la page, et un remplacement de
 * `matchMedia` n'était jamais vu.
 */
let mediaSource = null;
/** Détache l'écouteur `change` de la `MediaQueryList` courante. */
let detachMedia = null;
let cached = false;
const listeners = new Set();

function ensureMedia() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  if (mediaQuery && mediaSource === window.matchMedia) return mediaQuery;
  detachMedia?.();
  detachMedia = null;
  mediaSource = window.matchMedia;
  const mq = window.matchMedia(QUERY) || null;
  mediaQuery = mq;
  cached = Boolean(mq?.matches);
  if (!mq) return null;
  const apply = () => {
    cached = Boolean(mq.matches);
    listeners.forEach((fn) => {
      try {
        fn(cached);
      } catch (_) {
        /* un abonné ne doit pas casser les autres */
      }
    });
  };
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', apply);
    detachMedia = () => mq.removeEventListener?.('change', apply);
  } else if (typeof mq.addListener === 'function') {
    mq.addListener(apply);
    detachMedia = () => mq.removeListener?.(apply);
  }
  return mq;
}

/**
 * Remet le cache module (tests qui remplacent `window.matchMedia`) : détache l'écouteur de la
 * requête courante et oublie les abonnés.
 */
export function resetPrefersReducedMotionForTests() {
  detachMedia?.();
  detachMedia = null;
  mediaSource = null;
  mediaQuery = null;
  cached = false;
  listeners.clear();
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
