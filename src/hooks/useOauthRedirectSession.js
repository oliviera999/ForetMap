import { useEffect } from 'react';

import {
  getAuthClaims,
  getStoredSession,
  saveLegacyStudentSnapshot,
  saveStoredSession,
} from '../services/api';
import { safeLocalStorageSetItem } from '../shared/platform/browserStorage.js';
import {
  resolveOauthErrorMessage,
  decodeBase64UrlJson,
  OAUTH_VISITOR_CREATED_WARNING,
} from '../utils/appShellHelpers';

/**
 * Traitement autonome du retour OAuth Google (extrait de App.jsx, O5) :
 * - lit le fragment `#oauth` / `#oauth_error` posé par la redirection ;
 * - nettoie l'URL (`history.replaceState`) pour ne pas rejouer le fragment ;
 * - décode la charge utile et reconstitue la session (prof ou élève) via les
 *   helpers `services/api`, puis prévient le parent par les setters fournis.
 *
 * Effet « one-shot » au montage, iso-comportement avec l'ancien `useEffect`
 * inline d'App.jsx. Aucun couplage au cœur fetchAll/polling/realtime : le hook
 * ne fait que traduire le fragment d'URL en mises à jour de session.
 *
 * @param {object} handlers
 * @param {(msg: string) => void} handlers.onToast
 * @param {(msg: string) => void} [handlers.onOauthFeedback] Bandeau / toast long (erreurs & avertissements).
 * @param {(user: object | null) => void} handlers.setSessionUser
 * @param {(claims: object | null) => void} handlers.setAuthClaims
 * @param {(isTeacher: boolean) => void} handlers.setIsTeacher
 * @param {(student: object | null) => void} handlers.setStudent
 */
export function useOauthRedirectSession({
  onToast,
  onOauthFeedback,
  setSessionUser,
  setAuthClaims,
  setIsTeacher,
  setStudent,
}) {
  useEffect(() => {
    const hashRaw = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
    if (!hashRaw) return;
    const hashParams = new URLSearchParams(hashRaw);
    const oauthPayload = hashParams.get('oauth');
    const oauthError = hashParams.get('oauth_error');
    if (!oauthPayload && !oauthError) return;

    const cleanUrl = `${window.location.pathname}${window.location.search}`;
    window.history.replaceState({}, document.title, cleanUrl);

    const reportFeedback = (msg) => {
      if (typeof onOauthFeedback === 'function') onOauthFeedback(msg);
      else onToast(msg);
    };

    if (oauthError) {
      reportFeedback(resolveOauthErrorMessage(oauthError));
      return;
    }
    try {
      const payload = decodeBase64UrlJson(oauthPayload);
      if (payload?.type === 'teacher' && payload?.token) {
        safeLocalStorageSetItem('foretmap_teacher_token', payload.token);
        safeLocalStorageSetItem('foretmap_auth_token', payload.token);
        saveStoredSession({
          token: payload.token,
          user: {
            id: payload?.auth?.canonicalUserId || payload?.auth?.userId || null,
            userType: 'teacher',
            displayName: payload?.auth?.displayName || 'Utilisateur',
            avatar_path: null,
          },
        });
        setSessionUser(getStoredSession()?.user || null);
        setAuthClaims(getAuthClaims());
        setIsTeacher(true);
        onToast('Connexion Google réussie.');
        return;
      }
      if (payload?.type === 'student' && payload?.student) {
        const nextStudent = payload.student;
        if (nextStudent?.authToken) {
          safeLocalStorageSetItem('foretmap_auth_token', nextStudent.authToken);
        }
        saveLegacyStudentSnapshot(nextStudent);
        saveStoredSession({
          token: nextStudent?.authToken || getStoredSession()?.token || null,
          user: {
            id: nextStudent?.auth?.canonicalUserId || nextStudent?.id || null,
            userType: 'student',
            displayName:
              nextStudent?.pseudo ||
              `${nextStudent?.first_name || ''} ${nextStudent?.last_name || ''}`.trim() ||
              'Utilisateur',
            email: nextStudent?.email || null,
            avatar_path: nextStudent?.avatar_path ?? nextStudent?.avatarPath ?? null,
          },
          student: nextStudent,
        });
        setStudent(nextStudent);
        setSessionUser(getStoredSession()?.user || null);
        setIsTeacher(false);
        if (payload.accountCreated) {
          // Connecté en visiteur : le bandeau AuthScreen n'est plus monté → toast long.
          onToast(OAUTH_VISITOR_CREATED_WARNING);
        } else {
          onToast('Connexion Google réussie.');
        }
        return;
      }
      reportFeedback('Réponse Google invalide.');
    } catch (_) {
      reportFeedback('Réponse Google illisible.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
