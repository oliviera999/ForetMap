import React, { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import {
  api,
  AccountDeletedError,
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
  FETCH_ALL_AUTO_DEBOUNCE_MS,
  getFetchAllLoopAbortReason,
  DATA_REFRESH_INTERVAL_MS,
  POLLING_COARSE_TABS,
  IOS_INSTALL_HINT_DISMISSED_KEY,
  GUEST_VISIT_MASCOT_CONFIRMED_KEY,
} from './constants/app-runtime';
import { MASCOT_PACK_UNSAVED_LEAVE_MSG } from './constants/mascotPackEditor.js';
import { ErrorBoundary } from './components/ErrorBoundary';
import { TimedToast as Toast } from './shared/components/TimedToast.jsx';
import { AuthScreen, PinModal } from './components/auth-views';
const StudentStatsLazy = lazy(() =>
  import('./components/stats-views').then((m) => ({ default: m.StudentStats })),
);
const StudentProfileEditorLazy = lazy(() =>
  import('./components/stats-views').then((m) => ({ default: m.StudentProfileEditor })),
);
import { TabSuspense } from './components/TabSuspense.jsx';

const VisitViewLazy = lazy(() =>
  import('./components/visit-views').then((m) => ({ default: m.VisitView })),
);
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
import { getRoleTerms, isN3OnlyAffiliation } from './utils/n3-terminology';
import { allowedMapIdsFromAffiliation, mapsForAffiliationScope } from './utils/mapAffiliation';
import { getContentText } from './utils/content';
import { safeLocalStorageGetItem, safeLocalStorageSetItem } from './utils/browserStorage.js';
import { useOverlayHistoryBack } from './hooks/useOverlayHistoryBack';
import { abandonAllOverlays, pushOverlayClose } from './utils/overlayHistory';
import { keepPrevIfEqual } from './utils/stableCollection';
import { partitionByArchived } from './utils/taskArchive';
import { AutoProfilePromotionModal } from './components/AutoProfilePromotionModal.jsx';
import { AppHeader } from './components/app/AppHeader.jsx';
import { MapTasksArea } from './components/app/MapTasksArea.jsx';
import { NoticeBanner } from './components/app/NoticeBanner.jsx';
import { PedagoTabs } from './components/app/PedagoTabs.jsx';
import { TeacherTopTabs } from './components/app/TeacherTopTabs.jsx';
import { StudentBottomNav } from './components/app/StudentBottomNav.jsx';
import { RolePreviewBanners } from './components/app/RolePreviewBanners.jsx';
import { DialogShell } from './components/DialogShell';
import { PublicSettingsProvider } from './contexts/PublicSettingsContext.jsx';
import { SessionProvider } from './contexts/SessionContext.jsx';
import { DataProvider } from './contexts/DataContext.jsx';
import { TourProvider } from './contexts/TourContext.jsx';
import { readStoredTab } from './utils/appShellHelpers';
import { useAppBootstrap } from './hooks/useAppBootstrap';
import { useTabNavigationGuards } from './hooks/useTabNavigationGuards';
import { useAppStoragePersistence } from './hooks/useAppStoragePersistence';
import { useSessionWindowSync } from './hooks/useSessionWindowSync';
import { useToastNotificationBridge } from './hooks/useToastNotificationBridge';
import { useRoleViewModeReset } from './hooks/useRoleViewModeReset';
import { useAuthMeHydration } from './hooks/useAuthMeHydration';
import { useDefaultActiveMapFromSettings } from './hooks/useDefaultActiveMapFromSettings';
import { useActiveMapVisibilityReconciler } from './hooks/useActiveMapVisibilityReconciler';
import { useStudentSessionRef } from './hooks/useStudentSessionRef';

const DEFAULT_MAPS = [];

// ── APP ───────────────────────────────────────────────────────────────────────
function App() {
  const initialSession = useMemo(() => getStoredSession(), []);
  const [student, setStudent] = useState(() => initialSession?.student || null);
  const studentRef = useStudentSessionRef(initialSession?.student || null, student);
  /** Pendant les modales de la vue Tâches : pas de rafraîchissement données (évite la perte du clavier virtuel mobile). */
  const pauseDataRefreshForTaskOverlaysRef = useRef(false);
  /** Instantané des paramètres lus par fetchAll (évite de recréer fetchAll à chaque rendu). */
  const fetchAllContextRef = useRef({});
  const [sessionUser, setSessionUser] = useState(() => initialSession?.user || null);
  const [showPin, setShowPin] = useState(false);
  const [showPublicVisit, setShowPublicVisit] = useState(false);
  const [guestVisitNeedsMascotChoice, setGuestVisitNeedsMascotChoice] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [tab, setTab] = useState(() => readStoredTab());
  /** Synchronise le filtre lieu de l’onglet tâches avec la zone/repère ouvert(e) sur la carte. */
  const [tasksLocationFocus, setTasksLocationFocus] = useState(null);
  const [maps, setMaps] = useState(DEFAULT_MAPS);
  const [activeMapId, setActiveMapId] = useState(() =>
    String(safeLocalStorageGetItem('foretmap_active_map', '') || '').trim(),
  );
  const [zones, setZones] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [taskProjects, setTaskProjects] = useState([]);
  // Archives isolées (prof) : hors listes actives partagées pour ne pas polluer carte/modales.
  const [archivedTasks, setArchivedTasks] = useState([]);
  const [archivedTaskProjects, setArchivedTaskProjects] = useState([]);
  const [plants, setPlants] = useState([]);
  const [tutorials, setTutorials] = useState([]);
  const [markers, setMarkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [profilePromotion, setProfilePromotion] = useState(null);
  const [sessionValidationError, setSessionValidationError] = useState(false);
  const [refreshMs, setRefreshMs] = useState(DATA_REFRESH_INTERVAL_MS);
  const [serverDown, setServerDown] = useState(false);
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
  const failCountRef = useRef(0);
  const prevTabForPollingRef = useRef(tab);
  /** Promesse du chargement global en cours ; les appels suivants s’y accrochent et peuvent demander une nouvelle passe. */
  const fetchAllRunPromiseRef = useRef(null);
  const fetchAllPendingRef = useRef(false);
  const initialFetchDoneRef = useRef(false);
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

  // Auto-démarrage du mode visite/découverte : modules activés, app prête,
  // session établie et pas d'onboarding mascotte invité en attente.
  const discoveryTourAutoEnabled =
    publicSettingsReady &&
    !loading &&
    publicSettings?.modules?.help_enabled !== false &&
    publicSettings?.help?.discovery_tour !== false &&
    !guestVisitNeedsMascotChoice &&
    !!(sessionUser || student || showPublicVisit);

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

  const canManageTutorials = useMemo(() => {
    const roleSlug = effectiveRoleContext.roleSlug;
    const nativePrivileged = !!authClaims?.nativePrivileged;
    const allowedRole = roleSlug === 'prof' || roleSlug === 'admin' || nativePrivileged;
    return allowedRole && hasPermissionInRole('tutorials.manage');
  }, [effectiveRoleContext.roleSlug, hasPermissionInRole, authClaims?.nativePrivileged]);

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

  useAppStoragePersistence({ activeMapId, tab, onToast: setToast });

  useDefaultActiveMapFromSettings({
    publicSettingsReady,
    publicSettings,
    effectiveIsTeacher,
    showPublicVisit,
    setActiveMapId,
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

  // Snapshot lu par fetchAll : posé en effet (pas pendant le rendu — fragile en
  // rendu concurrent, un rendu interrompu pourrait laisser un snapshot jamais
  // commité). Le décalage d'un tick est absorbé par la boucle fetchAllPendingRef.
  useEffect(() => {
    fetchAllContextRef.current = {
      activeMapId,
      effectiveIsTeacher,
      showPublicVisit,
      studentAffiliation: student?.affiliation,
      canManageTutorials,
      defaultMapStudent: publicSettings?.map?.default_map_student,
      defaultMapTeacher: publicSettings?.map?.default_map_teacher,
      defaultMapVisit: publicSettings?.map?.default_map_visit,
    };
  });

  const fetchAll = useCallback(() => {
    if (fetchAllRunPromiseRef.current) {
      fetchAllPendingRef.current = true;
      return fetchAllRunPromiseRef.current;
    }
    const job = (async () => {
      const jobStartedAt = Date.now();
      let loopIterations = 0;
      try {
        // Tant qu’une action (ex. changement de statut) a demandé un rafraîchissement pendant la passe en cours, on relit le ref à jour.
        while (true) {
          loopIterations += 1;
          const abortReason = getFetchAllLoopAbortReason({ loopIterations, jobStartedAt });
          if (abortReason === 'iterations') {
            console.warn('[ForetMap] fetchAll : plafond d’itérations atteint');
            break;
          }
          if (abortReason === 'wall') {
            console.warn('[ForetMap] fetchAll : délai maximal dépassé');
            setServerDown(true);
            setRefreshMs(120000);
            break;
          }
          fetchAllPendingRef.current = false;
          const snap = fetchAllContextRef.current;
          const {
            activeMapId: mapIdState,
            effectiveIsTeacher: isTeacherSnap,
            showPublicVisit: visitSnap,
            studentAffiliation,
            canManageTutorials: canTutorialsSnap,
            defaultMapStudent,
            defaultMapTeacher,
            defaultMapVisit,
          } = snap;

          try {
            const safeApi = async (request, fallbackValue) => {
              try {
                return await request();
              } catch (err) {
                if (err instanceof AccountDeletedError) throw err;
                console.error(err);
                return fallbackValue;
              }
            };

            const restrictedMapIds =
              !isTeacherSnap && !visitSnap
                ? allowedMapIdsFromAffiliation(studentAffiliation)
                : null;

            const mapsRes = await safeApi(() => api('/api/maps'), DEFAULT_MAPS);
            const safeMaps = Array.isArray(mapsRes) && mapsRes.length > 0 ? mapsRes : DEFAULT_MAPS;
            setMaps(safeMaps);

            const visibleAllowedMaps = mapsForAffiliationScope(safeMaps, restrictedMapIds);
            const requestedMapId =
              restrictedMapIds && !restrictedMapIds.includes(mapIdState)
                ? restrictedMapIds[0]
                : mapIdState;
            const defaultMap = visitSnap
              ? defaultMapVisit
              : isTeacherSnap
                ? defaultMapTeacher
                : defaultMapStudent;
            const fallbackMap =
              visibleAllowedMaps.find((mp) => mp.id === defaultMap)?.id ||
              visibleAllowedMaps[0]?.id ||
              requestedMapId ||
              '';
            const resolvedMapId = visibleAllowedMaps.some((mp) => mp.id === requestedMapId)
              ? requestedMapId
              : fallbackMap;
            const mapQuery = resolvedMapId ? `map_id=${encodeURIComponent(resolvedMapId)}` : '';

            const tutorialsEndpoint = canTutorialsSnap
              ? '/api/tutorials?include_inactive=1'
              : '/api/tutorials';
            // Les profs récupèrent aussi les tâches/projets archivés (portée `all`) pour la
            // vue « Archivés » ; côté élève/visiteur le backend force la portée active.
            const archivedQuery = isTeacherSnap ? '&archived=all' : '';
            const [z, t, taskProjectsRes, p, m, tu] = await Promise.all([
              safeApi(() => (mapQuery ? api(`/api/zones?${mapQuery}`) : Promise.resolve([])), []),
              safeApi(
                () =>
                  mapQuery ? api(`/api/tasks?${mapQuery}${archivedQuery}`) : Promise.resolve([]),
                [],
              ),
              safeApi(
                () =>
                  mapQuery
                    ? api(`/api/task-projects?${mapQuery}${archivedQuery}`)
                    : Promise.resolve([]),
                [],
              ),
              safeApi(() => api('/api/plants'), []),
              safeApi(
                () => (mapQuery ? api(`/api/map/markers?${mapQuery}`) : Promise.resolve([])),
                [],
              ),
              safeApi(() => api(tutorialsEndpoint), []),
            ]);

            if (resolvedMapId !== mapIdState) {
              setActiveMapId(resolvedMapId);
            }
            // keepPrevIfEqual : conserve la référence quand le contenu n'a pas
            // changé → pas de re-render global du DataContext à chaque poll.
            setZones((prev) => keepPrevIfEqual(prev, z));
            if (Array.isArray(t)) {
              // Séparer actives / archivées : seules les actives alimentent l'état partagé.
              const { active: activeTasks, archived: archTasks } = partitionByArchived(t);
              setTasks((prev) => keepPrevIfEqual(prev, activeTasks));
              setArchivedTasks((prev) => keepPrevIfEqual(prev, archTasks));
            } else
              console.warn('[ForetMap] GET /api/tasks : réponse non tableau, état tâches inchangé');
            const { active: activeProjects, archived: archProjects } = partitionByArchived(
              Array.isArray(taskProjectsRes) ? taskProjectsRes : [],
            );
            setTaskProjects((prev) => keepPrevIfEqual(prev, activeProjects));
            setArchivedTaskProjects((prev) => keepPrevIfEqual(prev, archProjects));
            setPlants((prev) => keepPrevIfEqual(prev, p));
            setMarkers((prev) => keepPrevIfEqual(prev, m));
            setTutorials((prev) => keepPrevIfEqual(prev, tu));
            if (!isTeacherSnap) {
              const sess = studentRef.current;
              if (sess?.id && !sess.preview_mode) {
                const sid = sess.id;
                api('/api/auth/me')
                  .then((d) => {
                    if (studentRef.current?.id !== sid) return;
                    const hasSideEffects =
                      d?.taskEnrollment != null ||
                      typeof d?.forumParticipate === 'boolean' ||
                      typeof d?.contextCommentParticipate === 'boolean' ||
                      typeof d?.refreshedToken === 'string' ||
                      d?.autoProfilePromotion;
                    if (!hasSideEffects) return;
                    mergeAuthMeResponse(d, { studentIdForMatch: sid });
                  })
                  .catch(() => {});
              }
            }
            failCountRef.current = 0;
            setRefreshMs(DATA_REFRESH_INTERVAL_MS);
            setServerDown(false);
          } catch (e) {
            if (e instanceof AccountDeletedError) forceLogout();
            else {
              console.error(e);
              const isServerSide = e.status == null || e.status >= 500;
              if (isServerSide) {
                failCountRef.current += 1;
                if (failCountRef.current >= 3) {
                  setServerDown(true);
                  setRefreshMs(120000);
                }
              }
            }
          }
          if (!fetchAllPendingRef.current) break;
        }
      } finally {
        fetchAllRunPromiseRef.current = null;
        initialFetchDoneRef.current = true;
        setLoading(false);
      }
    })();
    fetchAllRunPromiseRef.current = job;
    return job;
  }, [forceLogout, mergeAuthMeResponse, studentRef]);

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
  const visibleMaps = useMemo(() => {
    const allowedMapIds =
      effectiveIsTeacher || showPublicVisit
        ? null
        : allowedMapIdsFromAffiliation(student?.affiliation);
    return mapsForAffiliationScope(maps, allowedMapIds);
  }, [maps, effectiveIsTeacher, showPublicVisit, student?.affiliation]);
  useActiveMapVisibilityReconciler({
    activeMapId,
    visibleMaps,
    effectiveIsTeacher,
    showPublicVisit,
    publicSettings,
    setActiveMapId,
  });
  const mascotStudioMapLabel = useMemo(() => {
    const m = visibleMaps.find((x) => x.id === activeMapId);
    return String(m?.label || m?.id || activeMapId || '').trim() || activeMapId;
  }, [visibleMaps, activeMapId]);
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

  const handleMascotStudioMapChange = useCallback(
    (nextMapId) => {
      const next = String(nextMapId || '').trim();
      if (!next || next === activeMapId) return;
      if (mascotPackDirtyRef.current && !window.confirm(MASCOT_PACK_UNSAVED_LEAVE_MSG)) return;
      setActiveMapId(next);
    },
    [activeMapId, setActiveMapId],
  );

  const openMascotPackStudioTab = useCallback(
    (mapIdForStudio) => {
      const mid = String(mapIdForStudio || '').trim();
      if (mid && visibleMaps.some((m) => m.id === mid)) {
        if (
          tab === 'mascot_packs' &&
          mid !== activeMapId &&
          mascotPackDirtyRef.current &&
          !window.confirm(MASCOT_PACK_UNSAVED_LEAVE_MSG)
        ) {
          return;
        }
        setActiveMapId(mid);
      }
      setTab('mascot_packs');
    },
    [visibleMaps, activeMapId, tab, setActiveMapId, setTab],
  );
  const previewStudent = useMemo(() => {
    if (!isTeacher || roleViewMode !== 'student') return null;
    const fallbackName = String(
      sessionUser?.displayName || authClaims?.roleDisplayName || 'Utilisateur',
    ).trim();
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
  const canParticipateForum = useMemo(() => {
    if (effectiveIsTeacher) return true;
    const s = studentForUi;
    if (!s) return true;
    if (typeof s.forumParticipate === 'boolean') return s.forumParticipate;
    if (s.forum_participate != null) return Number(s.forum_participate) !== 0;
    return true;
  }, [effectiveIsTeacher, studentForUi]);
  const canManageMediaLibrary = hasPermissionInRole('teacher.access');
  const canManageQuiz = useMemo(() => {
    const roleSlug = effectiveRoleContext.roleSlug;
    const nativePrivileged = !!authClaims?.nativePrivileged;
    const allowedRole = roleSlug === 'prof' || roleSlug === 'admin' || nativePrivileged;
    return allowedRole && hasPermissionInRole('plants.manage');
  }, [effectiveRoleContext.roleSlug, hasPermissionInRole, authClaims?.nativePrivileged]);
  const canManageFoodWeb = hasPermission('plants.manage');

  const canParticipateContextComments = useMemo(() => {
    if (effectiveIsTeacher) return true;
    const s = studentForUi;
    if (!s) return true;
    if (typeof s.contextCommentParticipate === 'boolean') return s.contextCommentParticipate;
    if (s.context_comment_participate != null) return Number(s.context_comment_participate) !== 0;
    return true;
  }, [effectiveIsTeacher, studentForUi]);
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
    const fallbackName = String(
      sessionUser?.displayName || authClaims?.roleDisplayName || 'Utilisateur',
    ).trim();
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
  const handleOpenTeacherStatsTab = useCallback(() => setTab('stats'), []);
  const handleOpenProfileDialog = useCallback(() => setShowProfile(true), []);
  const handleRequestPin = useCallback(() => setShowPin(true), []);

  /** Bascule de vue rôle (natif / élève / prof) : réinitialise onglet et dialogues. */
  const handleRoleViewModeSelect = useCallback((mode) => {
    setRoleViewMode(mode);
    setTab('map');
    setShowStats(false);
    setShowProfile(false);
  }, []);

  /** Déconnexion complète (session locale + états React). */
  const handleLogout = useCallback(() => {
    clearStoredSession();
    studentRef.current = null;
    setStudent(null);
    setSessionUser(null);
    setAuthClaims(null);
  }, [studentRef]);

  useOverlayHistoryBack(showStats && canOpenUserDialogs, () => setShowStats(false));
  useOverlayHistoryBack(showProfile && canOpenUserDialogs && !!profileTargetUser, () =>
    setShowProfile(false),
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

  useEffect(() => {
    const onGlossaryMessage = (event) => {
      const data = event?.data;
      if (!data || data.type !== 'foretmap:glossary') return;
      const code = String(data.code || '').trim();
      if (code) openPedagoGlossaryTerm(code);
    };
    window.addEventListener('message', onGlossaryMessage);
    return () => window.removeEventListener('message', onGlossaryMessage);
  }, [openPedagoGlossaryTerm]);

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

  const hasAuthenticatedShell = !!(student || isTeacher);

  useEffect(() => {
    if (!hasAuthenticatedShell) return undefined;
    if (initialFetchDoneRef.current) return undefined;
    void fetchAll();
    return undefined;
  }, [hasAuthenticatedShell, fetchAll]);

  useEffect(() => {
    if (!hasAuthenticatedShell) return undefined;
    let cancelled = false;
    const id = window.setTimeout(() => {
      if (!cancelled) void fetchAll();
    }, FETCH_ALL_AUTO_DEBOUNCE_MS);
    // Debounce standard : sur changement de deps, on annule le fetch en attente et on
    // reprogramme. Le fetch initial est déjà garanti par l'effet ci-dessus (fetchAll
    // immédiat tant que initialFetchDoneRef est faux) ; ne pas annuler ici accumulait
    // des timers et déclenchait plusieurs fetchAll pendant les rafales de deps au boot.
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [
    hasAuthenticatedShell,
    activeMapId,
    publicSettingsReady,
    effectiveIsTeacher,
    showPublicVisit,
    canManageTutorials,
    student?.affiliation,
    publicSettings?.map?.default_map_student,
    publicSettings?.map?.default_map_teacher,
    publicSettings?.map?.default_map_visit,
    fetchAll,
  ]);

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

  // Auto-refresh adaptatif (ralenti quand le push est actif, ralenti en arrière-plan).
  const pollingIntervalMs = useMemo(() => {
    const coarse = POLLING_COARSE_TABS.has(tab) ? 2 : 1;
    const liveAdjusted = rtStatus === 'live' ? Math.max(refreshMs, 90000) : refreshMs * coarse;
    return isTabVisible ? liveAdjusted : Math.max(liveAdjusted, 120000);
  }, [isTabVisible, refreshMs, rtStatus, tab]);

  useEffect(() => {
    if (rtStatus === 'live') return undefined;
    const id = setInterval(() => {
      if (pauseDataRefreshForTaskOverlaysRef.current) return;
      if (document.visibilityState === 'hidden') return;
      fetchAll();
    }, pollingIntervalMs);
    return () => clearInterval(id);
  }, [fetchAll, pollingIntervalMs, rtStatus]);

  /** En quittant un onglet « secondaire », on refetch une fois pour éviter des données trop vieilles à l’arrivée sur carte / tâches / visite. */
  useEffect(() => {
    const prev = prevTabForPollingRef.current;
    prevTabForPollingRef.current = tab;
    const wasCoarse = POLLING_COARSE_TABS.has(prev);
    const isCoarse = POLLING_COARSE_TABS.has(tab);
    if (wasCoarse && !isCoarse) void fetchAll();
  }, [tab, fetchAll]);

  const updateZone = useCallback(
    async (id, data) => {
      await api(`/api/zones/${id}`, 'PUT', data);
      await fetchAll();
    },
    [fetchAll],
  );
  const updateTeacherSession = useCallback(
    (updatedUser) => {
      setSessionUser((prev) => {
        const nextDisplayName =
          updatedUser?.pseudo ||
          updatedUser?.display_name ||
          `${updatedUser?.first_name || ''} ${updatedUser?.last_name || ''}`.trim() ||
          prev?.displayName ||
          'Utilisateur';
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
      <PublicSettingsProvider value={publicSettings}>
        <>
          {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
          {showPublicVisit ? (
            <div id="app">
              <div className="main main--guest-visit">
                <TabSuspense>
                  <VisitViewLazy
                    student={null}
                    isTeacher={false}
                    initialMapId={publicSettings?.map?.default_map_visit || activeMapId}
                    onBackToAuth={onGuestBackToAuth}
                    availableTutorials={[]}
                    requireGuestMascotChoice={guestVisitNeedsMascotChoice}
                    onGuestMascotChoiceDone={onGuestMascotChoiceDone}
                  />
                </TabSuspense>
              </div>
              <footer className="app-footer">
                {appFooterVersionPrefix} {appVersion != null ? appVersion : '…'}
              </footer>
            </div>
          ) : (
            <AuthScreen
              onLogin={(s) => {
                const userType = String(
                  s?.auth?.userType || s?.user_type || 'student',
                ).toLowerCase();
                if (userType === 'teacher') {
                  setStudent(null);
                  setSessionUser({
                    id: s?.auth?.canonicalUserId || s?.id || null,
                    userType: 'teacher',
                    displayName: s?.display_name || s?.auth?.roleDisplayName || 'Utilisateur',
                    email: s?.email || null,
                    avatar_path: s?.avatar_path || null,
                    visit_mascot_catalog_id: s?.visit_mascot_catalog_id || null,
                  });
                } else {
                  updateStudentSession(s);
                }
                const claims = getAuthClaims();
                setAuthClaims(claims);
                const roleSlug = String(claims?.roleSlug || '').toLowerCase();
                if (userType !== 'teacher' && roleSlug === 'visiteur') {
                  const visitOk = publicSettings?.modules?.visit_enabled !== false;
                  setTab(visitOk ? 'visit' : 'plants');
                }
              }}
              appVersion={appVersion}
              uiSettings={publicSettings}
              onVisitGuest={() => {
                pushOverlayClose(() => setShowPublicVisit(false));
                const guestAlreadyConfirmedMascot =
                  safeLocalStorageGetItem(GUEST_VISIT_MASCOT_CONFIRMED_KEY, null) === '1';
                setGuestVisitNeedsMascotChoice(!guestAlreadyConfirmedMascot);
                setShowPublicVisit(true);
              }}
              isN3Affiliated={isN3Affiliated}
            />
          )}
        </>
      </PublicSettingsProvider>
    );
  const currentUser =
    (effectiveIsTeacher ? sessionUser : studentForUi) || sessionUser || fallbackUser;
  const currentUserLabel =
    currentUser?.pseudo ||
    currentUser?.displayName ||
    `${currentUser?.first_name || ''} ${currentUser?.last_name || ''}`.trim() ||
    'Utilisateur';

  return (
    <PublicSettingsProvider value={publicSettings}>
      <SessionProvider value={sessionContextValue}>
        <DataProvider value={dataContextValue}>
          <TourProvider tab={tab} isTeacher={effectiveIsTeacher} enabled={discoveryTourAutoEnabled}>
            <div id="app">
              {plantCatalogPreview && (
                <Suspense fallback={null}>
                  <PlantCatalogPreviewModalLazy
                    plant={plantCatalogPreview}
                    maps={visibleMaps}
                    onClose={() => setPlantCatalogPreview(null)}
                    onForceLogout={forceLogout}
                    onOpenPlant={openPlantCatalogPreviewById}
                    onOpenGlossaryTerm={openPedagoGlossaryTerm}
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
                <NoticeBanner
                  tone="warning"
                  action={{
                    label: appRetryNow,
                    onClick: () => {
                      failCountRef.current = 0;
                      setRefreshMs(DATA_REFRESH_INTERVAL_MS);
                      setServerDown(false);
                      fetchAll();
                    },
                  }}
                >
                  {appServerDownNotice}
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
              {toast && <Toast msg={toast} onDone={() => setToast(null)} />}
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
                <DialogShell
                  open={showStats}
                  onClose={() => setShowStats(false)}
                  overlayClassName="modal-overlay"
                  dialogClassName="log-modal log-modal--with-close fade-in"
                  dialogStyle={{ maxHeight: '88vh' }}
                  ariaLabel="Statistiques utilisateur"
                  closeOnOverlay
                >
                  <div className="log-modal__head">
                    <button
                      type="button"
                      className="modal-close"
                      aria-label="Fermer la fenêtre des statistiques"
                      onClick={() => setShowStats(false)}
                    >
                      ✕
                    </button>
                  </div>
                  <div className="log-modal__scroll">
                    <Suspense fallback={null}>
                      <StudentStatsLazy student={{ id: profileTargetUserId }} />
                    </Suspense>
                  </div>
                </DialogShell>
              )}
              {showProfile && canOpenUserDialogs && profileTargetUser && (
                <DialogShell
                  open={showProfile}
                  onClose={() => setShowProfile(false)}
                  overlayClassName="modal-overlay"
                  dialogClassName="log-modal log-modal--with-close fade-in"
                  dialogStyle={{ maxHeight: '88vh' }}
                  ariaLabel="Profil utilisateur"
                  closeOnOverlay
                >
                  <div className="log-modal__head">
                    <button
                      type="button"
                      className="modal-close"
                      aria-label="Fermer la fenêtre du profil"
                      onClick={() => setShowProfile(false)}
                    >
                      ✕
                    </button>
                  </div>
                  <div className="log-modal__scroll">
                    <Suspense fallback={null}>
                      <StudentProfileEditorLazy
                        student={profileTargetUser}
                        maps={maps}
                        onUpdated={(updated) => {
                          if (effectiveIsTeacher) {
                            updateTeacherSession(updated);
                            return;
                          }
                          updateStudentSession(updated);
                        }}
                        onClose={() => setShowProfile(false)}
                      />
                    </Suspense>
                  </div>
                </DialogShell>
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
                    <div className="loader" style={{ height: '60vh' }}>
                      <div className="loader-leaf">🌿</div>
                      <p>{appLoaderText}</p>
                    </div>
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
                              Carte active :{' '}
                              <select
                                className="form-select"
                                style={{
                                  display: 'inline-block',
                                  maxWidth: 280,
                                  verticalAlign: 'middle',
                                }}
                                value={activeMapId}
                                onChange={(e) => handleMascotStudioMapChange(e.target.value)}
                                aria-label="Choisir la carte pour les packs mascotte"
                              >
                                {visibleMaps.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.label || m.id}
                                  </option>
                                ))}
                              </select>
                            </p>
                            <Suspense
                              fallback={
                                <div
                                  className="loader"
                                  style={{ padding: '24px 16px', minHeight: 120 }}
                                >
                                  <div className="loader-leaf">🌿</div>
                                  <p className="section-sub">
                                    Chargement de l’éditeur packs mascotte…
                                  </p>
                                </div>
                              }
                            >
                              <VisitMascotPackManagerLazy
                                variant="page"
                                mapId={activeMapId}
                                mapLabel={mascotStudioMapLabel}
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
                          <SettingsAdminViewLazy />
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
                        onOpenGlossaryTerm={openPedagoGlossaryTerm}
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
                      <div className="loader" style={{ height: '60vh' }}>
                        <div className="loader-leaf">🌿</div>
                        <p>{appLoaderText}</p>
                      </div>
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
                        />
                        {tab === 'plants' && (
                          <TabSuspense>
                            <PlantViewerLazy
                              maps={visibleMaps}
                              onForceLogout={forceLogout}
                              onOpenPlant={openPlantCatalogPreviewById}
                              onOpenGlossaryTerm={openPedagoGlossaryTerm}
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
                          onOpenGlossaryTerm={openPedagoGlossaryTerm}
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
              <footer className="app-footer">
                {appFooterVersionPrefix} {appVersion != null ? appVersion : '…'}
              </footer>
            </div>
          </TourProvider>
        </DataProvider>
      </SessionProvider>
    </PublicSettingsProvider>
  );
}

export { App };
