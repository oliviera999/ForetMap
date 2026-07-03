import { useCallback } from 'react';
import { apiGL } from '../services/apiGL.js';
import { defaultTabForGlAuth } from '../utils/glAppShellHelpers.js';

/**
 * État de session GL côté staff : prise de contrôle (impersonation) d'un joueur
 * et retour à la session d'origine. Extrait d'AppGL (audit §3.5) sans changement
 * de comportement : les setters d'orchestration (onglet, vue, partie active,
 * erreur) restent possédés par AppGL / useGlGameRuntime et sont injectés ici
 * (références stables de setters useState).
 *
 * @param {object} deps
 * @param {(patch: object) => void} deps.updateSession   Mise à jour token/auth (useGLSession).
 * @param {(msg: string) => void}   deps.setError        Bandeau d'erreur global d'AppGL.
 * @param {(tab: string) => void}   deps.setTab          Navigation d'onglet d'AppGL.
 * @param {(mode: string) => void}  deps.setGlViewMode   Mode de vue staff (native | player).
 * @param {(id: number|null) => void} deps.setActiveGameId Partie active (useGlGameRuntime).
 */
export function useGlSessionState({
  updateSession,
  setError,
  setTab,
  setGlViewMode,
  setActiveGameId,
}) {
  const applyGlImpersonation = useCallback(
    (payload) => {
      if (!payload?.authToken || !payload?.auth) {
        setError('Réponse serveur invalide');
        return;
      }
      setGlViewMode('native');
      updateSession({ token: payload.authToken, auth: payload.auth });
      const nextGameId = payload.auth?.gameId != null ? Number(payload.auth.gameId) : null;
      if (Number.isFinite(nextGameId) && nextGameId > 0) {
        setActiveGameId(nextGameId);
      }
      setTab('maps');
      setError('');
    },
    // Les setters injectés sont des setters useState : références stables.
    [updateSession, setError, setTab, setGlViewMode, setActiveGameId],
  );

  const stopGlImpersonation = useCallback(async () => {
    try {
      const payload = await apiGL('/api/gl/auth/admin/impersonate/stop', 'POST');
      if (!payload?.authToken || !payload?.auth) {
        setError('Réponse serveur invalide');
        return;
      }
      setGlViewMode('native');
      updateSession({ token: payload.authToken, auth: payload.auth });
      setTab(defaultTabForGlAuth(payload.auth));
      setError('');
    } catch (err) {
      setError(err.message || 'Impossible de quitter la prise de contrôle');
    }
  }, [updateSession, setError, setTab, setGlViewMode]);

  return { applyGlImpersonation, stopGlImpersonation };
}
