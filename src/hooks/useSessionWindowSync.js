import { useEffect } from 'react';

import { getAuthClaims, getStoredSession } from '../services/api';

/**
 * Synchronisation des états de session React depuis les évènements `window`
 * (extrait de App.jsx, O5).
 *
 * Regroupe les deux effets qui réalignent `authClaims` / `isTeacher` /
 * `sessionUser` (et un toast) sur le `localStorage` / JWT courant lorsqu'une
 * source externe modifie la session, exactement comme les anciens `useEffect`
 * inline d'App.jsx :
 *
 * - `foretmap_teacher_expired` : la session n3boss a expiré → on coupe
 *   `isTeacher`, on vide `authClaims` / `sessionUser` et on affiche un toast ;
 * - `foretmap_session_changed` (PIN, OAuth…) : émis avant le callback React du
 *   modal → on relit `getStoredSession()` / `getAuthClaims()` après un tick
 *   (coalescence + stabilisation du `localStorage`) et on réaligne les états.
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
 */
export function useSessionWindowSync({ setAuthClaims, setIsTeacher, setSessionUser, setToast }) {
  useEffect(() => {
    const onExpired = () => {
      setIsTeacher(false);
      setAuthClaims(null);
      setSessionUser(null);
      setToast('Session n3boss expirée.');
    };
    window.addEventListener('foretmap_teacher_expired', onExpired);
    return () => window.removeEventListener('foretmap_teacher_expired', onExpired);
  }, [setAuthClaims, setIsTeacher, setSessionUser, setToast]);

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
}
