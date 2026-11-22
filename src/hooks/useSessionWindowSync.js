import { useEffect, useRef } from 'react';

import {
  getAuthClaims,
  getStoredSession,
  getStoredSessionAccountKey,
  SESSION_CLOSED_ELSEWHERE_REASON,
  SESSION_STORAGE_KEY,
} from '../services/api';
import {
  ACCOUNT_DELETED_MESSAGE,
  MFA_REQUIRED_MESSAGE,
  SESSION_CLOSED_ELSEWHERE_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
} from './useAuthSession';

/** Raisons de révocation liées à la double authentification (`middleware/requireTeacher.js`). */
const MFA_REVOCATION_REASONS = new Set(['mfa_required']);

/**
 * Synchronisation des états de session React depuis les évènements `window`
 * (extrait de App.jsx, O5).
 *
 * Regroupe les deux effets qui réalignent `authClaims` / `isTeacher` /
 * `sessionUser` (et un toast) sur le `localStorage` / JWT courant lorsqu'une
 * source externe modifie la session, exactement comme les anciens `useEffect`
 * inline d'App.jsx :
 *
 * - `foretmap_teacher_expired` : la session (élève ou prof) a expiré ou été révoquée →
 *   on coupe `isTeacher` puis on ferme la session par `forceLogout` (état `student` à
 *   `null`, stockage vidé, toast « Session expirée » ou « Compte supprimé » selon
 *   `event.detail.deleted`) — CDG-27 : sans `forceLogout`, seuls `authClaims` /
 *   `sessionUser` sont vidés et un élève restait dans l'application ;
 * - `foretmap_session_changed` (PIN, OAuth…) : émis avant le callback React du
 *   modal → on relit `getStoredSession()` / `getAuthClaims()` après un tick
 *   (coalescence + stabilisation du `localStorage`) et on réaligne les états ;
 * - `storage` sur `foretmap_session` (audit ForetMap du 19/11, F1) : la session a changé dans
 *   un **autre onglet**. Compte disparu → `forceLogout` sans toucher au stockage ; autre
 *   compte → rechargement de la page, pour reconstruire tout l'état (droits, onglets,
 *   données) sur le nouveau compte. Un simple renouvellement de jeton (même compte) ne fait
 *   rien.
 *
 * Iso-comportement : mêmes écouteurs, même report d'un tick via `setTimeout`,
 * mêmes nettoyages (removeEventListener + clearTimeout) que dans App.jsx avant
 * extraction. Aucun état n'est déplacé : seuls les effets sont encapsulés, les
 * setters restent gérés par App.jsx et sont passés en paramètres.
 *
 * @param {object} params
 * @param {(claims: object|null) => void} params.setAuthClaims
 * @param {(value: boolean) => void} params.setIsTeacher
 * @param {(user: object|null) => void} params.setSessionUser
 * @param {(message: string|null) => void} params.setToast
 * @param {(options?: { message?: string, keepStorage?: boolean }) => void} [params.forceLogout]
 *   Déconnexion forcée d'`useAuthSession` (ferme aussi la session élève).
 * @param {() => void} [params.reloadPage] Rechargement de la page quand un autre compte s'est
 *   connecté dans un autre onglet (injectable pour les tests ; défaut `location.reload()`).
 */
export function useSessionWindowSync({
  setAuthClaims,
  setIsTeacher,
  setSessionUser,
  setToast,
  forceLogout,
  reloadPage,
}) {
  useEffect(() => {
    const onExpired = (event) => {
      const reason = event?.detail?.reason;
      const message = event?.detail?.deleted
        ? ACCOUNT_DELETED_MESSAGE
        : MFA_REVOCATION_REASONS.has(reason)
          ? MFA_REQUIRED_MESSAGE
          : reason === SESSION_CLOSED_ELSEWHERE_REASON
            ? SESSION_CLOSED_ELSEWHERE_MESSAGE
            : SESSION_EXPIRED_MESSAGE;
      setIsTeacher(false);
      if (typeof forceLogout === 'function') {
        forceLogout(event?.detail?.keepStorage ? { message, keepStorage: true } : { message });
        return;
      }
      setAuthClaims(null);
      setSessionUser(null);
      setToast(message);
    };
    window.addEventListener('foretmap_teacher_expired', onExpired);
    return () => window.removeEventListener('foretmap_teacher_expired', onExpired);
  }, [forceLogout, setAuthClaims, setIsTeacher, setSessionUser, setToast]);

  /* `saveStoredSession` (PIN, OAuth…) émet avant le callback React du modal : réaligner claims / isTeacher sur le JWT. */
  useEffect(() => {
    let t = 0;
    const syncAuthFromStoredSession = () => {
      window.clearTimeout(t);
      /* Reporter d’un tick : coalescer avec `PinModal` / `mergeAuthMeResponse` et laisser le `localStorage` se stabiliser. */
      t = window.setTimeout(() => {
        const sess = getStoredSession();
        const claims = getAuthClaims();
        setAuthClaims(claims);
        setIsTeacher(
          Array.isArray(claims?.permissions) && claims.permissions.includes('teacher.access'),
        );
        setSessionUser(sess?.user || null);
      }, 0);
    };
    window.addEventListener('foretmap_session_changed', syncAuthFromStoredSession);
    return () => {
      window.removeEventListener('foretmap_session_changed', syncAuthFromStoredSession);
      window.clearTimeout(t);
    };
  }, [setAuthClaims, setIsTeacher, setSessionUser]);

  /* F1 : compte affiché par CET onglet. Suivi au montage et à chaque écriture locale
     (`foretmap_session_changed`) ; comparé au stockage quand un autre onglet le modifie. */
  const displayedAccountRef = useRef(null);
  const forceLogoutRef = useRef(forceLogout);
  forceLogoutRef.current = forceLogout;
  const reloadPageRef = useRef(reloadPage);
  reloadPageRef.current = reloadPage;
  useEffect(() => {
    displayedAccountRef.current = getStoredSessionAccountKey();
    const onLocalChange = () => {
      displayedAccountRef.current = getStoredSessionAccountKey();
    };
    const onStorage = (event) => {
      // `key === null` : `localStorage.clear()` dans un autre onglet.
      if (event?.key != null && event.key !== SESSION_STORAGE_KEY) return;
      const shown = displayedAccountRef.current || '';
      const next = getStoredSessionAccountKey();
      // Onglet sans session (écran de connexion) ou même compte (jeton renouvelé) : rien.
      if (!shown || next === shown) return;
      if (!next) {
        displayedAccountRef.current = '';
        const logout = forceLogoutRef.current;
        if (typeof logout === 'function') {
          logout({ message: SESSION_CLOSED_ELSEWHERE_MESSAGE, keepStorage: true });
        }
        return;
      }
      // Un autre compte s'est connecté ailleurs : cet onglet enverrait son jeton sous
      // l'identité affichée de l'ancien. Recharger reconstruit tout sur le bon compte.
      displayedAccountRef.current = next;
      if (typeof reloadPageRef.current === 'function') reloadPageRef.current();
      else window.location.reload();
    };
    window.addEventListener('foretmap_session_changed', onLocalChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('foretmap_session_changed', onLocalChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
}
