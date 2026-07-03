import { useEffect, useState } from 'react';

/** Durée d'affichage (ms) des toasts « longs » (narration, sort refusé). */
export const GL_TOAST_LONG_MS = 6000;
/** Durée d'affichage (ms) des toasts « courts » (changement de tour, nouveau round). */
export const GL_TOAST_SHORT_MS = 4000;

/**
 * État de toast auto-expirant : identique à un `useState(null)` accompagné d'un
 * `useEffect` qui programme la remise à `null` après `durationMs` dès que la valeur
 * devient truthy (timeout nettoyé si la valeur change ou si le composant se démonte).
 *
 * @param {number} durationMs Durée d'affichage avant effacement automatique.
 * @returns {[any, Function]} Paire `[toast, setToast]` (même contrat que `useState`).
 */
export function useTimedToastState(durationMs) {
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(null), durationMs);
    return () => clearTimeout(id);
  }, [toast, durationMs]);

  return [toast, setToast];
}

/**
 * Regroupe les 4 toasts éphémères de l'app GL (narration MJ, changement de tour,
 * nouveau round, sort refusé). Chaque toast garde sa durée et son cycle de vie
 * d'origine ; le regroupement est purement organisationnel (iso-comportement).
 */
export function useGlToasts() {
  const [narrationToast, setNarrationToast] = useTimedToastState(GL_TOAST_LONG_MS); // { text, ts }
  const [turnToast, setTurnToast] = useTimedToastState(GL_TOAST_SHORT_MS); // { teamId, ts }
  const [roundToast, setRoundToast] = useTimedToastState(GL_TOAST_SHORT_MS); // { roundNumber, ts }
  const [spellRejectedToast, setSpellRejectedToast] = useTimedToastState(GL_TOAST_LONG_MS); // { spellName, ts }

  return {
    narrationToast,
    setNarrationToast,
    turnToast,
    setTurnToast,
    roundToast,
    setRoundToast,
    spellRejectedToast,
    setSpellRejectedToast,
  };
}
