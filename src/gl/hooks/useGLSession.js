import { useCallback, useEffect, useMemo, useState } from 'react';
import { clearGlSession, getGlSession, saveGlSession } from '../services/apiGL.js';
import { GL_SESSION_CHANGED_EVENT } from '../services/glSessionEvents.js';

/** Même contenu → même objet : un évènement sans changement ne relance aucun effet. */
function memeSession(a, b) {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch (_) {
    return false;
  }
}

export function useGLSession() {
  const [session, setSession] = useState(() => getGlSession());

  /** Relit le stockage (session d'onglet d'abord, compte ensuite) et aligne l'état React. */
  const relire = useCallback(() => {
    const next = getGlSession();
    setSession((prev) => (memeSession(prev, next) ? prev : next));
  }, []);

  // La session change aussi hors de ce hook : `apiGL` la vide sur un 401 (session expirée,
  // tablette déconnectée par le prof), un autre onglet se connecte ou se déconnecte (`storage`).
  // Sans cette écoute l'état gardait un jeton mort et l'écran restait dans l'application, vide.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onStorage = (evt) => {
      // `key` nul : stockage vidé en bloc. Les autres clés ne concernent pas la session.
      if (evt?.key != null && !String(evt.key).startsWith('gl_')) return;
      relire();
    };
    window.addEventListener(GL_SESSION_CHANGED_EVENT, relire);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(GL_SESSION_CHANGED_EVENT, relire);
      window.removeEventListener('storage', onStorage);
    };
  }, [relire]);

  const updateSession = useCallback((next) => {
    saveGlSession(next);
    setSession(getGlSession());
  }, []);

  const logout = useCallback(() => {
    clearGlSession();
    // Quitter une session d'onglet (équipe, projection) rend la main au compte éventuellement
    // ouvert.
    setSession(getGlSession());
  }, []);

  const auth = useMemo(() => session?.auth || null, [session]);
  const token = useMemo(() => session?.token || null, [session]);

  return {
    session,
    auth,
    token,
    updateSession,
    logout,
  };
}
