import { useCallback, useMemo, useState } from 'react';
import {
  getAuthClaims,
  getAuthToken,
  pickNewestAuthToken,
  saveStoredSession,
  clearStoredSession,
  getAuthUserId,
} from '../services/api';
import {
  clearLocalDataForAccount,
  clearOfflinePhotosForAccount,
  countPendingLocalActions,
  notifyServerLogout,
  pendingLossConfirmationMessage,
  purgeCachedAuthenticatedApi,
  purgeCachedUserMedia,
} from '../utils/localDataCleanup';
import { clearOutboxMirror } from '../services/offlineOutboxMirror.js';
import { useAuthSession } from './useAuthSession';
import { useOauthRedirectSession } from './useOauthRedirectSession';
import { useSessionWindowSync } from './useSessionWindowSync';
import { useRoleViewModeReset } from './useRoleViewModeReset';
import { useAuthMeHydration } from './useAuthMeHydration';
import { saveVisitMascotPreference } from '../services/visitMascotPreference.js';
import { saveDiscoveryTourSeen } from '../services/discoveryTourSeen.js';
import { mergeDiscoveryTourSeenMaps } from '../shared/tour/mergeDiscoveryTourSeenMaps.js';
import { isVisitorLikeRole } from '../utils/appAccess';
import { DEFAULT_USER_LABEL, formatFullName } from '../utils/appIdentity';
import { normalizePedagoLevel } from '../utils/biodivPedagoLevel.js';
import { sortLearnerNiveaux } from '../utils/pedagoScales.js';

/**
 * Cycle de vie de la session du shell `App` — extrait tel quel d'`App.jsx` (lot 6) :
 * retour OAuth, restauration et hydratation (`/api/auth/me`), synchronisation entre
 * fenêtres, déconnexion forcée, connexion depuis l'écran d'accueil, déconnexion complète,
 * mise à jour du profil, et les données « de compte » qui suivent la session (parcours de
 * découverte vus, niveaux pédagogiques des groupes, mascotte de visite).
 *
 * Les états `student` / `sessionUser` / `authClaims` restent déclarés dans `App` (ils sont
 * lus par presque tous les hooks du shell) et sont passés ici avec leurs setters. L'ordre
 * des hooks à effets est celui d'origine : OAuth → `useAuthSession` →
 * `useSessionWindowSync` → `useRoleViewModeReset` → `useAuthMeHydration`.
 *
 * @param {object} params Voir la déstructuration ci-dessous (états et setters du shell).
 */
export function useAppSession({
  studentRef,
  student,
  setStudent,
  sessionUser,
  setSessionUser,
  authClaims,
  setAuthClaims,
  isTeacher,
  isTeacherAccount,
  setSessionValidationError,
  setProfilePromotion,
  setToast,
  setOauthFeedback,
  setOauthMfaChallenge,
  setRoleViewMode,
  setTab,
  setShowStats,
  setShowProfile,
  markPasswordChangeRequired,
  publicSettings,
}) {
  /** Progression des visites guidées liée au compte (null = pas encore hydratée). */
  const [discoveryTourSeen, setDiscoveryTourSeen] = useState(null);
  const [discoveryTourSeenReady, setDiscoveryTourSeenReady] = useState(false);
  /** Niveaux pédagogiques des groupes dont l'utilisateur est membre (`/api/auth/me`). */
  const [biodivGroupPedagoLevels, setBiodivGroupPedagoLevels] = useState([]);
  /** Niveaux du programme des classes de l'utilisateur (cycle 3, cycle 4…), même source. */
  const [biodivGroupCurriculumNiveaux, setBiodivGroupCurriculumNiveaux] = useState([]);

  /* isTeacher est désormais dérivé d'authClaims : le `setIsTeacher` attendu par le hook OAuth
     réaligne authClaims sur le jeton fraîchement stocké. Indispensable pour la branche élève,
     qui appelait `setIsTeacher(false)` sans poser authClaims (jeton élève déjà en storage). */
  const syncAuthClaimsFromStoredToken = useCallback(() => {
    setAuthClaims(getAuthClaims());
  }, [setAuthClaims]);
  useOauthRedirectSession({
    onToast: setToast,
    onOauthFeedback: setOauthFeedback,
    setSessionUser,
    setAuthClaims,
    setIsTeacher: syncAuthClaimsFromStoredToken,
    setStudent,
    onMfaChallenge: setOauthMfaChallenge,
  });

  /**
   * Choix de mascotte d'un **compte connecté** : enregistré dans le compte (donc portable
   * d'un appareil à l'autre), et non plus dans le stockage local du navigateur. La session
   * en mémoire est mise à jour dans la foulée pour que « Mon profil » reste cohérent.
   * L'affichage est déjà optimiste côté hook : un échec réseau ne bloque pas la visite.
   */
  const persistVisitMascotPreference = useCallback(
    async (mascotId) => {
      const value = String(mascotId || '').trim();
      const next = value || null;
      setStudent((prev) => (prev ? { ...prev, visit_mascot_catalog_id: next } : prev));
      setSessionUser((prev) => (prev ? { ...prev, visit_mascot_catalog_id: next } : prev));
      try {
        await saveVisitMascotPreference(value);
      } catch (_) {
        /* silencieux : la valeur serveur reprend la main au prochain chargement de session */
      }
    },
    [setSessionUser, setStudent],
  );
  const onPersistVisitMascotId = useMemo(
    () => (sessionUser || student ? persistVisitMascotPreference : null),
    [sessionUser, student, persistVisitMascotPreference],
  );

  /** Marque un parcours vu côté compte (merge serveur) ; le cache local est déjà à jour. */
  const persistDiscoveryTourSeen = useCallback((tabKey) => {
    if (!tabKey) return;
    setDiscoveryTourSeen((prev) => mergeDiscoveryTourSeenMaps(prev, { [tabKey]: true }));
    void saveDiscoveryTourSeen({ [tabKey]: true })
      .then((serverSeen) => {
        if (serverSeen && typeof serverSeen === 'object') {
          setDiscoveryTourSeen((prev) => mergeDiscoveryTourSeenMaps(prev, serverSeen));
        }
      })
      .catch(() => {
        /* best-effort : le prochain /me réalignera */
      });
  }, []);

  // D3 — cycle de vie session (restauration, /api/auth/me, impersonation admin, logout forcé).
  const {
    forceLogout: forceLogoutBase,
    updateStudentSession,
    handleAdminImpersonationApplied,
    stopAdminImpersonation,
    mergeAuthMeResponse: mergeAuthMeResponseBase,
    validateStudentSession,
  } = useAuthSession({
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
  });

  const mergeAuthMeResponse = useCallback(
    (d, opts = {}) => {
      mergeAuthMeResponseBase(d, opts);
      if (!d || typeof d !== 'object' || !d.auth) return;
      const fromServer =
        d.discoveryTourSeen && typeof d.discoveryTourSeen === 'object' ? d.discoveryTourSeen : {};
      setDiscoveryTourSeen((prev) => mergeDiscoveryTourSeenMaps(prev, fromServer));
      setDiscoveryTourSeenReady(true);
      if (Array.isArray(d.biodivGroupPedagoLevels)) {
        setBiodivGroupPedagoLevels(
          d.biodivGroupPedagoLevels.map(normalizePedagoLevel).filter(Boolean),
        );
      }
      if (Array.isArray(d.biodivGroupCurriculumNiveaux)) {
        setBiodivGroupCurriculumNiveaux(sortLearnerNiveaux(d.biodivGroupCurriculumNiveaux));
      }
      // Restauration / rafraîchissement de session : le serveur relit le drapeau en base.
      if (typeof d.passwordMustReset === 'boolean') {
        markPasswordChangeRequired(d.passwordMustReset);
      }
    },
    [markPasswordChangeRequired, mergeAuthMeResponseBase],
  );

  const forceLogout = useCallback(
    (options) => {
      setDiscoveryTourSeen(null);
      setDiscoveryTourSeenReady(false);
      setBiodivGroupPedagoLevels([]);
      setBiodivGroupCurriculumNiveaux([]);
      markPasswordChangeRequired(false);
      forceLogoutBase(options);
    },
    [forceLogoutBase, markPasswordChangeRequired],
  );
  /* Les deux écouteurs de useSessionWindowSync posent déjà authClaims de façon cohérente
     (null à l'expiration, claims relus au changement de session) : le setIsTeacher legacy
     devient un no-op, isTeacher étant dérivé d'authClaims. Une session expirée ou révoquée
     (401 `SESSION_REVOKED`) passe par `forceLogout` pour fermer aussi la session élève. */
  const setIsTeacherNoop = useCallback(() => {}, []);
  useSessionWindowSync({
    setAuthClaims,
    setIsTeacher: setIsTeacherNoop,
    setSessionUser,
    setToast,
    forceLogout,
  });

  useRoleViewModeReset({
    roleSlug: authClaims?.roleSlug,
    userId: authClaims?.userId,
    isTeacher,
    setRoleViewMode,
  });

  useAuthMeHydration({ mergeAuthMeResponse });

  /** Session prof en mémoire après édition du profil (nom affiché, avatar, mascotte). */
  const updateTeacherSession = useCallback(
    (updatedUser) => {
      // Jeton ré-émis par l'appelant (changement de mot de passe : l'ancien est révoqué par
      // l'époque) → jeton courant, même règle que `updateStudentSession` (CDG-28).
      const nextToken = updatedUser?.authToken
        ? pickNewestAuthToken(updatedUser.authToken, getAuthToken())
        : null;
      setSessionUser((prev) => {
        const nextDisplayName =
          updatedUser?.pseudo ||
          updatedUser?.display_name ||
          formatFullName(updatedUser) ||
          prev?.displayName ||
          DEFAULT_USER_LABEL;
        const next = {
          id: updatedUser?.id || prev?.id || authClaims?.userId || null,
          userType: 'teacher',
          displayName: nextDisplayName,
          email: updatedUser?.email ?? prev?.email ?? null,
          pseudo: updatedUser?.pseudo !== undefined ? updatedUser.pseudo : (prev?.pseudo ?? null),
          description:
            updatedUser?.description !== undefined
              ? updatedUser.description
              : (prev?.description ?? null),
          avatar_path:
            updatedUser?.avatar_path ?? updatedUser?.avatarPath ?? prev?.avatar_path ?? null,
          default_avatar_url: updatedUser?.default_avatar_url ?? prev?.default_avatar_url ?? null,
          visit_mascot_catalog_id:
            updatedUser?.visit_mascot_catalog_id ?? prev?.visit_mascot_catalog_id ?? null,
          biodiv_pedago_level:
            updatedUser?.biodiv_pedago_level !== undefined
              ? updatedUser.biodiv_pedago_level
              : (prev?.biodiv_pedago_level ?? null),
        };
        saveStoredSession({ user: next, ...(nextToken ? { token: nextToken } : {}) });
        return next;
      });
    },
    [authClaims?.userId, setSessionUser],
  );

  /** Profil enregistré : la session prof et la session élève ne se mettent pas à jour pareil. */
  const handleProfileUpdated = useCallback(
    (updated) => {
      // Mot de passe changé (`POST /api/auth/me/password`) : le drapeau du shell retombe.
      if (updated?.passwordMustReset === false) markPasswordChangeRequired(false);
      if (isTeacherAccount) {
        updateTeacherSession(updated);
        return;
      }
      updateStudentSession(updated);
    },
    [isTeacherAccount, markPasswordChangeRequired, updateStudentSession, updateTeacherSession],
  );

  /** Connexion réussie depuis l'écran d'accueil : pose la session (prof ou élève) et les claims. */
  const handleAuthScreenLogin = useCallback(
    (session) => {
      const userType = String(
        session?.auth?.userType || session?.user_type || 'student',
      ).toLowerCase();
      if (userType === 'teacher') {
        setStudent(null);
        setSessionUser({
          id: session?.auth?.canonicalUserId || session?.id || null,
          userType: 'teacher',
          displayName:
            session?.display_name || session?.auth?.roleDisplayName || DEFAULT_USER_LABEL,
          email: session?.email || null,
          pseudo: session?.pseudo || null,
          description: session?.description || null,
          avatar_path: session?.avatar_path || null,
          default_avatar_url: session?.default_avatar_url || null,
          visit_mascot_catalog_id: session?.visit_mascot_catalog_id || null,
          biodiv_pedago_level: session?.biodiv_pedago_level || null,
        });
      } else {
        updateStudentSession(session);
      }
      const claims = getAuthClaims();
      setAuthClaims(claims);
      const fromServer =
        session?.discoveryTourSeen && typeof session.discoveryTourSeen === 'object'
          ? session.discoveryTourSeen
          : {};
      setDiscoveryTourSeen(fromServer);
      setDiscoveryTourSeenReady(true);
      if (Array.isArray(session?.biodivGroupPedagoLevels)) {
        setBiodivGroupPedagoLevels(
          session.biodivGroupPedagoLevels.map(normalizePedagoLevel).filter(Boolean),
        );
      }
      if (Array.isArray(session?.biodivGroupCurriculumNiveaux)) {
        setBiodivGroupCurriculumNiveaux(sortLearnerNiveaux(session.biodivGroupCurriculumNiveaux));
      }
      const roleSlug = String(claims?.roleSlug || '').toLowerCase();
      if (isVisitorLikeRole(roleSlug)) {
        const visitOk = publicSettings?.modules?.visit_enabled !== false;
        setTab(visitOk ? 'visit' : 'plants');
      }
      // Mot de passe provisoire ou compromis : « Mon profil » s'ouvre dès l'entrée.
      markPasswordChangeRequired(!!session?.passwordMustReset);
    },
    [
      markPasswordChangeRequired,
      publicSettings?.modules?.visit_enabled,
      setAuthClaims,
      setSessionUser,
      setStudent,
      setTab,
      updateStudentSession,
    ],
  );

  const clearLocalDataOnLogout = publicSettings?.privacy?.clear_local_data_on_logout !== false;
  const logoutClearSiteStorage =
    publicSettings?.privacy?.logout_clear_site_data_scope === 'cache_storage';

  /**
   * Déconnexion complète (session locale + états React). Avec le réglage
   * `privacy.clear_local_data_on_logout`, les données du compte gardées sur l'appareil sont
   * effacées aussi — après confirmation s'il reste des actions non envoyées. Les copies d'API
   * cloisonnées (`__fm_sw_user`) partent toujours ; le serveur pose `Clear-Site-Data`.
   */
  const handleLogout = useCallback(
    async ({ confirm } = {}) => {
      const userId = getAuthUserId();
      const pending = clearLocalDataOnLogout ? countPendingLocalActions(userId) : 0;
      const message = pendingLossConfirmationMessage(pending, {
        clearSiteStorage: logoutClearSiteStorage,
      });
      if (message && typeof confirm === 'function') {
        const ok = await confirm({ message, confirmLabel: 'Se déconnecter', danger: true });
        if (!ok) return;
      }
      if (clearLocalDataOnLogout) {
        // Sans moyen de confirmer, les actions non envoyées sont gardées plutôt que perdues
        // (sauf mode borne : le serveur effacera le stockage de toute façon).
        if (logoutClearSiteStorage || !message || typeof confirm === 'function') {
          clearLocalDataForAccount(userId);
          void clearOfflinePhotosForAccount(userId);
        }
        void purgeCachedUserMedia();
      }
      // Toujours : copies d'API du compte + miroir outbox + session.
      void purgeCachedAuthenticatedApi();
      void clearOutboxMirror();
      // Après confirmation éventuelle : sinon Clear-Site-Data "storage" effacerait les files
      // non envoyées sans prévenir.
      void notifyServerLogout('/api/auth/logout');
      clearStoredSession();
      studentRef.current = null;
      setStudent(null);
      setSessionUser(null);
      setAuthClaims(null);
      setDiscoveryTourSeen(null);
      setDiscoveryTourSeenReady(false);
      setBiodivGroupPedagoLevels([]);
      setBiodivGroupCurriculumNiveaux([]);
      markPasswordChangeRequired(false);
    },
    [
      clearLocalDataOnLogout,
      logoutClearSiteStorage,
      markPasswordChangeRequired,
      setAuthClaims,
      setSessionUser,
      setStudent,
      studentRef,
    ],
  );

  return {
    discoveryTourSeen,
    discoveryTourSeenReady,
    persistDiscoveryTourSeen,
    biodivGroupPedagoLevels,
    biodivGroupCurriculumNiveaux,
    onPersistVisitMascotId,
    forceLogout,
    mergeAuthMeResponse,
    updateStudentSession,
    handleAdminImpersonationApplied,
    stopAdminImpersonation,
    validateStudentSession,
    handleProfileUpdated,
    handleAuthScreenLogin,
    handleLogout,
  };
}
