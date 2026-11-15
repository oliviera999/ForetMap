import { useCallback, useMemo, useState } from 'react';
import { clearGlSession, getGlSession, saveGlSession } from '../services/apiGL.js';

export function useGLSession() {
  const [session, setSession] = useState(() => getGlSession());

  const updateSession = useCallback((next) => {
    saveGlSession(next);
    setSession(getGlSession());
  }, []);

  const logout = useCallback(() => {
    clearGlSession();
    // Quitter une session d'équipe (onglet) rend la main au compte éventuellement ouvert.
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
