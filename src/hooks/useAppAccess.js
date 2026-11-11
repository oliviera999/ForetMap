import { useCallback, useMemo } from 'react';
import { resolveTooltipKey } from '../utils/helpResolve';
import {
  canManagePedagoContent,
  isClassTeacherRole,
  isForumExcludedRole,
  isVisitorLikeRole,
  resolveParticipationFlag,
  resolvePedagoModuleAccess,
  shouldUseTeacherChrome,
} from '../utils/appAccess';
import {
  DEFAULT_USER_LABEL,
  formatFullName,
  resolveSessionDisplayName,
} from '../utils/appIdentity';

/**
 * Droits et drapeaux d'interface dérivés de la session du shell `App` — extrait tel quel
 * d'`App.jsx` (lot 6). **Aucun effet** : uniquement des `useMemo` / `useCallback` et des
 * valeurs calculées, donc sans incidence sur l'ordre des effets du shell.
 *
 * Les helpers purs (`canManagePedagoContent`, `resolveParticipationFlag`…) vivent dans
 * `src/utils/appAccess.js` ; ce hook ne fait que les brancher sur l'état de session.
 *
 * @param {object} params
 * @param {object|null} params.authClaims Claims du jeton courant.
 * @param {'native'|'student'|'teacher'} params.roleViewMode Vue rôle choisie (aperçu).
 * @param {object|null} params.sessionUser Session prof en mémoire.
 * @param {object|null} params.student Session élève en mémoire.
 * @param {object|null} params.publicSettings Réglages publics (modules, aide).
 * @param {boolean} params.passwordChangeRequired Mot de passe provisoire à changer.
 */
export function useAppAccess({
  authClaims,
  roleViewMode,
  sessionUser,
  student,
  publicSettings,
  passwordChangeRequired,
}) {
  /** Dérivé d'authClaims (remplace l'ancien état jumeau et ses ~9 setIsTeacher). */
  const isTeacher = useMemo(
    () =>
      Array.isArray(authClaims?.permissions) && authClaims.permissions.includes('teacher.access'),
    [authClaims],
  );
  /**
   * Compte enseignant **au sens de la session** — indépendamment de `teacher.access`.
   *
   * `isTeacher` répond « cette session peut-elle ouvrir l'interface n3boss ? », pas
   * « y a-t-il quelqu'un de connecté ? ». Les deux ont longtemps coïncidé parce qu'un
   * compte `user_type = 'teacher'` portait toujours la permission. Ce n'est plus vrai :
   * un prof de classe dont un administrateur a décoché « Accès interface n3boss » dans
   * Profils & utilisateurs ouvre une session valide sans cette permission. La porte
   * d'entrée doit donc regarder la session, pas le droit d'administration.
   */
  const isTeacherAccount = useMemo(() => {
    if (isTeacher) return true;
    const fromSession = String(sessionUser?.userType || '').toLowerCase();
    if (fromSession === 'teacher') return true;
    return String(authClaims?.userType || '').toLowerCase() === 'teacher';
  }, [authClaims?.userType, isTeacher, sessionUser?.userType]);

  const effectiveRoleContext = useMemo(() => {
    const roleSlug = String(authClaims?.roleSlug || '').toLowerCase();
    const activePermsRaw = Array.isArray(authClaims?.permissions) ? authClaims.permissions : [];
    let activePerms = activePermsRaw;
    if (roleViewMode === 'teacher' && roleSlug === 'admin') {
      activePerms = activePermsRaw.filter((perm) => !String(perm).startsWith('admin.'));
    }
    const canUseTeacherUi = activePerms.includes('teacher.access');
    // Prof de classe : sans teacher.access (réalignement du 22/09/2026), chrome apprenant.
    const effectiveIsTeacher = shouldUseTeacherChrome({
      roleSlug,
      hasTeacherAccess: canUseTeacherUi,
      roleViewMode,
    });
    return {
      roleSlug,
      activePerms,
      effectiveIsTeacher,
    };
  }, [authClaims, roleViewMode]);

  const effectiveIsTeacher = effectiveRoleContext.effectiveIsTeacher;
  const helpText = useCallback(
    (path) => resolveTooltipKey(path, publicSettings, effectiveIsTeacher),
    [effectiveIsTeacher, publicSettings],
  );

  const hasPermission = useCallback(
    (perm) => {
      return effectiveRoleContext.activePerms.includes(perm);
    },
    [effectiveRoleContext.activePerms],
  );

  // Plus de dimension d'élévation : les permissions « en rôle » sont exactement les permissions
  // actives. Conservé comme alias de `hasPermission` pour ne pas toucher ses nombreux appelants.
  const hasPermissionInRole = useCallback(
    (perm) => effectiveRoleContext.activePerms.includes(perm),
    [effectiveRoleContext.activePerms],
  );

  const canManageTutorials = useMemo(
    () =>
      canManagePedagoContent({
        roleSlug: effectiveRoleContext.roleSlug,
        nativePrivileged: authClaims?.nativePrivileged,
        permission: 'tutorials.manage',
        hasPermission: hasPermissionInRole,
      }),
    [effectiveRoleContext.roleSlug, hasPermissionInRole, authClaims?.nativePrivileged],
  );

  const previewStudent = useMemo(() => {
    if (!isTeacher || roleViewMode !== 'student') return null;
    const fallbackName = resolveSessionDisplayName(
      sessionUser?.displayName,
      authClaims?.roleDisplayName,
    );
    return {
      id: `preview-${authClaims?.userId || 'teacher'}`,
      first_name: fallbackName,
      last_name: '',
      pseudo: null,
      preview_mode: true,
    };
  }, [
    authClaims?.roleDisplayName,
    authClaims?.userId,
    isTeacher,
    roleViewMode,
    sessionUser?.displayName,
  ]);
  const studentForUi = student || previewStudent;

  const isVisitor = isVisitorLikeRole(effectiveRoleContext.roleSlug);
  const isClassTeacher = isClassTeacherRole(effectiveRoleContext.roleSlug);
  const canAccessStudentMapTasks = !isVisitor;
  const canAccessTutorials =
    publicSettings?.modules?.tutorials_enabled !== false && (canAccessStudentMapTasks || isVisitor);
  const canAccessProfiles =
    hasPermissionInRole('admin.roles.manage') ||
    hasPermissionInRole('admin.users.assign_roles') ||
    hasPermissionInRole('stats.export') ||
    hasPermissionInRole('students.import') ||
    hasPermissionInRole('students.delete') ||
    hasPermissionInRole('users.create') ||
    hasPermissionInRole('groups.manage') ||
    hasPermissionInRole('groups.read');
  /*
   * Forum : fermé au seul profil « visiteur », comme côté serveur
   * (`PARTICIPATION_EXCLUDED_ROLE_SLUGS`). Ce n'est **pas** `isVisitor` : personnel et prof de
   * classe suivent le parcours apprenant sans carte ni tâches, mais participent au forum.
   */
  const canAccessForum =
    !isForumExcludedRole(effectiveRoleContext.roleSlug) &&
    publicSettings?.modules?.forum_enabled !== false;
  const canParticipateForum = useMemo(
    () =>
      resolveParticipationFlag({
        isTeacher: effectiveIsTeacher,
        user: studentForUi,
        camelKey: 'forumParticipate',
        snakeKey: 'forum_participate',
      }),
    [effectiveIsTeacher, studentForUi],
  );
  const canManageMediaLibrary = hasPermissionInRole('media.manage');
  const canReadStats = hasPermission('stats.read.all') || hasPermission('stats.read.group');
  const canManageQuiz = useMemo(
    () =>
      canManagePedagoContent({
        roleSlug: effectiveRoleContext.roleSlug,
        nativePrivileged: authClaims?.nativePrivileged,
        permission: 'plants.manage',
        hasPermission: hasPermissionInRole,
      }),
    [effectiveRoleContext.roleSlug, hasPermissionInRole, authClaims?.nativePrivileged],
  );
  const canManageFoodWeb = hasPermission('plants.manage');
  const canManageIdKeys = hasPermission('id_keys.manage');
  const canManageIndividuals = hasPermission('individuals.manage');
  const canMeasureIndividuals = hasPermission('individuals.measure');

  const canParticipateContextComments = useMemo(
    () =>
      resolveParticipationFlag({
        isTeacher: effectiveIsTeacher,
        user: studentForUi,
        camelKey: 'contextCommentParticipate',
        snakeKey: 'context_comment_participate',
      }),
    [effectiveIsTeacher, studentForUi],
  );
  const canSelfAssignTasks = !isVisitor;
  const canSelfAssignMoreTasks =
    canSelfAssignTasks && !studentForUi?.preview_mode && !studentForUi?.taskEnrollment?.atLimit;
  const canViewOtherUsersIdentity = !isVisitor;
  const isPreviewStudentView = !!previewStudent;
  const profileTargetUserId = useMemo(() => {
    // `isTeacherAccount` et non `isTeacher` : sans fiche n3beur, un compte enseignant
    // dépourvu de `teacher.access` n'avait plus aucune cible de profil — donc ni fiche
    // ni statistiques personnelles.
    if (effectiveIsTeacher || isTeacherAccount)
      return sessionUser?.id || authClaims?.userId || null;
    return student?.id || null;
  }, [authClaims?.userId, effectiveIsTeacher, isTeacherAccount, sessionUser?.id, student?.id]);
  const canOpenUserDialogs = !!profileTargetUserId && !isPreviewStudentView;
  const profileTargetUser = useMemo(() => {
    if (!canOpenUserDialogs) return null;
    // `passwordMustReset` porte le bandeau « mot de passe provisoire » de l'éditeur : c'est le
    // drapeau du shell qui fait foi (connexion, `/api/auth/me`, refus 403), élève comme prof.
    if (!effectiveIsTeacher && !isTeacherAccount && student) {
      return !!student.passwordMustReset === passwordChangeRequired
        ? student
        : { ...student, passwordMustReset: passwordChangeRequired };
    }
    const fallbackName = resolveSessionDisplayName(
      sessionUser?.displayName,
      authClaims?.roleDisplayName,
    );
    return {
      id: profileTargetUserId,
      user_type: 'teacher',
      first_name: fallbackName,
      last_name: '',
      display_name: fallbackName,
      pseudo: sessionUser?.pseudo || null,
      email: sessionUser?.email || null,
      avatar_path: sessionUser?.avatar_path || null,
      default_avatar_url: sessionUser?.default_avatar_url || null,
      visit_mascot_catalog_id: sessionUser?.visit_mascot_catalog_id || null,
      biodiv_pedago_level: sessionUser?.biodiv_pedago_level || null,
      description: sessionUser?.description || '',
      passwordMustReset: passwordChangeRequired,
      auth: {
        roleSlug: authClaims?.roleSlug || null,
        roleDisplayName: authClaims?.roleDisplayName || null,
        userType: authClaims?.userType || 'teacher',
      },
    };
  }, [
    authClaims?.roleDisplayName,
    authClaims?.roleSlug,
    authClaims?.userType,
    canOpenUserDialogs,
    effectiveIsTeacher,
    isTeacherAccount,
    passwordChangeRequired,
    profileTargetUserId,
    sessionUser?.avatar_path,
    sessionUser?.biodiv_pedago_level,
    sessionUser?.default_avatar_url,
    sessionUser?.description,
    sessionUser?.displayName,
    sessionUser?.email,
    sessionUser?.pseudo,
    // Le sélecteur de mascotte du plan met à jour `sessionUser` : sans cette dépendance,
    // « Mon profil » rouvrait sur la mascotte précédente jusqu'au rechargement de session.
    sessionUser?.visit_mascot_catalog_id,
    student,
  ]);
  const canOpenTeacherStatsFromBadge =
    (effectiveIsTeacher || isClassTeacher) &&
    publicSettings?.modules?.stats_enabled !== false &&
    canReadStats;
  const canViewGeneralStats = publicSettings?.modules?.stats_enabled !== false && canReadStats;
  const canSwitchToStudentView =
    isTeacher &&
    (effectiveRoleContext.roleSlug === 'prof' || effectiveRoleContext.roleSlug === 'admin');
  const canSwitchToTeacherView = isTeacher && effectiveRoleContext.roleSlug === 'admin';
  const isAdmin = effectiveRoleContext.roleSlug === 'admin';

  // Modules pédagogiques activables (`ui.modules.*`, allumés par défaut — décision du 25/09,
  // révisée) : éteint = fermé aux élèves, ouvert avec bandeau à qui porte la permission de
  // gestion (miroir de `lib/pedagoModuleGate.js`).
  const pedagoModuleAccess = resolvePedagoModuleAccess({
    modules: publicSettings?.modules,
    canManageIdKeys,
    canManageIndividuals,
    canManagePedagoSessions: canManageFoodWeb,
    canManageFresque: canManageFoodWeb,
  });
  const tutorialsModuleEnabled = publicSettings?.modules?.tutorials_enabled !== false;

  // Fallback mémoïsé : un littéral recréé à chaque rendu casserait les React.memo
  // des vues qui reçoivent student={currentUser} (cas session incomplète).
  const fallbackUser = useMemo(
    () => ({
      pseudo: null,
      displayName: authClaims?.roleDisplayName || null,
      first_name: authClaims?.roleDisplayName || 'Utilisateur',
      last_name: '',
    }),
    [authClaims?.roleDisplayName],
  );
  // Utilisateur affiché par l'en-tête et passé aux vues du shell authentifié.
  const currentUser =
    (effectiveIsTeacher ? sessionUser : studentForUi) || sessionUser || fallbackUser;
  const currentUserLabel =
    currentUser?.pseudo ||
    currentUser?.displayName ||
    formatFullName(currentUser) ||
    DEFAULT_USER_LABEL;

  return {
    currentUser,
    currentUserLabel,
    isTeacher,
    isTeacherAccount,
    roleSlug: effectiveRoleContext.roleSlug,
    effectiveIsTeacher,
    helpText,
    hasPermission,
    hasPermissionInRole,
    canManageTutorials,
    previewStudent,
    studentForUi,
    isVisitor,
    isClassTeacher,
    isAdmin,
    canAccessStudentMapTasks,
    canAccessTutorials,
    canAccessProfiles,
    canAccessForum,
    canParticipateForum,
    canManageMediaLibrary,
    canReadStats,
    canManageQuiz,
    canManageFoodWeb,
    canManageIdKeys,
    canManageIndividuals,
    canMeasureIndividuals,
    canParticipateContextComments,
    canSelfAssignTasks,
    canSelfAssignMoreTasks,
    canViewOtherUsersIdentity,
    isPreviewStudentView,
    profileTargetUserId,
    canOpenUserDialogs,
    profileTargetUser,
    canOpenTeacherStatsFromBadge,
    canViewGeneralStats,
    canSwitchToStudentView,
    canSwitchToTeacherView,
    pedagoModuleAccess,
    idKeysAvailable: pedagoModuleAccess.idKeys.available,
    individualsAvailable: pedagoModuleAccess.individuals.available,
    pedagoSessionsAvailable: pedagoModuleAccess.pedagoSessions.available,
    fresqueAvailable: pedagoModuleAccess.fresque.available,
    rewardsModuleEnabled: pedagoModuleAccess.rewards.enabled,
    tutorialsModuleEnabled,
  };
}
