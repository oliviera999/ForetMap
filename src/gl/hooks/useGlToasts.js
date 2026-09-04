import {
  TIMED_TOAST_LONG_MS,
  TIMED_TOAST_SHORT_MS,
  useTimedToastState,
} from '../../shared/hooks/useTimedToastState.js';

/** Durées G&L : alias des durées partagées (`useTimedToastState`, lot 3). */
export const GL_TOAST_LONG_MS = TIMED_TOAST_LONG_MS;
export const GL_TOAST_SHORT_MS = TIMED_TOAST_SHORT_MS;
export { useTimedToastState };

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
