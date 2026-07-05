import { useCallback, useEffect } from 'react';

import {
  api,
  AccountDeletedError,
  getAuthClaims,
  getStoredSession,
  saveLegacyStudentSnapshot,
  saveStoredSession,
  clearStoredSession,
} from '../services/api';
import {
  safeLocalStorageGetItem,
  safeLocalStorageRemoveItem,
  safeLocalStorageSetItem,
} from '../utils/browserStorage.js';

/**
 * Cycle de vie de la session utilisateur (extrait de App.jsx, D3) : restauration
 * au chargement, fusion des réponses /api/auth/me, prise de contrôle admin et
 * déconnexion forcée. Zéro JSX : le hook reçoit les setters d'état d'App.jsx et
 * retourne les mêmes fonctions qu'avant extraction — iso-comportement strict.
 *
 * @param {object} params
 * @param {{ current: object|null }} params.studentRef Ref session n3beur (useStudentSessionRef).
 * @param {Function} params.setStudent
 * @param {Function} params.setSessionUser
 * @param {Function} params.setAuthClaims
 * @param {Function} params.setSessionValidationError
 * @param {Function} params.setProfilePromotion
 * @param {Function} params.setToast
 * @param {Function} params.setRoleViewMode
 * @param {Function} params.setTab
 * @param {Function} params.setShowStats
 * @param {Function} params.setShowProfile
 * @returns {{
 *   forceLogout: () => void,
 *   updateStudentSession: (nextStudent: object|null) => void,
 *   handleAdminImpersonationApplied: (data: object) => void,
 *   stopAdminImpersonation: () => Promise<void>,
 *   mergeAuthMeResponse: (d: object, opts?: { studentIdForMatch?: string|number }) => void,
 *   validateStudentSession: (savedStudent: object) => Promise<void>,
 * }}
 */
export function useAuthSession({
  studentRef,
  setStudent,
  setSessionUser,
  setAuthClaims,
  setSessionValidationError,
  setProfilePromotion,
  setToast,
  setRoleViewMode,
  setTab,
  setShowStats,
  setShowProfile,
}) {
  // Called from anywhere when a 401-deleted is detected
  const forceLogout = useCallback(() => {
    clearStoredSession();
    setStudent(null);
    setSessionUser(null);
    setAuthClaims(null);
    setSessionValidationError(false);
    setProfilePromotion(null);
    setToast('Votre compte a été supprimé par un responsable.');
  }, [
    setAuthClaims,
    setProfilePromotion,
    setSessionUser,
    setSessionValidationError,
    setStudent,
    setToast,
  ]);

  const updateStudentSession = useCallback(
    (nextStudent) => {
      setSessionValidationError(false);
      if (!nextStudent || typeof nextStudent !== 'object') {
        studentRef.current = nextStudent;
        setStudent(nextStudent);
        return;
      }
      const prev = studentRef.current;
      const base = prev && typeof prev === 'object' ? prev : {};
      const avatarPath =
        nextStudent.avatar_path ?? nextStudent.avatarPath ?? base.avatar_path ?? null;
      const merged = {
        ...base,
        ...nextStudent,
        avatar_path: avatarPath,
        auth: nextStudent.auth ?? base.auth,
      };
      studentRef.current = merged;
      setStudent(merged);
      saveLegacyStudentSnapshot(merged);
      const sessionToken = getStoredSession()?.token || null;
      const nextToken =
        typeof merged.authToken === 'string' && merged.authToken.trim() !== ''
          ? merged.authToken.trim()
          : sessionToken;
      saveStoredSession({
        token: nextToken,
        user: {
          id: merged.auth?.canonicalUserId || merged.id || null,
          userType: 'student',
          displayName:
            merged.pseudo ||
            `${merged.first_name || ''} ${merged.last_name || ''}`.trim() ||
            'Utilisateur',
          email: merged.email || null,
          avatar_path: avatarPath,
        },
        student: merged,
      });
      setSessionUser(getStoredSession()?.user || null);
    },
    [setSessionUser, setSessionValidationError, setStudent, studentRef],
  );

  const handleAdminImpersonationApplied = useCallback(
    (data) => {
      if (!data?.authToken) return;
      const token = String(data.authToken).trim();
      safeLocalStorageSetItem('foretmap_auth_token', token);
      safeLocalStorageSetItem('foretmap_teacher_token', token);
      const auth = data.auth;
      if (auth?.userType === 'student' && data.profile) {
        updateStudentSession({
          ...data.profile,
          authToken: token,
          auth,
        });
      } else {
        safeLocalStorageRemoveItem('foretmap_student');
        const p = data.profile || {};
        const displayName =
          [p.first_name, p.last_name].filter(Boolean).join(' ').trim() ||
          p.display_name ||
          p.email ||
          auth?.roleDisplayName ||
          'Utilisateur';
        saveStoredSession({
          token,
          user: {
            id: auth?.canonicalUserId || auth?.userId,
            userType: 'teacher',
            displayName,
            email: p.email || null,
            avatar_path: p.avatar_path || null,
          },
          student: null,
        });
        setStudent(null);
        studentRef.current = null;
      }
      setAuthClaims(getAuthClaims());
      setSessionUser(getStoredSession()?.user || null);
      setRoleViewMode('native');
      setTab('map');
      setShowStats(false);
      setShowProfile(false);
      setToast('Prise de contrôle : vous voyez l’application comme l’utilisateur sélectionné.');
    },
    [
      setAuthClaims,
      setRoleViewMode,
      setSessionUser,
      setShowProfile,
      setShowStats,
      setStudent,
      setTab,
      setToast,
      studentRef,
      updateStudentSession,
    ],
  );

  const stopAdminImpersonation = useCallback(async () => {
    try {
      const data = await api('/api/auth/admin/impersonate/stop', 'POST');
      if (!data?.authToken) {
        setToast('Réponse serveur invalide');
        return;
      }
      const token = String(data.authToken).trim();
      safeLocalStorageSetItem('foretmap_auth_token', token);
      safeLocalStorageSetItem('foretmap_teacher_token', token);
      safeLocalStorageRemoveItem('foretmap_student');
      saveStoredSession({
        token,
        user: {
          id: data.auth?.canonicalUserId || data.auth?.userId,
          userType: 'teacher',
          displayName: data.auth?.roleDisplayName || 'Utilisateur',
          email: null,
          avatar_path: null,
        },
        student: null,
      });
      setStudent(null);
      studentRef.current = null;
      /* Anciennement `setIsTeacher(true)` en dur : isTeacher est maintenant dérivé des claims du
         jeton admin restauré (qui porte `teacher.access`) — même résultat. */
      setAuthClaims(getAuthClaims());
      setSessionUser(getStoredSession()?.user || null);
      setRoleViewMode('native');
      setTab('map');
      setToast('Vous êtes reconnecté avec votre compte administrateur.');
    } catch (e) {
      setToast(e.message || 'Impossible de quitter la prise de contrôle');
    }
  }, [setAuthClaims, setRoleViewMode, setSessionUser, setStudent, setTab, setToast, studentRef]);

  const mergeAuthMeResponse = useCallback(
    (d, opts = {}) => {
      const { studentIdForMatch } = opts;
      if (!d || typeof d !== 'object' || !d.auth) return;
      const { auth } = d;
      if (typeof d.refreshedToken === 'string' && d.refreshedToken.trim() !== '') {
        const trimmed = d.refreshedToken.trim();
        safeLocalStorageSetItem('foretmap_auth_token', trimmed);
        const sess = getStoredSession() || {};
        saveStoredSession({ ...sess, token: trimmed });
      }
      setAuthClaims(getAuthClaims());
      if (auth.userType === 'teacher') {
        setSessionUser((prev) => ({
          id: auth.canonicalUserId || prev?.id || null,
          userType: 'teacher',
          displayName: auth.roleDisplayName || prev?.displayName || 'Utilisateur',
          email: prev?.email || null,
          avatar_path: prev?.avatar_path || null,
        }));
      }
      if (d.autoProfilePromotion && auth.userType === 'student') {
        if (!studentIdForMatch || String(auth.userId) === String(studentIdForMatch)) {
          setProfilePromotion(d.autoProfilePromotion);
        }
      }
      if (
        auth.userType === 'student' &&
        (d.taskEnrollment != null ||
          typeof d.forumParticipate === 'boolean' ||
          typeof d.contextCommentParticipate === 'boolean')
      ) {
        setStudent((prev) => {
          if (!prev || String(prev.id) !== String(auth.userId)) return prev;
          return {
            ...prev,
            ...(d.taskEnrollment != null ? { taskEnrollment: d.taskEnrollment } : {}),
            ...(typeof d.forumParticipate === 'boolean'
              ? { forumParticipate: d.forumParticipate }
              : {}),
            ...(typeof d.contextCommentParticipate === 'boolean'
              ? { contextCommentParticipate: d.contextCommentParticipate }
              : {}),
          };
        });
      }
    },
    [setAuthClaims, setProfilePromotion, setSessionUser, setStudent],
  );

  const validateStudentSession = useCallback(
    async (savedStudent) => {
      if (!savedStudent?.id) return;
      try {
        const fresh = await api('/api/students/register', 'POST', { studentId: savedStudent.id });
        updateStudentSession(fresh);
      } catch (err) {
        if (err instanceof AccountDeletedError || err.deleted) {
          forceLogout();
          return;
        }
        console.error('[ForetMap] validation session n3beur', err);
        setSessionValidationError(true);
        setToast('Connexion instable: session n3beur non vérifiée.');
      }
    },
    [forceLogout, setSessionValidationError, setToast, updateStudentSession],
  );

  // Restore session — validates against server on load
  useEffect(() => {
    const saved = safeLocalStorageGetItem('foretmap_student', null);
    if (saved) {
      try {
        const s = JSON.parse(saved);
        setStudent(s); // show app immediately with cached data
        validateStudentSession(s);
      } catch (e) {
        console.error('[ForetMap] lecture session locale', e);
      }
    }
    const session = getStoredSession();
    if (session?.user && !session?.student) {
      setSessionUser(session.user);
    }
  }, [setSessionUser, setStudent, validateStudentSession]);

  return {
    forceLogout,
    updateStudentSession,
    handleAdminImpersonationApplied,
    stopAdminImpersonation,
    mergeAuthMeResponse,
    validateStudentSession,
  };
}
