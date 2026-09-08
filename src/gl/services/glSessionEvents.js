/**
 * Événement `window` émis à chaque changement de session G&L (connexion, déconnexion,
 * expiration) — pendant de `foretmap_session_changed`. Module à part : `apiGL.js` est
 * remplacé en bloc par les tests (`vi.mock`), et une constante qui y vivrait manquerait alors
 * aux hooks qui l'importent (docs/AUDIT_VALIDATION_QUIZ_2026-09.md, D4).
 */
export const GL_SESSION_CHANGED_EVENT = 'gl_session_changed';

export function dispatchGlSessionChanged() {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  try {
    window.dispatchEvent(new CustomEvent(GL_SESSION_CHANGED_EVENT));
  } catch (_) {
    /* environnement sans CustomEvent */
  }
}
