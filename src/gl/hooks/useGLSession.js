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
    setSession(null);
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
