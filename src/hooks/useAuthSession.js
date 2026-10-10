import { useCallback, useEffect } from 'react';

import {
  api,
  AccountDeletedError,
  getAuthClaims,
  getAuthToken,
  getStoredSession,
  pickNewestAuthToken,
  saveStoredSession,
  clearStoredSession,
} from '../services/api';
import { isOfflineError, subscribeNetworkStatus } from '../shared/networkStatus.js';
import { isPasswordChangeRequiredError } from '../utils/passwordChangeRequired.js';

/** Toast de la déconnexion forcée par défaut (401 `deleted: true`). */
export const ACCOUNT_DELETED_MESSAGE = 'Votre compte a été supprimé par un responsable.';
/** Toast d'une session expirée ou révoquée (mot de passe changé, compte désactivé…). */
export const SESSION_EXPIRED_MESSAGE = 'Session expirée : veuillez vous reconnecter.';
/** Session fermée parce que la double authentification est désormais exigée pour ce compte. */
export const MFA_REQUIRED_MESSAGE =
  'La double authentification est désormais exigée pour votre compte : reconnectez-vous avec votre code.';

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
 *   forceLogout: (options?: { message?: string }) => void,
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
  // Appelé depuis n'importe où sur un 401 `deleted: true` — ou, via
  // `useSessionWindowSync`, sur une session expirée / révoquée (CDG-27) : même chemin,
  // seul le message change.
  const forceLogout = useCallback(
    (options = {}) => {
      clearStoredSession();
      setStudent(null);
      setSessionUser(null);
      setAuthClaims(null);
      setSessionValidationError(false);
      setProfilePromotion(null);
      setToast(options?.message || ACCOUNT_DELETED_MESSAGE);
    },
    [
      setAuthClaims,
      setProfilePromotion,
      setSessionUser,
      setSessionValidationError,
      setStudent,
      setToast,
    ],
  );

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
      // Jeton courant = le plus récent entre celui proposé par l'appelant (connexion, prise
      // de contrôle) et celui de la session : le jeton d'origine gardé par `base.authToken`
      // ne doit jamais écraser un jeton renouvelé (CDG-28).
      const nextToken = pickNewestAuthToken(nextStudent.authToken, getAuthToken());
      const merged = {
        ...base,
        ...nextStudent,
        avatar_path: avatarPath,
        auth: nextStudent.auth ?? base.auth,
        ...(nextToken ? { authToken: nextToken } : {}),
      };
      studentRef.current = merged;
      setStudent(merged);
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
      const auth = data.auth;
      if (auth?.userType === 'student' && data.profile) {
        updateStudentSession({
          ...data.profile,
          authToken: token,
          auth,
        });
      } else {
        const p = data.profile || {};
        const displayName =
          [p.first_name, p.last_name].filter(Boolean).join(' ').trim() ||
          p.display_name ||
          p.email ||
          auth?.displayName ||
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
      saveStoredSession({
        token,
        user: {
          id: data.auth?.canonicalUserId || data.auth?.userId,
          userType: 'teacher',
          displayName:
            data.auth?.displayName ||
            data.display_name ||
            `${data.first_name || ''} ${data.last_name || ''}`.trim() ||
            data.pseudo ||
            data.email ||
            'Utilisateur',
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
        // `student.authToken` est dérivé de `session.token` à la lecture : rien d'autre à aligner.
        const sess = getStoredSession() || {};
        saveStoredSession({ ...sess, token: trimmed });
        if (studentRef.current && typeof studentRef.current === 'object') {
          studentRef.current = { ...studentRef.current, authToken: trimmed };
          setStudent((prev) =>
            prev && typeof prev === 'object' ? { ...prev, authToken: trimmed } : prev,
          );
        }
      }
      // Toujours fusionner d.auth (permissions fraîches BDD) — le JWT seul peut être périmé
      // après un changement de matrice sans changement de profil.
      const fromJwt = getAuthClaims() || {};
      setAuthClaims({
        ...fromJwt,
        userType: auth.userType ?? fromJwt.userType,
        userId: auth.userId ?? fromJwt.userId,
        canonicalUserId: auth.canonicalUserId ?? fromJwt.canonicalUserId,
        roleId: auth.roleId ?? fromJwt.roleId,
        roleSlug: auth.roleSlug ?? fromJwt.roleSlug,
        roleDisplayName: auth.roleDisplayName ?? fromJwt.roleDisplayName,
        permissions: Array.isArray(auth.permissions) ? auth.permissions : fromJwt.permissions,
        nativePrivileged:
          typeof auth.nativePrivileged === 'boolean'
            ? auth.nativePrivileged
            : fromJwt.nativePrivileged,
        groupIds: Array.isArray(auth.groupIds) ? auth.groupIds : fromJwt.groupIds,
        impersonating: auth.impersonating ?? fromJwt.impersonating,
        impersonatedBy: auth.impersonatedBy ?? fromJwt.impersonatedBy,
      });
      if (auth.userType === 'teacher') {
        // `d.profile` (compte enseignant) fait foi ; à défaut, on garde ce qui est connu —
        // sans quoi mascotte et niveau d'affichage sautaient à chaque renouvellement de jeton.
        const profile = d.profile && typeof d.profile === 'object' ? d.profile : null;
        const pick = (key, prev) =>
          profile && key in profile ? profile[key] : (prev?.[key] ?? null);
        setSessionUser((prev) => ({
          ...(prev && typeof prev === 'object' ? prev : {}),
          id: auth.canonicalUserId || prev?.id || null,
          userType: 'teacher',
          // Le nom du compte : celui porté par la session ré-émise, sinon celui déjà connu —
          // jamais le nom du profil (« n3boss », « Admin »), CDG-30.
          displayName: auth.displayName || prev?.displayName || 'Utilisateur',
          email: pick('email', prev),
          avatar_path: pick('avatar_path', prev),
          pseudo: pick('pseudo', prev),
          description: pick('description', prev),
          visit_mascot_catalog_id: pick('visit_mascot_catalog_id', prev),
          biodiv_pedago_level: pick('biodiv_pedago_level', prev),
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
    [setAuthClaims, setProfilePromotion, setSessionUser, setStudent, studentRef],
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
        // Mot de passe provisoire ou compromis à changer : la session est valide, mais tout
        // attend le changement. `api()` a déjà prévenu le shell, qui ouvre « Mon profil » —
        // pas d'alerte « connexion instable ».
        if (isPasswordChangeRequiredError(err)) return;
        if (isOfflineError(err)) {
          // Ouverture en mode avion : la session locale suffit pour travailler. La
          // vérification attend le retour du réseau, sans alerte « connexion instable ».
          const unsubscribe = subscribeNetworkStatus((online) => {
            if (!online) return;
            unsubscribe();
            if (String(getStoredSession()?.student?.id || '') !== String(savedStudent.id)) return;
            void validateStudentSession(savedStudent);
          });
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
    const session = getStoredSession();
    if (session?.student) {
      setStudent(session.student); // show app immediately with cached data
      validateStudentSession(session.student);
    }
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
