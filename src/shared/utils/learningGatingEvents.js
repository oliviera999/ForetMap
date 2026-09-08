/**
 * Événement `window` émis quand l'état du conditionnement d'un lecteur change : une question
 * réussie, une ressource validée, un verrou posé. Les résumés (`useLearningGatingSummary`)
 * l'écoutent et se rechargent : la pastille passe de « ? » à « ✓ » sans fermer la fenêtre,
 * dans les deux applications, sans câbler chaque écran (docs/AUDIT_VALIDATION_QUIZ_2026-09.md, D4).
 */
export const LEARNING_GATING_CHANGED_EVENT = 'learning-gating:changed';

/** Signale un changement (silencieux hors navigateur). */
export function notifyLearningGatingChanged(detail = null) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  try {
    window.dispatchEvent(new CustomEvent(LEARNING_GATING_CHANGED_EVENT, { detail }));
  } catch (_) {
    /* un navigateur sans CustomEvent : l'annonce se rafraîchira à la prochaine ouverture */
  }
}
