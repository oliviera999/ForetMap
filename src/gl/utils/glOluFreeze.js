import { useEffect, useState } from 'react';

/**
 * Gel d'Olu (« Tenir à deux », spec § 5) : tant que l'oiseau témoin joue son état, le
 * narrateur se fige (état ARRÊT) — aucune bulle, aucune ligne. Petit magasin partagé, sans
 * dépendance : `freezeOlu(ms)` pose une échéance, `useOluFrozen()` la suit.
 */

let frozenUntil = 0;
let timer = null;
const listeners = new Set();

function notify() {
  for (const cb of listeners) cb(isOluFrozen());
}

export function isOluFrozen(now = Date.now()) {
  return frozenUntil > now;
}

export function freezeOlu(ms = 1600) {
  const until = Date.now() + Math.max(0, Number(ms) || 0);
  if (until <= frozenUntil) return;
  frozenUntil = until;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    notify();
  }, until - Date.now());
  notify();
}

/** Test helper : lève le gel immédiatement. */
export function resetOluFreeze() {
  frozenUntil = 0;
  if (timer) clearTimeout(timer);
  timer = null;
  notify();
}

export function subscribeOluFreeze(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useOluFrozen() {
  const [frozen, setFrozen] = useState(() => isOluFrozen());
  useEffect(() => subscribeOluFreeze(setFrozen), []);
  return frozen;
}
