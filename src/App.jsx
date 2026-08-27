import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import {
  api,
  getAuthClaims,
  getStoredSession,
  saveStoredSession,
  clearStoredSession,
} from './services/api';
import { useAuthSession } from './hooks/useAuthSession';
import { useForetmapRealtime } from './hooks/useForetmapRealtime';
import { useOauthRedirectSession } from './hooks/useOauthRedirectSession';
import { useNotificationCenter } from './hooks/useNotificationCenter';
import { usePwaInstall } from './hooks/usePwaInstall';
import { usePlantCatalogPreview } from './hooks/usePlantCatalogPreview';
import { useViewportLayout } from './hooks/useViewportLayout';
import { resolveTooltipKey } from './utils/helpResolve';
import {
  IOS_INSTALL_HINT_DISMISSED_KEY,
  GUEST_VISIT_MASCOT_CONFIRMED_KEY,
} from './constants/app-runtime';
import { MASCOT_PACK_UNSAVED_LEAVE_MSG } from './constants/mascotPackEditor.js';
import { TimedToast as Toast } from './shared/components/TimedToast.jsx';
import { AppStatusSticky } from './shared/components/AppStatusSticky.jsx';
import { PinModal } from './components/auth-views';
const StudentStatsLazy = lazy(() =>
  import('./components/stats-views').then((m) => ({ default: m.StudentStats })),
);
const StudentProfileEditorLazy = lazy(() =>
  import('./components/stats-views').then((m) => ({ default: m.StudentProfileEditor })),
);
import { TabSuspense } from './components/TabSuspense.jsx';
import { GlossaryPopover, readGlossaryTermMessage } from './components/pedago/GlossaryPopover.jsx';

const PlantManagerLazy = lazy(() =>
  import('./components/foretmap-views').then((m) => ({ default: m.PlantManager })),
);
const PlantViewerLazy = lazy(() =>
  import('./components/foretmap-views').then((m) => ({ default: m.PlantViewer })),
);
const ObservationNotebookLazy = lazy(() =>
  import('./components/foretmap-views').then((m) => ({ default: m.ObservationNotebook })),
);
// Modale a la demande : lazy pour que foretmap-views (PlantManager/Viewer/Notebook ~52 Ko) quitte le chunk main.
const PlantCatalogPreviewModalLazy = lazy(() =>
  import('./components/foretmap-views').then((m) => ({ default: m.PlantCatalogPreviewModal })),
);
const TutorialsViewLazy = lazy(() =>
  import('./components/tutorials-views').then((m) => ({ default: m.TutorialsView })),
);
const TeacherStatsLazy = lazy(() =>
  import('./components/stats-views').then((m) => ({ default: m.TeacherStats })),
);
const ProfilesAdminViewLazy = lazy(() =>
  import('./components/profiles-views').then((m) => ({ default: m.ProfilesAdminView })),
);
const AuditLogLazy = lazy(() =>
  import('./components/audit-views').then((m) => ({ default: m.AuditLog })),
);
const SettingsAdminViewLazy = lazy(() =>
  import('./components/settings-admin-views').then((m) => ({ default: m.SettingsAdminView })),
);
const MediaLibraryViewLazy = lazy(() =>
  import('./components/media-library-views').then((m) => ({ default: m.MediaLibraryView })),
);
const ForumViewLazy = lazy(() =>
  import('./components/forum-views').then((m) => ({ default: m.ForumView })),
);
const VisitMascotPackManagerLazy = lazy(() => import('./components/VisitMascotPackManager.jsx'));

/** Style du loader de l'éditeur packs mascotte (constante : évite un objet recréé à chaque rendu). */
const MASCOT_PACK_LOADER_STYLE = { padding: '24px 16px', minHeight: 120 };
import { getRoleTerms, isN3OnlyAffiliation } from './utils/n3-terminology';
import { visibleMapsForScope } from './utils/appMapScope';
import { canManagePedagoContent, resolveParticipationFlag } from './utils/appAccess';
import { DEFAULT_USER_LABEL, formatFullName, resolveSessionDisplayName } from './utils/appIdentity';
import { getContentText } from './utils/content';
import { safeLocalStorageGetItem, safeLocalStorageSetItem } from './utils/browserStorage.js';
import { saveVisitMascotPreference } from './services/visitMascotPreference.js';
import { useOverlayHistoryBack } from './hooks/useOverlayHistoryBack';
import { abandonAllOverlays, pushOverlayClose } from './utils/overlayHistory';
import { AutoProfilePromotionModal } from './components/AutoProfilePromotionModal.jsx';
import { AppFooter } from './components/app/AppFooter.jsx';
import { AppHeader } from './components/app/AppHeader.jsx';
import { AppLoader, FULL_PAGE_LOADER_STYLE } from './components/app/AppLoader.jsx';
import { AppUserDialog } from './components/app/AppUserDialog.jsx';
import { UnauthenticatedShell } from './components/app/UnauthenticatedShell.jsx';
import { MapTasksArea } from './components/app/MapTasksArea.jsx';
import { NoticeBanner } from './components/app/NoticeBanner.jsx';
import { PedagoTabs } from './components/app/PedagoTabs.jsx';
import { TeacherTopTabs } from './components/app/TeacherTopTabs.jsx';
import { StudentBottomNav } from './components/app/StudentBottomNav.jsx';
import { RolePreviewBanners } from './components/app/RolePreviewBanners.jsx';
import { PublicSettingsProvider } from './contexts/PublicSettingsContext.jsx';
import { SessionProvider } from './contexts/SessionContext.jsx';
import { DataProvider } from './contexts/DataContext.jsx';
import { TourProvider } from './contexts/TourContext.jsx';
import { readStoredTab } from './utils/appShellHelpers';
import { useAppBootstrap } from './hooks/useAppBootstrap';
import { useAppDataSync } from './hooks/useAppDataSync';
import { useAppDataPolling } from './hooks/useAppDataPolling';
import { useTabNavigationGuards } from './hooks/useTabNavigationGuards';
import { useAppStoragePersistence } from './hooks/useAppStoragePersistence';
import { useSessionWindowSync } from './hooks/useSessionWindowSync';
import { useToastNotificationBridge } from './hooks/useToastNotificationBridge';
import { useRoleViewModeReset } from './hooks/useRoleViewModeReset';
import { useAuthMeHydration } from './hooks/useAuthMeHydration';
import { useDefaultActiveMapFromSettings } from './hooks/useDefaultActiveMapFromSettings';
import { useActiveMapVisibilityReconciler } from './hooks/useActiveMapVisibilityReconciler';
import { useStudentSessionRef } from './hooks/useStudentSessionRef';

// ── APP ───────────────────────────────────────────────────────────────────────
function App() {
  const initialSession = useMemo(() => getStoredSession(), []);
  const [student, setStudent] = useState(() => initialSession?.student || null);
  const studentRef = useStudentSessionRef(initialSession?.student || null, student);
  /** Pendant les modales de la vue Tâches : pas de rafraîchissement données (évite la perte du clavier virtuel mobile). */
  const pauseDataRefreshForTaskOverlaysRef = useRef(false);
  const [sessionUser, setSessionUser] = useState(() => initialSession?.user || null);
  const [showPin, setShowPin] = useState(false);
  const [showPublicVisit, setShowPublicVisit] = useState(false);
  const [guestVisitNeedsMascotChoice, setGuestVisitNeedsMascotChoice] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [tab, setTab] = useState(() => readStoredTab());
  /** Synchronise le filtre lieu de l’onglet tâches avec la zone/repère ouvert(e) sur la carte. */
  const [tasksLocationFocus, setTasksLocationFocus] = useState(null);
  const [toast, setToast] = useState(null);
  const [profilePromotion, setProfilePromotion] = useState(null);
  const [sessionValidationError, setSessionValidationError] = useState(false);
  const [authClaims, setAuthClaims] = useState(() => getAuthClaims());
  /** Dérivé d'authClaims (remplace l'ancien état jumeau et ses ~9 setIsTeacher). */
  const isTeacher = useMemo(
    () =>
      Array.isArray(authClaims?.permissions) && authClaims.permissions.includes('teacher.access'),
    [authClaims],
  );
  const [roleViewMode, setRoleViewMode] = useState('native'); // native | student | teacher
  const { appVersion, publicSettings, publicSettingsReady } = useAppBootstrap();
  const { isTabVisible, shouldUseDesktopSplit } = useViewportLayout();
  const {
    deferredInstallPrompt,
    showIosInstallHint,
    isStandaloneMode,
    handleInstallClick,
    setShowIosInstallHint,
  } = usePwaInstall({ onToast: setToast });
  const mascotPackDirtyRef = useRef(false);
  /** Incrémenté après succès modale PIN / login prof : déclenche un `fetchAll` sans s’accrocher à chaque changement de `authClaims`. */
  const [pinSuccessFetchAllTick, setPinSuccessFetchAllTick] = useState(0);

  const effectiveRoleContext = useMemo(() => {
    const roleSlug = String(authClaims?.roleSlug || '').toLowerCase();
    const activePermsRaw = Array.isArray(authClaims?.permissions) ? authClaims.permissions : [];
    let activePerms = activePermsRaw;
    if (roleViewMode === 'teacher' && roleSlug === 'admin') {
      activePerms = activePermsRaw.filter((perm) => !String(perm).startsWith('admin.'));
    }
    const canUseTeacherUi = activePerms.includes('teacher.access');
    const effectiveIsTeacher = canUseTeacherUi && roleViewMode !== 'student';
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

  /* isTeacher est désormais dérivé d'authClaims : le `setIsTeacher` attendu par le hook OAuth
     réaligne authClaims sur le jeton fraîchement stocké. Indispensable pour la branche élève,
     qui appelait `setIsTeacher(false)` sans poser authClaims (jeton élève déjà en storage). */
  const syncAuthClaimsFromStoredToken = useCallback(() => {
    setAuthClaims(getAuthClaims());
  }, []);
  useOauthRedirectSession({
    onToast: setToast,
    setSessionUser,
    setAuthClaims,
    setIsTeacher: syncAuthClaimsFromStoredToken,
    setStudent,
  });

  // Called from anywhere when a 401-deleted is detected
  // Handlers stables de la visite publique invitée : des arrows inline cassaient
  // React.memo(VisitView) à chaque re-render d'App (mode le plus sensible, mobile).
  const onGuestBackToAuth = useCallback(() => {
    abandonAllOverlays();
    setGuestVisitNeedsMascotChoice(false);
    setShowPublicVisit(false);
  }, []);
  const onGuestMascotChoiceDone = useCallback(() => {
    safeLocalStorageSetItem(GUEST_VISIT_MASCOT_CONFIRMED_KEY, '1');
    setGuestVisitNeedsMascotChoice(false);
  }, []);

  /**
   * Choix de mascotte d'un **compte connecté** : enregistré dans le compte (donc portable
   * d'un appareil à l'autre), et non plus dans le stockage local du navigateur. La session
   * en mémoire est mise à jour dans la foulée pour que « Mon profil » reste cohérent.
   * L'affichage est déjà optimiste côté hook : un échec réseau ne bloque pas la visite.
   */
  const persistVisitMascotPreference = useCallback(async (mascotId) => {
    const value = String(mascotId || '').trim();
    const next = value || null;
    setStudent((prev) => (prev ? { ...prev, visit_mascot_catalog_id: next } : prev));
    setSessionUser((prev) => (prev ? { ...prev, visit_mascot_catalog_id: next } : prev));
    try {
      await saveVisitMascotPreference(value);
    } catch (_) {
      /* silencieux : la valeur serveur reprend la main au prochain chargement de session */
    }
  }, []);
  const onPersistVisitMascotId = useMemo(
    () => (sessionUser || student ? persistVisitMascotPreference : null),
    [sessionUser, student, persistVisitMascotPreference],
  );

  // D3 — cycle de vie session (restauration, /api/auth/me, impersonation admin, logout forcé).
  const {
    forceLogout,
    updateStudentSession,
    handleAdminImpersonationApplied,
    stopAdminImpersonation,
    mergeAuthMeResponse,
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

  /* Les deux écouteurs de useSessionWindowSync posent déjà authClaims de façon cohérente
     (null à l'expiration, claims relus au changement de session) : le setIsTeacher legacy
     devient un no-op, isTeacher étant dérivé d'authClaims. */
  const setIsTeacherNoop = useCallback(() => {}, []);
  useSessionWindowSync({
    setAuthClaims,
    setIsTeacher: setIsTeacherNoop,
    setSessionUser,
    setToast,
  });

  useRoleViewModeReset({
    roleSlug: authClaims?.roleSlug,
    userId: authClaims?.userId,
    isTeacher,
    setRoleViewMode,
  });

  useAuthMeHydration({ mergeAuthMeResponse });

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

  const hasAuthenticatedShell = !!(student || isTeacher);

  // Contexte lu par `fetchAll` (mémoïsé : il pilote aussi le debounce du rechargement auto).
  const dataSyncContext = useMemo(
    () => ({
      effectiveIsTeacher,
      showPublicVisit,
      studentAffiliation: student?.affiliation,
      canManageTutorials,
      defaultMapStudent: publicSettings?.map?.default_map_student,
      defaultMapTeacher: publicSettings?.map?.default_map_teacher,
      defaultMapVisit: publicSettings?.map?.default_map_visit,
    }),
    [
      effectiveIsTeacher,
      showPublicVisit,
      student?.affiliation,
      canManageTutorials,
      publicSettings?.map?.default_map_student,
      publicSettings?.map?.default_map_teacher,
      publicSettings?.map?.default_map_visit,
    ],
  );

  // D4 — données partagées et cycle de rechargement (fetchAll, polling différentiel,
  // refetch ciblé, bandeau « serveur indisponible »).
  const {
    maps,
    activeMapId,
    setActiveMapId,
    zones,
    setZones,
    tasks,
    setTasks,
    taskProjects,
    setTaskProjects,
    archivedTasks,
    setArchivedTasks,
    archivedTaskProjects,
    setArchivedTaskProjects,
    plants,
    setPlants,
    markers,
    setMarkers,
    tutorials,
    loading,
    refreshMs,
    serverDown,
    retryingServer,
    fetchAll,
    retryServerNow,
  } = useAppDataSync({
    context: dataSyncContext,
    contextReady: publicSettingsReady,
    hasAuthenticatedShell,
    studentRef,
    forceLogout,
    mergeAuthMeResponse,
  });

  useAppStoragePersistence({ activeMapId, tab, onToast: setToast });

  useDefaultActiveMapFromSettings({
    publicSettingsReady,
    publicSettings,
    effectiveIsTeacher,
    showPublicVisit,
    setActiveMapId,
  });

  // Auto-démarrage du mode visite/découverte : modules activés, app prête,
  // session établie et pas d'onboarding mascotte invité en attente.
  const discoveryTourAutoEnabled =
    publicSettingsReady &&
    !loading &&
    publicSettings?.modules?.help_enabled !== false &&
    publicSettings?.help?.discovery_tour !== false &&
    !guestVisitNeedsMascotChoice &&
    !!(sessionUser || student || showPublicVisit);

  useEffect(() => {
    if (pinSuccessFetchAllTick === 0) return;
    void fetchAll();
  }, [pinSuccessFetchAllTick, fetchAll]);

  const tasksForActiveMap = useMemo(
    () =>
      tasks.filter((t) => {
        const effectiveMapId =
          t.map_id_resolved || t.map_id || t.zone_map_id || t.marker_map_id || null;
        return effectiveMapId === activeMapId || effectiveMapId == null;
      }),
    [tasks, activeMapId],
  );
  const teacherPendingValidationCount = useMemo(
    () => tasksForActiveMap.filter((t) => t.status === 'done').length,
    [tasksForActiveMap],
  );
  const visibleMaps = useMemo(
    () =>
      visibleMapsForScope(maps, {
        isTeacher: effectiveIsTeacher,
        isPublicVisit: showPublicVisit,
        affiliation: student?.affiliation,
      }),
    [maps, effectiveIsTeacher, showPublicVisit, student?.affiliation],
  );
  useActiveMapVisibilityReconciler({
    activeMapId,
    visibleMaps,
    effectiveIsTeacher,
    showPublicVisit,
    publicSettings,
    setActiveMapId,
  });
  const onMascotPackDirtyChange = useCallback((dirty) => {
    mascotPackDirtyRef.current = dirty;
  }, []);

  const handleTeacherTabChange = useCallback(
    (nextTab) => {
      if (tab === 'mascot_packs' && nextTab !== 'mascot_packs' && mascotPackDirtyRef.current) {
        if (!window.confirm(MASCOT_PACK_UNSAVED_LEAVE_MSG)) return;
      }
      setTab(nextTab);
    },
    [tab, setTab],
  );

  const openMascotPackStudioTab = useCallback(() => {
    setTab('mascot_packs');
  }, [setTab]);
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
      affiliation: 'both',
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
  // NB : comparaison stricte (===, sensible casse/espaces, sans match par student_id) —
  // volontairement NON alignée sur `assignmentMatchesStudent` (task-assignments), dont la
  // normalisation (trim + minuscules + id) changerait le comptage ; conservée iso-comportement.
  const studentActiveAssignedTasksCount = useMemo(() => {
    if (!studentForUi) return 0;
    return tasksForActiveMap.filter(
      (t) =>
        t.assignments?.some(
          (a) =>
            a.student_first_name === studentForUi.first_name &&
            a.student_last_name === studentForUi.last_name,
        ) &&
        (t.status === 'available' || t.status === 'in_progress'),
    ).length;
  }, [studentForUi, tasksForActiveMap]);
  const studentAffiliation = (studentForUi?.affiliation || 'both').toLowerCase();
  const isN3Affiliated = isN3OnlyAffiliation(studentAffiliation);
  const roleTerms = getRoleTerms(isN3Affiliated);
  const appLoaderText = getContentText(publicSettings, 'app.loader', 'Chargement de la forêt...');
  const appServerDownNotice = getContentText(
    publicSettings,
    'app.server_down_notice',
    'Serveur indisponible. Nouvel essai automatique toutes les 2 minutes.',
  );
  const appRetryNow = getContentText(publicSettings, 'app.retry_now', 'Réessayer maintenant');
  const appFooterVersionPrefix = getContentText(
    publicSettings,
    'app.footer_version_prefix',
    'Version',
  );
  const isVisitor = effectiveRoleContext.roleSlug === 'visiteur';
  const canAccessStudentMapTasks = !isVisitor;
  /** Met à jour le filtre lieu du volet Tâches (sans changer d’onglet). */
  const handleMapLocationTasksFocus = useCallback((focus) => {
    setTasksLocationFocus(focus);
  }, []);
  const canAccessForum = !isVisitor && publicSettings?.modules?.forum_enabled !== false;
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
  const canManageMediaLibrary = hasPermissionInRole('teacher.access');
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
    if (effectiveIsTeacher) return sessionUser?.id || authClaims?.userId || null;
    return student?.id || null;
  }, [authClaims?.userId, effectiveIsTeacher, sessionUser?.id, student?.id]);
  const canOpenUserDialogs = !!profileTargetUserId && !isPreviewStudentView;
  const profileTargetUser = useMemo(() => {
    if (!canOpenUserDialogs) return null;
    if (!effectiveIsTeacher && student) return student;
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
      pseudo: null,
      email: sessionUser?.email || null,
      avatar_path: sessionUser?.avatar_path || null,
      visit_mascot_catalog_id: sessionUser?.visit_mascot_catalog_id || null,
      description: '',
      affiliation: 'both',
      auth: {
        roleSlug: authClaims?.roleSlug || null,
        userType: authClaims?.userType || 'teacher',
      },
    };
  }, [
    authClaims?.roleDisplayName,
    authClaims?.roleSlug,
    authClaims?.userType,
    canOpenUserDialogs,
    effectiveIsTeacher,
    profileTargetUserId,
    sessionUser?.avatar_path,
    sessionUser?.displayName,
    sessionUser?.email,
    // Le sélecteur de mascotte du plan met à jour `sessionUser` : sans cette dépendance,
    // « Mon profil » rouvrait sur la mascotte précédente jusqu'au rechargement de session.
    sessionUser?.visit_mascot_catalog_id,
    student,
  ]);
  const canOpenTeacherStatsFromBadge =
    effectiveIsTeacher &&
    publicSettings?.modules?.stats_enabled !== false &&
    hasPermission('stats.read.all');
  const canViewGeneralStats =
    publicSettings?.modules?.stats_enabled !== false && hasPermission('stats.read.all');
  const canSwitchToStudentView =
    isTeacher &&
    (effectiveRoleContext.roleSlug === 'prof' || effectiveRoleContext.roleSlug === 'admin');
  const canSwitchToTeacherView = isTeacher && effectiveRoleContext.roleSlug === 'admin';
  const onTaskFormOverlayOpenChange = useCallback((open) => {
    pauseDataRefreshForTaskOverlaysRef.current = !!open;
  }, []);

  // ── Callbacks du header (AppHeader) ─────────────────────────────────────────
  const handleOpenStatsDialog = useCallback(() => setShowStats(true), []);
  const handleCloseStatsDialog = useCallback(() => setShowStats(false), []);
  const handleOpenTeacherStatsTab = useCallback(() => setTab('stats'), []);
  const handleOpenProfileDialog = useCallback(() => setShowProfile(true), []);
  const handleCloseProfileDialog = useCallback(() => setShowProfile(false), []);
  const handleRequestPin = useCallback(() => setShowPin(true), []);

  /** Session prof en mémoire après édition du profil (nom affiché, avatar, mascotte). */
  const updateTeacherSession = useCallback(
    (updatedUser) => {
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
          avatar_path:
            updatedUser?.avatar_path ?? updatedUser?.avatarPath ?? prev?.avatar_path ?? null,
          visit_mascot_catalog_id:
            updatedUser?.visit_mascot_catalog_id ?? prev?.visit_mascot_catalog_id ?? null,
        };
        saveStoredSession({ user: next });
        return next;
      });
    },
    [authClaims?.userId],
  );

  /** Cible mémoïsée de la modale statistiques (un littéral casserait le memo de StudentStats). */
  const statsDialogTarget = useMemo(() => ({ id: profileTargetUserId }), [profileTargetUserId]);

  /** Profil enregistré : la session prof et la session élève ne se mettent pas à jour pareil. */
  const handleProfileUpdated = useCallback(
    (updated) => {
      if (effectiveIsTeacher) {
        updateTeacherSession(updated);
        return;
      }
      updateStudentSession(updated);
    },
    [effectiveIsTeacher, updateStudentSession, updateTeacherSession],
  );

  /** Bascule de vue rôle (natif / élève / prof) : réinitialise onglet et dialogues. */
  const handleRoleViewModeSelect = useCallback((mode) => {
    setRoleViewMode(mode);
    setTab('map');
    setShowStats(false);
    setShowProfile(false);
  }, []);

  const handleToastDone = useCallback(() => setToast(null), []);

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
          avatar_path: session?.avatar_path || null,
          visit_mascot_catalog_id: session?.visit_mascot_catalog_id || null,
        });
      } else {
        updateStudentSession(session);
      }
      const claims = getAuthClaims();
      setAuthClaims(claims);
      const roleSlug = String(claims?.roleSlug || '').toLowerCase();
      if (userType !== 'teacher' && roleSlug === 'visiteur') {
        const visitOk = publicSettings?.modules?.visit_enabled !== false;
        setTab(visitOk ? 'visit' : 'plants');
      }
    },
    [publicSettings?.modules?.visit_enabled, updateStudentSession],
  );

  /** Entrée en visite publique invitée (avec onboarding mascotte si jamais confirmé). */
  const handleVisitAsGuest = useCallback(() => {
    pushOverlayClose(() => setShowPublicVisit(false));
    const guestAlreadyConfirmedMascot =
      safeLocalStorageGetItem(GUEST_VISIT_MASCOT_CONFIRMED_KEY, null) === '1';
    setGuestVisitNeedsMascotChoice(!guestAlreadyConfirmedMascot);
    setShowPublicVisit(true);
  }, []);

  /** Déconnexion complète (session locale + états React). */
  const handleLogout = useCallback(() => {
    clearStoredSession();
    studentRef.current = null;
    setStudent(null);
    setSessionUser(null);
    setAuthClaims(null);
  }, [studentRef]);

  useOverlayHistoryBack(showStats && canOpenUserDialogs, handleCloseStatsDialog);
  useOverlayHistoryBack(
    showProfile && canOpenUserDialogs && !!profileTargetUser,
    handleCloseProfileDialog,
  );

  const isCombinedMapTasksTab = tab === 'maptasks';
  const useSplitMapTasks =
    shouldUseDesktopSplit && isCombinedMapTasksTab && canAccessStudentMapTasks;
  /** Ouvre l’onglet Tâches avec le filtre lieu (carte seule ; en split le filtre est déjà synchronisé au clic). */
  const navigateToTasksForLocation = useCallback(
    (focus) => {
      if (!focus?.kind || focus.id == null || focus.id === '') return;
      setTasksLocationFocus(focus);
      if (!(effectiveIsTeacher || canAccessStudentMapTasks)) return;
      if (useSplitMapTasks) return;
      setTab('tasks');
    },
    [effectiveIsTeacher, canAccessStudentMapTasks, useSplitMapTasks],
  );

  const { plantCatalogPreview, setPlantCatalogPreview, openPlantCatalogPreviewById } =
    usePlantCatalogPreview(plants);
  const [pedagoGlossaryCode, setPedagoGlossaryCode] = useState(null);
  const [pedagoQuizQuestionCode, setPedagoQuizQuestionCode] = useState(null);
  const [foodWebHighlightPlantId, setFoodWebHighlightPlantId] = useState(null);
  // Code du terme affiché dans le popover de glossaire (fiche rapide, rendue hors des
  // onglets pour survivre à tout changement de vue — audit A1).
  const [glossaryPopoverCode, setGlossaryPopoverCode] = useState(null);

  /**
   * Geste par défaut sur un terme de glossaire (tutoriel, fiche plante, quiz, réseau
   * trophique) : ouvrir la fiche rapide **par-dessus** l'écran courant. L'élève ne perd
   * ni sa page de tutoriel, ni sa position de lecture.
   */
  const openGlossaryPopover = useCallback((code) => {
    const c = String(code || '').trim();
    if (!c) return;
    setGlossaryPopoverCode(c);
  }, []);

  const closeGlossaryPopover = useCallback(() => setGlossaryPopoverCode(null), []);

  /**
   * Chemin « fiche complète » : bascule sur l'onglet Glossaire et y sélectionne le terme.
   * Ce n'est plus le geste par défaut — seul le bouton dédié du popover y mène.
   */
  const openPedagoGlossaryTerm = useCallback(
    (code) => {
      const c = String(code || '').trim();
      setPedagoGlossaryCode(c || null);
      setTab('glossary');
      setPlantCatalogPreview(null);
    },
    [setPlantCatalogPreview],
  );

  const openPedagoQuizQuestion = useCallback(
    (code) => {
      const c = String(code || '')
        .trim()
        .toUpperCase();
      setPedagoQuizQuestionCode(c || null);
      setTab('quiz');
      setPlantCatalogPreview(null);
    },
    [setPlantCatalogPreview],
  );

  const openPedagoFoodWeb = useCallback(
    (plantId = null) => {
      const id = plantId != null ? Number(plantId) : null;
      setFoodWebHighlightPlantId(Number.isFinite(id) && id > 0 ? id : null);
      setTab('foodweb');
      setPlantCatalogPreview(null);
    },
    [setPlantCatalogPreview],
  );

  // Clic sur un terme auto-lié dans l'iframe d'un tutoriel : le message n'est accepté que
  // s'il vient de notre origine (audit A10 — un tutoriel `type = 'link'` affiche un site
  // tiers dans une iframe de la même page et pourrait sinon piloter la navigation).
  useEffect(() => {
    const onGlossaryMessage = (event) => {
      const code = readGlossaryTermMessage(event, window.location.origin);
      if (code) openGlossaryPopover(code);
    };
    window.addEventListener('message', onGlossaryMessage);
    return () => window.removeEventListener('message', onGlossaryMessage);
  }, [openGlossaryPopover]);

  const useWideMain = shouldUseDesktopSplit;
  const mapChromeCompactVisible =
    !loading && (useSplitMapTasks || (!useSplitMapTasks && tab === 'map'));
  const tutorialsModuleEnabled = publicSettings?.modules?.tutorials_enabled !== false;
  // F3 (option A) : la fusion contextuelle Tâches/Tuto est supprimée — les onglets
  // restent stables ; seule l'adaptation grand écran (vue « Cartes & tâches ») subsiste.
  const tasksTabLabel = tutorialsModuleEnabled ? '✅ Tâches et tuto' : '✅ Tâches';
  const mapTasksSplitLabel = tutorialsModuleEnabled
    ? '🗺️ Cartes, tâches et tuto'
    : '🗺️ Cartes & tâches';

  const rtStatus = useForetmapRealtime({
    enabled: !!(student || effectiveIsTeacher),
    fetchAll,
    forceLogout,
    activeMapId,
    setTasks,
    setTaskProjects,
    setZones,
    setPlants,
    setMarkers,
    pauseDataRefreshRef: pauseDataRefreshForTaskOverlaysRef,
    includeArchivedTasks: effectiveIsTeacher,
    setArchivedTasks,
    setArchivedTaskProjects,
  });
  const teacherSyncStatus = effectiveIsTeacher
    ? rtStatus === 'off'
      ? 'polling'
      : rtStatus
    : rtStatus;
  const isAdmin = effectiveRoleContext.roleSlug === 'admin';

  useTabNavigationGuards({
    tab,
    setTab,
    effectiveIsTeacher,
    canAccessStudentMapTasks,
    isVisitor,
    shouldUseDesktopSplit,
    canAccessForum,
    canViewGeneralStats,
    modules: publicSettings?.modules,
  });

  useEffect(() => {
    if (effectiveIsTeacher || !isVisitor || !student) return;
    const visitOk = publicSettings?.modules?.visit_enabled !== false;
    if (['map', 'tasks', 'maptasks', 'tuto'].includes(tab)) {
      setTab(visitOk ? 'visit' : 'plants');
    }
  }, [effectiveIsTeacher, isVisitor, student, tab, publicSettings?.modules?.visit_enabled, setTab]);

  useAppDataPolling({
    fetchAll,
    tab,
    rtStatus,
    refreshMs,
    isTabVisible,
    pauseRef: pauseDataRefreshForTaskOverlaysRef,
  });

  const updateZone = useCallback(
    async (id, data) => {
      await api(`/api/zones/${id}`, 'PUT', data);
      await fetchAll();
    },
    [fetchAll],
  );
  const {
    roleKey: notificationRoleKey,
    items: notifications,
    unreadCount: notificationsUnreadCount,
    latestCritical: latestCriticalNotification,
    prefs: notificationPrefs,
    metrics: notificationMetrics,
    addNotification,
    updatePreference,
    markAllRead,
    markAsRead,
    removeNotification,
    clearRead,
    trackOpenedPanel,
    trackActionClick,
    resetMetrics,
  } = useNotificationCenter({
    isTeacher: effectiveIsTeacher,
    isAdmin,
    tasksForActiveMap,
    student: studentForUi,
    teacherPendingValidationCount,
    rtStatus: teacherSyncStatus,
    serverDown,
    sessionValidationError,
    publicSettings,
  });

  useToastNotificationBridge({ toast, addNotification });

  const openNotificationAction = useCallback(
    (item) => {
      if (!item?.id) return;
      markAsRead(item.id);
      trackActionClick();
      const action = item.action || {};
      if (action.type === 'retryStudentValidation' && studentForUi && !effectiveIsTeacher) {
        validateStudentSession(studentForUi);
        return;
      }
      if (action.tab) {
        setTab(action.tab);
        return;
      }
    },
    [effectiveIsTeacher, markAsRead, studentForUi, trackActionClick, validateStudentSession],
  );

  // O5 — valeurs de session globales exposées par contexte (cf. SessionContext).
  // NB : hasPermission/hasPermissionInRole restent en props (volontairement) — le chemin élève
  // les omet pour forcer `() => false` ; un prof en « vue élève » garde ses droits réels, donc les
  // exposer globalement ferait réapparaître des contrôles prof côté vue élève. Idem identités.
  const sessionContextValue = useMemo(
    () => ({
      isN3Affiliated,
      canParticipateContextComments,
    }),
    [isN3Affiliated, canParticipateContextComments],
  );

  // O5 — données partagées exposées par contexte (cf. DataContext). `maps` exclu (variante
  // visibleMaps/maps) et VisitView exclu (noms de props distincts) : ces deux-là restent en props.
  const dataContextValue = useMemo(
    () => ({
      zones,
      markers,
      plants,
      tasks,
      tutorials,
      taskProjects,
      archivedTasks,
      archivedTaskProjects,
      activeMapId,
    }),
    [
      zones,
      markers,
      plants,
      tasks,
      tutorials,
      taskProjects,
      archivedTasks,
      archivedTaskProjects,
      activeMapId,
    ],
  );

  if (!student && !isTeacher)
    return (
      <UnauthenticatedShell
        publicSettings={publicSettings}
        toast={toast}
        onToastDone={handleToastDone}
        showPublicVisit={showPublicVisit}
        visitInitialMapId={publicSettings?.map?.default_map_visit || activeMapId}
        guestVisitNeedsMascotChoice={guestVisitNeedsMascotChoice}
        onGuestBackToAuth={onGuestBackToAuth}
        onGuestMascotChoiceDone={onGuestMascotChoiceDone}
        onLogin={handleAuthScreenLogin}
        onVisitGuest={handleVisitAsGuest}
        appVersion={appVersion}
        footerVersionPrefix={appFooterVersionPrefix}
        isN3Affiliated={isN3Affiliated}
      />
    );
  const currentUser =
    (effectiveIsTeacher ? sessionUser : studentForUi) || sessionUser || fallbackUser;
  const currentUserLabel =
    currentUser?.pseudo ||
    currentUser?.displayName ||
    formatFullName(currentUser) ||
    DEFAULT_USER_LABEL;

  return (
    <PublicSettingsProvider value={publicSettings}>
      <SessionProvider value={sessionContextValue}>
        <DataProvider value={dataContextValue}>
          <TourProvider tab={tab} isTeacher={effectiveIsTeacher} enabled={discoveryTourAutoEnabled}>
            <div id="app">
              {/* Fiche rapide du glossaire : hors des onglets et hors des modales, pour
                  survivre à tout changement de vue et se poser au-dessus de l'aperçu
                  de tutoriel (audit A1). */}
              {glossaryPopoverCode && (
                <GlossaryPopover
                  open
                  glossaryCode={glossaryPopoverCode}
                  onClose={closeGlossaryPopover}
                  onOpenFullGlossary={openPedagoGlossaryTerm}
                  showFullGlossaryLink={tab !== 'glossary'}
                />
              )}
              {plantCatalogPreview && (
                <Suspense fallback={null}>
                  <PlantCatalogPreviewModalLazy
                    plant={plantCatalogPreview}
                    maps={visibleMaps}
                    onClose={() => setPlantCatalogPreview(null)}
                    onForceLogout={forceLogout}
                    onOpenPlant={openPlantCatalogPreviewById}
                    onOpenGlossaryTerm={openGlossaryPopover}
                    onNavigateToFoodWeb={openPedagoFoodWeb}
                    onOpenQuizQuestion={openPedagoQuizQuestion}
                  />
                </Suspense>
              )}
              {showIosInstallHint && !deferredInstallPrompt && !isStandaloneMode && (
                <div className="fade-in install-ios-banner" role="status" aria-live="polite">
                  <span>
                    Pour installer ForetMap sur iPhone ou iPad : ouvre Safari, touche Partager, puis
                    « Sur l’écran d’accueil ».
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      safeLocalStorageSetItem(IOS_INSTALL_HINT_DISMISSED_KEY, '1');
                      setShowIosInstallHint(false);
                    }}
                  >
                    Masquer
                  </button>
                </div>
              )}
              {serverDown && (
                <NoticeBanner tone="warning">
                  {appServerDownNotice}
                  {/* Bouton rendu ici (plutôt que via `action`) pour pouvoir le désactiver
                      pendant la tentative et garantir une cible tactile ≥ 44px. */}
                  <button
                    type="button"
                    className="btn btn-sm"
                    style={{ marginLeft: 10, verticalAlign: 'middle', minHeight: 44 }}
                    onClick={retryServerNow}
                    disabled={retryingServer}
                  >
                    {appRetryNow}
                  </button>
                </NoticeBanner>
              )}
              {!serverDown && latestCriticalNotification && (
                <div className="fade-in notif-critical-banner" role="alert">
                  <strong>{latestCriticalNotification.title}</strong>{' '}
                  {latestCriticalNotification.message}
                </div>
              )}
              {sessionValidationError && studentForUi && !effectiveIsTeacher && (
                <NoticeBanner
                  tone="info"
                  action={{
                    label: 'Réessayer',
                    onClick: () => {
                      setSessionValidationError(false);
                      validateStudentSession(studentForUi);
                    },
                  }}
                >
                  <strong>Session pas encore recollée au serveur.</strong> Les infos peuvent être un
                  peu vieilles — un clic pour rafraîchir.
                </NoticeBanner>
              )}
              {isVisitor && !effectiveIsTeacher && studentForUi && (
                <NoticeBanner tone="info">
                  <strong>Ton compte n'est pas encore rattaché à une classe.</strong> Un professeur
                  doit t'ajouter à ton groupe pour débloquer la carte et les tâches — signale-le-lui
                  (ou utilise le code de classe s'il t'en a donné un à l'inscription). En attendant,
                  tu peux explorer la Visite et la Biodiversité.
                </NoticeBanner>
              )}
              <AppStatusSticky />
              {toast && <Toast msg={toast} onDone={handleToastDone} />}
              {profilePromotion &&
                !effectiveIsTeacher &&
                studentForUi &&
                !studentForUi.preview_mode && (
                  <AutoProfilePromotionModal
                    data={profilePromotion}
                    roleTerms={roleTerms}
                    onClose={() => setProfilePromotion(null)}
                  />
                )}
              {showPin && (
                <PinModal
                  onSuccess={() => {
                    setPinSuccessFetchAllTick((n) => n + 1);
                    setAuthClaims(getAuthClaims());
                    setShowPin(false);
                    setToast('Connexion professeur réussie, tout roule');
                  }}
                  onClose={() => setShowPin(false)}
                  uiSettings={publicSettings}
                  isN3Affiliated={isN3Affiliated}
                />
              )}
              {showStats && canOpenUserDialogs && (
                <AppUserDialog
                  open={showStats}
                  onClose={handleCloseStatsDialog}
                  ariaLabel="Statistiques utilisateur"
                  closeLabel="Fermer la fenêtre des statistiques"
                >
                  <StudentStatsLazy student={statsDialogTarget} />
                </AppUserDialog>
              )}
              {showProfile && canOpenUserDialogs && profileTargetUser && (
                <AppUserDialog
                  open={showProfile}
                  onClose={handleCloseProfileDialog}
                  ariaLabel="Profil utilisateur"
                  closeLabel="Fermer la fenêtre du profil"
                >
                  <StudentProfileEditorLazy
                    student={profileTargetUser}
                    maps={maps}
                    onUpdated={handleProfileUpdated}
                    onClose={handleCloseProfileDialog}
                  />
                </AppUserDialog>
              )}

              <AppHeader
                isStandaloneMode={isStandaloneMode}
                deferredInstallPrompt={deferredInstallPrompt}
                onInstallClick={handleInstallClick}
                isTeacher={isTeacher}
                effectiveIsTeacher={effectiveIsTeacher}
                appVersion={appVersion}
                teacherSyncStatus={teacherSyncStatus}
                publicSettings={publicSettings}
                notificationRoleKey={notificationRoleKey}
                notifications={notifications}
                notificationsUnreadCount={notificationsUnreadCount}
                notificationPrefs={notificationPrefs}
                notificationMetrics={notificationMetrics}
                onNotificationTogglePref={updatePreference}
                onNotificationOpenAction={openNotificationAction}
                onNotificationMarkAsRead={markAsRead}
                onNotificationMarkAllRead={markAllRead}
                onNotificationRemove={removeNotification}
                onNotificationClearRead={clearRead}
                onNotificationOpenPanel={trackOpenedPanel}
                onNotificationResetMetrics={resetMetrics}
                currentUser={currentUser}
                currentUserLabel={currentUserLabel}
                canOpenUserDialogs={canOpenUserDialogs}
                canOpenTeacherStatsFromBadge={canOpenTeacherStatsFromBadge}
                roleTerms={roleTerms}
                onOpenStats={handleOpenStatsDialog}
                onOpenTeacherStatsTab={handleOpenTeacherStatsTab}
                onOpenProfile={handleOpenProfileDialog}
                roleViewMode={roleViewMode}
                canSwitchToStudentView={canSwitchToStudentView}
                canSwitchToTeacherView={canSwitchToTeacherView}
                onRoleViewModeSelect={handleRoleViewModeSelect}
                onRequestPin={handleRequestPin}
                onLogout={handleLogout}
                helpText={helpText}
              />

              <RolePreviewBanners
                authClaims={authClaims}
                isTeacher={isTeacher}
                roleViewMode={roleViewMode}
                helpText={helpText}
                onStopImpersonation={stopAdminImpersonation}
              />

              {effectiveIsTeacher ? (
                <div
                  className={`main teacher-main app-main-shell app-main-shell--teacher ${useWideMain ? 'main--wide' : ''} ${mapChromeCompactVisible ? 'teacher-main--map-visible' : ''} ${useSplitMapTasks ? 'main--maptasks-split' : ''}`}
                >
                  <TeacherTopTabs
                    tab={tab}
                    onTabChange={handleTeacherTabChange}
                    shouldUseDesktopSplit={shouldUseDesktopSplit}
                    mapTasksSplitLabel={mapTasksSplitLabel}
                    tasksTabLabel={tasksTabLabel}
                    teacherPendingValidationCount={teacherPendingValidationCount}
                    tutorialsModuleEnabled={tutorialsModuleEnabled}
                    statsEnabled={publicSettings?.modules?.stats_enabled !== false}
                    visitEnabled={publicSettings?.modules?.visit_enabled !== false}
                    canAccessForum={canAccessForum}
                    isN3Affiliated={isN3Affiliated}
                    hasPermission={hasPermission}
                    hasPermissionInRole={hasPermissionInRole}
                  />
                  {loading ? (
                    <AppLoader text={appLoaderText} style={FULL_PAGE_LOADER_STYLE} />
                  ) : (
                    <>
                      <MapTasksArea
                        isTeacher
                        student={currentUser}
                        maps={visibleMaps}
                        onMapChange={setActiveMapId}
                        useSplitMapTasks={useSplitMapTasks}
                        tab={tab}
                        tutorialsModuleEnabled={tutorialsModuleEnabled}
                        canAccessSoloMapTasks
                        canSelfAssignTasks
                        canViewOtherUsersIdentity
                        hasPermission={hasPermission}
                        hasPermissionInRole={hasPermissionInRole}
                        onZoneUpdate={updateZone}
                        onRefresh={fetchAll}
                        onForceLogout={forceLogout}
                        onLocationTasksFocus={handleMapLocationTasksFocus}
                        onNavigateToTasksForLocation={
                          effectiveIsTeacher || canAccessStudentMapTasks
                            ? navigateToTasksForLocation
                            : undefined
                        }
                        onTaskFormOverlayOpenChange={onTaskFormOverlayOpenChange}
                        mapLocationFocus={tasksLocationFocus}
                        onMapLocationFocusChange={setTasksLocationFocus}
                        onOpenPlantCatalogPreview={openPlantCatalogPreviewById}
                        onPersistVisitMascotId={onPersistVisitMascotId}
                      />
                      {tab === 'plants' && (
                        <TabSuspense>
                          <PlantManagerLazy
                            onRefresh={fetchAll}
                            maps={visibleMaps}
                            onForceLogout={forceLogout}
                          />
                        </TabSuspense>
                      )}
                      {publicSettings?.modules?.tutorials_enabled !== false && tab === 'tuto' && (
                        <TabSuspense>
                          <TutorialsViewLazy
                            maps={visibleMaps}
                            isTeacher
                            onRefresh={fetchAll}
                            onForceLogout={forceLogout}
                          />
                        </TabSuspense>
                      )}
                      {publicSettings?.modules?.stats_enabled !== false &&
                        tab === 'stats' &&
                        (hasPermission('stats.read.all') ? (
                          <TabSuspense>
                            <TeacherStatsLazy />
                          </TabSuspense>
                        ) : (
                          <div className="empty">
                            <p>
                              Pas l’accès stats ici — demande un coup de main côté n3boss si besoin.
                            </p>
                          </div>
                        ))}
                      {tab === 'profiles' && (
                        <TabSuspense>
                          <ProfilesAdminViewLazy
                            maps={maps}
                            onImpersonationApplied={handleAdminImpersonationApplied}
                          />
                        </TabSuspense>
                      )}
                      {tab === 'audit' &&
                        (hasPermission('audit.read') ? (
                          <TabSuspense>
                            <AuditLogLazy />
                          </TabSuspense>
                        ) : (
                          <div className="empty">
                            <p>Journal d’audit réservé — il te manque un droit pour l’ouvrir.</p>
                          </div>
                        ))}
                      {publicSettings?.modules?.visit_enabled !== false &&
                        tab === 'mascot_packs' && (
                          <div
                            className="mascot-pack-studio-page"
                            style={{ padding: '12px 16px 24px' }}
                          >
                            <h2 className="section-title" style={{ marginTop: 0 }}>
                              Packs mascotte (visite)
                            </h2>
                            <p className="section-sub" style={{ marginBottom: 14 }}>
                              Les packs publiés sont proposés aux visiteurs sur{' '}
                              <strong>toutes les cartes</strong> de la visite.
                            </p>
                            <Suspense
                              fallback={
                                <AppLoader
                                  text="Chargement de l’éditeur packs mascotte…"
                                  style={MASCOT_PACK_LOADER_STYLE}
                                  textClassName="section-sub"
                                />
                              }
                            >
                              <VisitMascotPackManagerLazy
                                variant="page"
                                onPacksChanged={fetchAll}
                                onForceLogout={forceLogout}
                                mascotDialogSettings={publicSettings?.visit?.mascot?.dialog}
                                onDirtyChange={onMascotPackDirtyChange}
                              />
                            </Suspense>
                          </div>
                        )}
                      {tab === 'settings' && (
                        <TabSuspense>
                          <SettingsAdminViewLazy
                            canReadSettings={hasPermissionInRole('admin.settings.read')}
                            canManageTours={hasPermissionInRole('tours.manage')}
                          />
                        </TabSuspense>
                      )}
                      {tab === 'media_library' && (
                        <TabSuspense>
                          <MediaLibraryViewLazy canManage={canManageMediaLibrary} />
                        </TabSuspense>
                      )}
                      {tab === 'forum' && canAccessForum && (
                        <TabSuspense>
                          <ForumViewLazy authClaims={authClaims} canParticipateForum />
                        </TabSuspense>
                      )}
                      <PedagoTabs
                        isTeacher
                        tab={tab}
                        visitEnabled={publicSettings?.modules?.visit_enabled !== false}
                        student={currentUser}
                        tutorials={tutorials}
                        activeMapId={activeMapId}
                        zones={zones}
                        markers={markers}
                        onForceLogout={forceLogout}
                        onOpenMascotPackStudioTab={openMascotPackStudioTab}
                        onOpenPlantCatalogPreview={openPlantCatalogPreviewById}
                        onPersistVisitMascotId={onPersistVisitMascotId}
                        onOpenGlossaryTerm={openGlossaryPopover}
                        onOpenQuizQuestion={openPedagoQuizQuestion}
                        glossarySelectedCode={pedagoGlossaryCode}
                        onGlossarySelectedCodeChange={setPedagoGlossaryCode}
                        canManageQuiz={canManageQuiz}
                        quizInitialQuestionCode={pedagoQuizQuestionCode}
                        maps={visibleMaps}
                        foodWebHighlightPlantId={foodWebHighlightPlantId}
                        canManageFoodWeb={canManageFoodWeb}
                        appVersion={appVersion}
                      />
                    </>
                  )}
                </div>
              ) : (
                <>
                  <div
                    className={`main app-main-shell app-main-shell--student ${useWideMain ? 'main--wide' : ''} ${mapChromeCompactVisible ? 'main--map-visible' : ''} ${useSplitMapTasks ? 'main--maptasks-split' : ''}`}
                  >
                    {loading ? (
                      <AppLoader text={appLoaderText} style={FULL_PAGE_LOADER_STYLE} />
                    ) : (
                      <>
                        <MapTasksArea
                          isTeacher={false}
                          student={studentForUi}
                          maps={visibleMaps}
                          onMapChange={setActiveMapId}
                          useSplitMapTasks={useSplitMapTasks}
                          tab={tab}
                          tutorialsModuleEnabled={tutorialsModuleEnabled}
                          canAccessSoloMapTasks={canAccessStudentMapTasks}
                          splitMapCanSelfAssignTasks={canSelfAssignTasks}
                          canSelfAssignTasks={canSelfAssignTasks}
                          canEnrollOnTasks={canSelfAssignMoreTasks}
                          canViewOtherUsersIdentity={canViewOtherUsersIdentity}
                          onZoneUpdate={updateZone}
                          onRefresh={fetchAll}
                          onForceLogout={forceLogout}
                          onLocationTasksFocus={handleMapLocationTasksFocus}
                          onNavigateToTasksForLocation={navigateToTasksForLocation}
                          onTaskFormOverlayOpenChange={onTaskFormOverlayOpenChange}
                          mapLocationFocus={tasksLocationFocus}
                          onMapLocationFocusChange={setTasksLocationFocus}
                          onOpenPlantCatalogPreview={openPlantCatalogPreviewById}
                          onPersistVisitMascotId={onPersistVisitMascotId}
                        />
                        {tab === 'plants' && (
                          <TabSuspense>
                            <PlantViewerLazy
                              maps={visibleMaps}
                              onForceLogout={forceLogout}
                              onOpenPlant={openPlantCatalogPreviewById}
                              onOpenGlossaryTerm={openGlossaryPopover}
                              onNavigateToFoodWeb={openPedagoFoodWeb}
                            />
                          </TabSuspense>
                        )}
                        {publicSettings?.modules?.tutorials_enabled !== false && tab === 'tuto' && (
                          <TabSuspense>
                            <TutorialsViewLazy
                              maps={visibleMaps}
                              isTeacher={false}
                              onRefresh={fetchAll}
                              onForceLogout={forceLogout}
                            />
                          </TabSuspense>
                        )}
                        {tab === 'stats' && canViewGeneralStats && (
                          <TabSuspense>
                            <TeacherStatsLazy />
                          </TabSuspense>
                        )}
                        {publicSettings?.modules?.observations_enabled !== false &&
                          tab === 'notebook' && (
                            <TabSuspense>
                              <ObservationNotebookLazy
                                student={studentForUi}
                                onForceLogout={forceLogout}
                              />
                            </TabSuspense>
                          )}
                        {tab === 'forum' && canAccessForum && (
                          <TabSuspense>
                            <ForumViewLazy
                              authClaims={authClaims}
                              canParticipateForum={canParticipateForum}
                            />
                          </TabSuspense>
                        )}
                        <PedagoTabs
                          isTeacher={false}
                          tab={tab}
                          visitEnabled={publicSettings?.modules?.visit_enabled !== false}
                          student={studentForUi}
                          tutorials={tutorials}
                          activeMapId={activeMapId}
                          zones={zones}
                          markers={markers}
                          onForceLogout={forceLogout}
                          onOpenPlantCatalogPreview={openPlantCatalogPreviewById}
                          onPersistVisitMascotId={onPersistVisitMascotId}
                          onOpenGlossaryTerm={openGlossaryPopover}
                          onOpenQuizQuestion={openPedagoQuizQuestion}
                          glossarySelectedCode={pedagoGlossaryCode}
                          onGlossarySelectedCodeChange={setPedagoGlossaryCode}
                          quizInitialQuestionCode={pedagoQuizQuestionCode}
                          maps={visibleMaps}
                          foodWebHighlightPlantId={foodWebHighlightPlantId}
                          canManageFoodWeb={canManageFoodWeb}
                          appVersion={appVersion}
                        />
                      </>
                    )}
                  </div>
                  <StudentBottomNav
                    tab={tab}
                    onTabChange={setTab}
                    canAccessStudentMapTasks={canAccessStudentMapTasks}
                    isVisitor={isVisitor}
                    shouldUseDesktopSplit={shouldUseDesktopSplit}
                    tutorialsModuleEnabled={tutorialsModuleEnabled}
                    studentActiveAssignedTasksCount={studentActiveAssignedTasksCount}
                    canViewGeneralStats={canViewGeneralStats}
                    observationsEnabled={publicSettings?.modules?.observations_enabled !== false}
                    visitEnabled={publicSettings?.modules?.visit_enabled !== false}
                    canAccessForum={canAccessForum}
                  />
                </>
              )}
              <AppFooter versionPrefix={appFooterVersionPrefix} appVersion={appVersion} />
            </div>
          </TourProvider>
        </DataProvider>
      </SessionProvider>
    </PublicSettingsProvider>
  );
}

export { App };
