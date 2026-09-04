import { useEffect } from 'react';

/**
 * Verrou du défilement du `body`, partagé ForetMap / G&L (plateforme, lot 3).
 *
 * API à compteur : plusieurs surcouches (modale + feuille + tiroir) peuvent verrouiller en
 * même temps ; le `overflow` d'origine n'est restauré que lorsque le dernier verrou est levé.
 */
let lockCount = 0;
let previousOverflow = '';

function hasBody() {
  return typeof document !== 'undefined' && Boolean(document.body);
}

/** Décrémente le compteur ; restaure `overflow` quand plus aucune surcouche ne verrouille. */
function unlockBodyScroll() {
  if (!hasBody()) return;
  if (lockCount === 0) return;
  lockCount -= 1;
  if (lockCount === 0) {
    document.body.style.overflow = previousOverflow || '';
    previousOverflow = '';
  }
}

/**
 * Incrémente le compteur et pose `overflow:hidden` au premier verrou.
 * @returns {() => void} libération idempotente de CE verrou (équivaut à un `unlockBodyScroll`).
 */
function lockBodyScroll() {
  if (!hasBody()) return () => {};
  if (lockCount === 0) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  lockCount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    unlockBodyScroll();
  };
}

/** Verrouille le défilement du body tant que `active` est vrai. */
function useBodyScrollLock(active) {
  useEffect(() => {
    if (!active) return undefined;
    return lockBodyScroll();
  }, [active]);
}

/** Réservé aux tests : nombre de verrous posés. */
function getBodyScrollLockCount() {
  return lockCount;
}

export { lockBodyScroll, unlockBodyScroll, useBodyScrollLock, getBodyScrollLockCount };
