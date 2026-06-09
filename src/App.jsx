import React, {
  useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense,
} from 'react';
import {
  api,
  AccountDeletedError,
  getAuthClaims,
  getAuthToken,
  getStoredSession,
  saveLegacyStudentSnapshot,
  saveStoredSession,
  clearStoredSession,
  withAppBase,
  isElevatedJwt,
} from './services/api';
import { useForetmapRealtime } from './hooks/useForetmapRealtime';
import { useNotificationCenter } from './hooks/useNotificationCenter';
import { RT_PROF_TOOLTIPS } from './constants/realtime';
import { NOTIFICATION_CATEGORY, NOTIFICATION_LEVEL } from './constants/notifications';
import { HELP_TOOLTIPS, resolveRoleText } from './constants/help';
import {
  DESKTOP_SPLIT_MIN_WIDTH,
  DESKTOP_SPLIT_MIN_MAP_PX,
  DESKTOP_SPLIT_MIN_TASKS_PX,
  TAB_STORAGE_KEY,
  FETCH_ALL_AUTO_DEBOUNCE_MS,
  getFetchAllLoopAbortReason,
  DATA_REFRESH_INTERVAL_MS,
  POLLING_COARSE_TABS,
  IOS_INSTALL_HINT_DISMISSED_KEY,
  GUEST_VISIT_MASCOT_CONFIRMED_KEY,
  DEFAULT_VISIT_MASCOT_ALLOWED_IDS,
  KNOWN_TAB_VALUES,
} from './constants/app-runtime';
import { ErrorBoundary } from './components/ErrorBoundary';
import { TimedToast as Toast } from './shared/components/TimedToast.jsx';
import { TasksView } from './components/tasks-views';
import { MapView } from './components/map-views';
import { AuthScreen, PinModal } from './components/auth-views';
const StudentStatsLazy = lazy(() => import('./components/stats-views').then((m) => ({ default: m.StudentStats })));
const StudentProfileEditorLazy = lazy(() => import('./components/stats-views').then((m) => ({ default: m.StudentProfileEditor })));
import { StudentAvatar } from './components/student-avatar';
import { NotificationCenter } from './components/notifications-center';
import { TabSuspense } from './components/TabSuspense.jsx';

const VisitViewLazy = lazy(() => import('./components/visit-views').then((m) => ({ default: m.VisitView })));
const PlantManagerLazy = lazy(() => import('./components/foretmap-views').then((m) => ({ default: m.PlantManager })));
const PlantViewerLazy = lazy(() => import('./components/foretmap-views').then((m) => ({ default: m.PlantViewer })));
const ObservationNotebookLazy = lazy(() => import('./components/foretmap-views').then((m) => ({ default: m.ObservationNotebook })));
// Modale a la demande : lazy pour que foretmap-views (PlantManager/Viewer/Notebook ~52 Ko) quitte le chunk main.
const PlantCatalogPreviewModalLazy = lazy(() => import('./components/foretmap-views').then((m) => ({ default: m.PlantCatalogPreviewModal })));
const TutorialsViewLazy = lazy(() => import('./components/tutorials-views').then((m) => ({ default: m.TutorialsView })));
const TeacherStatsLazy = lazy(() => import('./components/stats-views').then((m) => ({ default: m.TeacherStats })));
const ProfilesAdminViewLazy = lazy(() => import('./components/profiles-views').then((m) => ({ default: m.ProfilesAdminView })));
const AuditLogLazy = lazy(() => import('./components/audit-views').then((m) => ({ default: m.AuditLog })));
const SettingsAdminViewLazy = lazy(() => import('./components/settings-admin-views').then((m) => ({ default: m.SettingsAdminView })));
const MediaLibraryViewLazy = lazy(() => import('./components/media-library-views').then((m) => ({ default: m.MediaLibraryView })));
const ForumViewLazy = lazy(() => import('./components/forum-views').then((m) => ({ default: m.ForumView })));
const AboutViewLazy = lazy(() => import('./components/about-views').then((m) => ({ default: m.AboutView })));
const VisitMascotPackManagerLazy = lazy(() => import('./components/VisitMascotPackManager.jsx'));
import { Tooltip } from './components/Tooltip';
import { getRoleTerms, isN3OnlyAffiliation } from './utils/n3-terminology';
import { allowedMapIdsFromAffiliation, mapsForAffiliationScope } from './utils/mapAffiliation';
import { getContentText } from './utils/content';
import {
  safeLocalStorageGetItem,
  safeLocalStorageRemoveItem,
  safeLocalStorageSetItem,
  safeSessionStorageGetItem,
  safeSessionStorageRemoveItem,
} from './utils/browserStorage.js';
import { useOverlayHistoryBack } from './hooks/useOverlayHistoryBack';
import { abandonAllOverlays, pushOverlayClose } from './utils/overlayHistory';
import { AutoProfilePromotionModal } from './components/AutoProfilePromotionModal.jsx';
import { DialogShell } from './components/DialogShell';
import { PublicSettingsProvider } from './contexts/PublicSettingsContext.jsx';
import { SessionProvider } from './contexts/SessionContext.jsx';
import { DataProvider } from './contexts/DataContext.jsx';

const OAUTH_ERROR_MESSAGES = {
  oauth_not_configured: 'Connexion Google indisponible (configuration serveur incomplète).',
  oauth_google_refused: 'Connexion Google annulée.',
  oauth_invalid_state: 'Connexion Google invalide (session expirée).',
  oauth_missing_code: 'Connexion Google impossible (code manquant).',
  oauth_missing_id_token: 'Connexion Google impossible (token manquant).',
  oauth_invalid_token: 'Connexion Google impossible (token invalide).',
  oauth_claims_invalid: 'Connexion Google refusée (compte non vérifié).',
  oauth_email_not_allowed: 'Adresse Google non autorisée pour ForetMap.',
  oauth_teacher_inactive: 'Compte n3boss inactif.',
  oauth_teacher_no_role: 'Aucun rôle n3boss attribué à ce compte.',
  oauth_server_error: 'Erreur serveur pendant la connexion Google.',
};

function decodeBase64UrlJson(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return JSON.parse(window.atob(padded));
}

function readStoredTab() {
  const raw = String(safeLocalStorageGetItem(TAB_STORAGE_KEY, '') || '').trim().toLowerCase();
  if (!raw) return 'map';
  return KNOWN_TAB_VALUES.has(raw) ? raw : 'map';
}

function detectIosDevice() {
  const ua = String(window.navigator.userAgent || '').toLowerCase();
  return ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod');
}

function pickVisibleMapId(visibleMaps, preferredMapId = '') {
  const preferred = String(preferredMapId || '').trim();
  if (!Array.isArray(visibleMaps) || visibleMaps.length === 0) return '';
  if (preferred && visibleMaps.some((map) => map.id === preferred)) return preferred;
  return String(visibleMaps[0]?.id || '').trim();
}

// ── APP ───────────────────────────────────────────────────────────────────────
function App() {
  const initialSession = useMemo(() => getStoredSession(), []);
  const DEFAULT_MAPS = useMemo(() => ([]), []);
  const DEFAULT_PUBLIC_SETTINGS = useMemo(() => ({
    auth: {
      allow_register: true,
      allow_google_student: true,
      allow_google_teacher: true,
      allow_guest_visit: true,
      default_mode: 'login',
      welcome_message: '',
    },
    map: {
      default_map_student: 'foret',
      default_map_teacher: 'foret',
      default_map_visit: 'foret',
      emoji_label_center_gap: 14,
      overlay_emoji_size_percent: 100,
      overlay_label_size_percent: 100,
    },
    modules: {
      tutorials_enabled: true,
      visit_enabled: true,
      stats_enabled: true,
      observations_enabled: true,
      help_enabled: true,
      forum_enabled: true,
      context_comments_enabled: true,
    },
    help: {
      show_context_hints: true,
      pulse_unseen_panels: true,
    },
    visit: {
      mascot: {
        allowed_ids: DEFAULT_VISIT_MASCOT_ALLOWED_IDS,
        default_id: 'renard2-cut-spritesheet',
      },
    },
  }), []);
  const [student,    setStudent]    = useState(() => initialSession?.student || null);
  const studentRef = useRef(initialSession?.student || null);
  useEffect(() => {
    studentRef.current = student;
  }, [student]);
  /** Pendant les modales de la vue Tâches : pas de rafraîchissement données (évite la perte du clavier virtuel mobile). */
  const pauseDataRefreshForTaskOverlaysRef = useRef(false);
  /** Instantané des paramètres lus par fetchAll (évite de recréer fetchAll à chaque rendu). */
  const fetchAllContextRef = useRef({});
  const [sessionUser, setSessionUser] = useState(() => initialSession?.user || null);
  const [isTeacher,  setIsTeacher]  = useState(() => {
    const claims = getAuthClaims();
    return Array.isArray(claims?.permissions) && claims.permissions.includes('teacher.access');
  });
  const [showPin,    setShowPin]    = useState(false);
  const [showPublicVisit, setShowPublicVisit] = useState(false);
  const [guestVisitNeedsMascotChoice, setGuestVisitNeedsMascotChoice] = useState(false);
  const [showStats,  setShowStats]  = useState(false);
  const [showProfile,setShowProfile]= useState(false);
  const [tab,        setTab]        = useState(() => readStoredTab());
  /** Synchronise le filtre lieu de l’onglet tâches avec la zone/repère ouvert(e) sur la carte. */
  const [tasksLocationFocus, setTasksLocationFocus] = useState(null);
  const [maps,       setMaps]       = useState(DEFAULT_MAPS);
  const [activeMapId, setActiveMapId] = useState(() => String(safeLocalStorageGetItem('foretmap_active_map', '') || '').trim());
  const [zones,      setZones]      = useState([]);
  const [tasks,      setTasks]      = useState([]);
  const [taskProjects, setTaskProjects] = useState([]);
  const [plants,     setPlants]     = useState([]);
  const [tutorials,  setTutorials]  = useState([]);
  const [markers,    setMarkers]    = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [toast,      setToast]      = useState(null);
  const [profilePromotion, setProfilePromotion] = useState(null);
  const [sessionValidationError, setSessionValidationError] = useState(false);
  const [appVersion, setAppVersion] = useState(null);
  const [refreshMs,  setRefreshMs]  = useState(DATA_REFRESH_INTERVAL_MS);
  const [serverDown, setServerDown] = useState(false);
  const [authClaims, setAuthClaims] = useState(() => getAuthClaims());
  const [roleViewMode, setRoleViewMode] = useState('native'); // native | student | teacher
  const [publicSettings, setPublicSettings] = useState(DEFAULT_PUBLIC_SETTINGS);
  const [publicSettingsReady, setPublicSettingsReady] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth || 0);
  const [isTabVisible, setIsTabVisible] = useState(() => document.visibilityState !== 'hidden');
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState(null);
  const [showIosInstallHint, setShowIosInstallHint] = useState(false);
  const [isStandaloneMode, setIsStandaloneMode] = useState(() => {
    const displayStandalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
    const iosStandalone = window.navigator.standalone === true;
    return displayStandalone || iosStandalone;
  });
  const failCountRef = useRef(0);
  const prevTabForPollingRef = useRef(tab);
  const viewportResizeRafRef = useRef(null);
  /** Promesse du chargement global en cours ; les appels suivants s’y accrochent et peuvent demander une nouvelle passe. */
  const fetchAllRunPromiseRef = useRef(null);
  const fetchAllPendingRef = useRef(false);
  const initialFetchDoneRef = useRef(false);
  /** Incrémenté après succès modale PIN / login prof : déclenche un `fetchAll` sans s’accrocher à chaque changement de `authClaims`. */
  const [pinSuccessFetchAllTick, setPinSuccessFetchAllTick] = useState(0);
  const isIosDevice = useMemo(() => detectIosDevice(), []);

  const effectiveRoleContext = useMemo(() => {
    const roleSlug = String(authClaims?.roleSlug || '').toLowerCase();
    const activePermsRaw = Array.isArray(authClaims?.permissions) ? authClaims.permissions : [];
    const elevatablePermsRaw = Array.isArray(authClaims?.elevatedPermissions) ? authClaims.elevatedPermissions : [];
    let activePerms = activePermsRaw;
    let elevatablePerms = elevatablePermsRaw;
    if (roleViewMode === 'teacher' && roleSlug === 'admin') {
      activePerms = activePermsRaw.filter((perm) => !String(perm).startsWith('admin.'));
      elevatablePerms = elevatablePermsRaw.filter((perm) => !String(perm).startsWith('admin.'));
    }
    const canUseTeacherUi = activePerms.includes('teacher.access');
    const effectiveIsTeacher = canUseTeacherUi && roleViewMode !== 'student';
    return {
      roleSlug,
      activePerms,
      elevatablePerms,
      effectiveIsTeacher,
    };
  }, [authClaims, roleViewMode]);

  const effectiveIsTeacher = effectiveRoleContext.effectiveIsTeacher;
  const helpText = useCallback((entry) => resolveRoleText(entry, effectiveIsTeacher), [effectiveIsTeacher]);

  const hasPermission = useCallback((perm) => {
    return effectiveRoleContext.activePerms.includes(perm);
  }, [effectiveRoleContext.activePerms]);

  const hasPermissionInRole = useCallback((perm) => {
    const activePerms = effectiveRoleContext.activePerms;
    const elevatablePerms = effectiveRoleContext.elevatablePerms;
    return activePerms.includes(perm) || elevatablePerms.includes(perm);
  }, [effectiveRoleContext.activePerms, effectiveRoleContext.elevatablePerms]);

  const canManageTutorials = useMemo(() => {
    const roleSlug = effectiveRoleContext.roleSlug;
    const nativePrivileged = !!authClaims?.nativePrivileged;
    const allowedRole = roleSlug === 'prof' || roleSlug === 'admin' || nativePrivileged;
    return allowedRole && hasPermissionInRole('tutorials.manage');
  }, [effectiveRoleContext.roleSlug, hasPermissionInRole, authClaims?.nativePrivileged]);

  useEffect(() => {
    const hashRaw = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
    if (!hashRaw) return;
    const hashParams = new URLSearchParams(hashRaw);
    const oauthPayload = hashParams.get('oauth');
    const oauthError = hashParams.get('oauth_error');
    if (!oauthPayload && !oauthError) return;

    const cleanUrl = `${window.location.pathname}${window.location.search}`;
    window.history.replaceState({}, document.title, cleanUrl);

    if (oauthError) {
      setToast(OAUTH_ERROR_MESSAGES[oauthError] || 'Connexion Google refusée.');
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
            displayName: payload?.auth?.roleDisplayName || 'Utilisateur',
            avatar_path: null,
          },
        });
        setSessionUser(getStoredSession()?.user || null);
        setAuthClaims(getAuthClaims());
        setIsTeacher(true);
        setToast('Connexion Google réussie.');
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
            displayName: nextStudent?.pseudo || `${nextStudent?.first_name || ''} ${nextStudent?.last_name || ''}`.trim() || 'Utilisateur',
            email: nextStudent?.email || null,
            avatar_path: nextStudent?.avatar_path ?? nextStudent?.avatarPath ?? null,
          },
          student: nextStudent,
        });
        setStudent(nextStudent);
        setSessionUser(getStoredSession()?.user || null);
        setIsTeacher(false);
        setToast('Connexion Google réussie.');
        return;
      }
      setToast('Réponse Google invalide.');
    } catch (_) {
      setToast('Réponse Google illisible.');
    }
  }, []);

  useEffect(() => {
    safeLocalStorageSetItem('foretmap_active_map', activeMapId);
  }, [activeMapId]);

  useEffect(() => {
    safeLocalStorageSetItem(TAB_STORAGE_KEY, tab);
  }, [tab]);

  useEffect(() => {
    api('/api/version').then(d => setAppVersion(d.version)).catch(err => {
      console.error('[ForetMap] version app', err);
    });
  }, []);

  useEffect(() => {
    api('/api/settings/public')
      .then((d) => {
        if (!d?.settings) return;
        setPublicSettings((prev) => {
          const next = { ...prev, ...d.settings };
          const ui = d.settings.ui;
          if (ui && typeof ui === 'object') {
            if (ui.modules && typeof ui.modules === 'object') {
              next.modules = { ...prev.modules, ...ui.modules };
            }
            if (ui.help && typeof ui.help === 'object') {
              next.help = { ...prev.help, ...ui.help };
            }
            if (ui.map && typeof ui.map === 'object') {
              next.map = { ...prev.map, ...ui.map };
            }
            if (ui.auth && typeof ui.auth === 'object') {
              next.auth = { ...prev.auth, ...ui.auth };
            }
            if (ui.visit && typeof ui.visit === 'object') {
              next.visit = { ...prev.visit, ...ui.visit };
            }
          }
          if (d.settings.visit?.mascot?.dialog) {
            next.visit = {
              ...next.visit,
              mascot: {
                ...(next.visit?.mascot || {}),
                ...(d.settings.visit?.mascot || {}),
                dialog: d.settings.visit.mascot.dialog,
              },
            };
          }
          return next;
        });
      })
      .catch(() => {
        // Réglages publics non bloquants.
      })
      .finally(() => {
        setPublicSettingsReady(true);
      });
  }, []);

  useEffect(() => {
    if (!publicSettingsReady) return;
    const storedMapId = String(safeLocalStorageGetItem('foretmap_active_map', '') || '').trim();
    if (storedMapId) return;
    const defaultMap = showPublicVisit
      ? publicSettings?.map?.default_map_visit
      : (effectiveIsTeacher ? publicSettings?.map?.default_map_teacher : publicSettings?.map?.default_map_student);
    const nextMapId = String(defaultMap || '').trim();
    if (!nextMapId) return;
    setActiveMapId((prev) => (prev === nextMapId ? prev : nextMapId));
  }, [
    effectiveIsTeacher,
    publicSettings?.map?.default_map_student,
    publicSettings?.map?.default_map_teacher,
    publicSettings?.map?.default_map_visit,
    publicSettingsReady,
    showPublicVisit,
  ]);

  useEffect(() => {
    try {
      if (safeSessionStorageGetItem('foretmap_sw_updated', null) === '1') {
        safeSessionStorageRemoveItem('foretmap_sw_updated');
        setToast('Nouvelle version installée.');
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    const displayModeQuery = window.matchMedia ? window.matchMedia('(display-mode: standalone)') : null;
    const updateStandaloneState = () => {
      const displayStandalone = displayModeQuery ? displayModeQuery.matches : false;
      const iosStandalone = window.navigator.standalone === true;
      setIsStandaloneMode(displayStandalone || iosStandalone);
    };
    updateStandaloneState();
    if (!displayModeQuery) return undefined;
    if (typeof displayModeQuery.addEventListener === 'function') {
      displayModeQuery.addEventListener('change', updateStandaloneState);
      return () => displayModeQuery.removeEventListener('change', updateStandaloneState);
    }
    if (typeof displayModeQuery.addListener === 'function') {
      displayModeQuery.addListener(updateStandaloneState);
      return () => displayModeQuery.removeListener(updateStandaloneState);
    }
    return undefined;
  }, []);

  useEffect(() => {
    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredInstallPrompt(event);
    };
    const onAppInstalled = () => {
      setDeferredInstallPrompt(null);
      setShowIosInstallHint(false);
      setToast('Application installée sur cet appareil.');
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (!isIosDevice || isStandaloneMode) {
      setShowIosInstallHint(false);
      return;
    }
    const dismissed = safeLocalStorageGetItem(IOS_INSTALL_HINT_DISMISSED_KEY, null) === '1';
    setShowIosInstallHint(!dismissed);
  }, [isIosDevice, isStandaloneMode]);

  const handleInstallClick = useCallback(async () => {
    if (!deferredInstallPrompt) return;
    try {
      await deferredInstallPrompt.prompt();
      const result = await deferredInstallPrompt.userChoice;
      if (result?.outcome === 'accepted') {
        setToast('Installation en cours...');
      } else {
        setToast('Installation annulée.');
      }
    } catch (_) {
      setToast('Installation impossible sur ce navigateur.');
    } finally {
      setDeferredInstallPrompt(null);
    }
  }, [deferredInstallPrompt]);

  // Called from anywhere when a 401-deleted is detected
  const forceLogout = useCallback(() => {
    clearStoredSession();
    setStudent(null);
    setSessionUser(null);
    setIsTeacher(false);
    setAuthClaims(null);
    setSessionValidationError(false);
    setProfilePromotion(null);
    setToast('Votre compte a été supprimé par un responsable.');
  }, []);

  const updateStudentSession = useCallback((nextStudent) => {
    setSessionValidationError(false);
    if (!nextStudent || typeof nextStudent !== 'object') {
      studentRef.current = nextStudent;
      setStudent(nextStudent);
      return;
    }
    const prev = studentRef.current;
    const base = prev && typeof prev === 'object' ? prev : {};
    const avatarPath = nextStudent.avatar_path ?? nextStudent.avatarPath ?? base.avatar_path ?? null;
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
    const prevAuthToken = getAuthToken();
    let nextToken =
      (typeof merged.authToken === 'string' && merged.authToken.trim() !== '')
        ? merged.authToken.trim()
        : sessionToken;
    /* `merged.authToken` reste souvent le JWT élève d’origine : une fin tardive de
       `validateStudentSession` ne doit pas écraser une session déjà élevée (PIN). */
    if (prevAuthToken && isElevatedJwt(prevAuthToken) && !isElevatedJwt(nextToken)) {
      nextToken = prevAuthToken;
    }
    saveStoredSession({
      token: nextToken,
      user: {
        id: merged.auth?.canonicalUserId || merged.id || null,
        userType: 'student',
        displayName: merged.pseudo || `${merged.first_name || ''} ${merged.last_name || ''}`.trim() || 'Utilisateur',
        email: merged.email || null,
        avatar_path: avatarPath,
      },
      student: merged,
    });
    setSessionUser(getStoredSession()?.user || null);
  }, []);

  const handleAdminImpersonationApplied = useCallback((data) => {
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
      const displayName = [p.first_name, p.last_name].filter(Boolean).join(' ').trim()
        || p.display_name
        || p.email
        || auth?.roleDisplayName
        || 'Utilisateur';
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
    const nextClaims = getAuthClaims();
    setAuthClaims(nextClaims);
    setIsTeacher(Array.isArray(nextClaims?.permissions) && nextClaims.permissions.includes('teacher.access'));
    setSessionUser(getStoredSession()?.user || null);
    setRoleViewMode('native');
    setTab('map');
    setShowStats(false);
    setShowProfile(false);
    setToast('Prise de contrôle : vous voyez l’application comme l’utilisateur sélectionné.');
  }, [updateStudentSession]);

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
      setAuthClaims(getAuthClaims());
      setIsTeacher(true);
      setSessionUser(getStoredSession()?.user || null);
      setRoleViewMode('native');
      setTab('map');
      setToast('Vous êtes reconnecté avec votre compte administrateur.');
    } catch (e) {
      setToast(e.message || 'Impossible de quitter la prise de contrôle');
    }
  }, []);

  const mergeAuthMeResponse = useCallback((d, opts = {}) => {
    const { studentIdForMatch } = opts;
    if (!d || typeof d !== 'object' || !d.auth) return;
    const { auth } = d;
    if (typeof d.refreshedToken === 'string' && d.refreshedToken.trim() !== '') {
      const trimmed = d.refreshedToken.trim();
      const cur = getAuthToken();
      if (!(cur && isElevatedJwt(cur) && !isElevatedJwt(trimmed))) {
        safeLocalStorageSetItem('foretmap_auth_token', trimmed);
        const sess = getStoredSession() || {};
        saveStoredSession({ ...sess, token: trimmed });
      }
    }
    const claims = getAuthClaims();
    setAuthClaims(claims);
    setIsTeacher(Array.isArray(claims?.permissions) && claims.permissions.includes('teacher.access'));
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
    if (auth.userType === 'student' && (
      d.taskEnrollment != null
      || typeof d.forumParticipate === 'boolean'
      || typeof d.contextCommentParticipate === 'boolean'
    )) {
      setStudent((prev) => {
        if (!prev || String(prev.id) !== String(auth.userId)) return prev;
        return {
          ...prev,
          ...(d.taskEnrollment != null ? { taskEnrollment: d.taskEnrollment } : {}),
          ...(typeof d.forumParticipate === 'boolean' ? { forumParticipate: d.forumParticipate } : {}),
          ...(typeof d.contextCommentParticipate === 'boolean' ? { contextCommentParticipate: d.contextCommentParticipate } : {}),
        };
      });
    }
  }, []);

  const validateStudentSession = useCallback(async (savedStudent) => {
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
  }, [forceLogout, updateStudentSession]);

  // Restore session — validates against server on load
  useEffect(() => {
    const saved = safeLocalStorageGetItem('foretmap_student', null);
    if (saved) {
      try {
        const s = JSON.parse(saved);
        setStudent(s); // show app immediately with cached data
        validateStudentSession(s);
      } catch (e) { console.error('[ForetMap] lecture session locale', e); }
    }
    const session = getStoredSession();
    if (session?.user && !session?.student) {
      setSessionUser(session.user);
    }
  }, [validateStudentSession]);

  useEffect(() => {
    const onExpired = () => { setIsTeacher(false); setAuthClaims(null); setSessionUser(null); setToast('Session n3boss expirée.'); };
    window.addEventListener('foretmap_teacher_expired', onExpired);
    return () => window.removeEventListener('foretmap_teacher_expired', onExpired);
  }, []);

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
        setIsTeacher(Array.isArray(claims?.permissions) && claims.permissions.includes('teacher.access'));
        setSessionUser(sess?.user || null);
      }, 0);
    };
    window.addEventListener('foretmap_session_changed', syncAuthFromStoredSession);
    return () => {
      window.removeEventListener('foretmap_session_changed', syncAuthFromStoredSession);
      window.clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    setRoleViewMode('native');
  }, [authClaims?.roleSlug, authClaims?.userId, isTeacher]);

  useEffect(() => {
    const onResize = () => {
      if (viewportResizeRafRef.current != null) return;
      viewportResizeRafRef.current = window.requestAnimationFrame(() => {
        viewportResizeRafRef.current = null;
        setViewportWidth(window.innerWidth || 0);
      });
    };
    window.addEventListener('resize', onResize, { passive: true });
    return () => {
      window.removeEventListener('resize', onResize);
      if (viewportResizeRafRef.current != null) {
        window.cancelAnimationFrame(viewportResizeRafRef.current);
        viewportResizeRafRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => setIsTabVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  useEffect(() => {
    const session = getStoredSession();
    if (!session?.token) return;
    api('/api/auth/me')
      .then((d) => {
        mergeAuthMeResponse(d);
      })
      .catch(() => {
        // Session absente/invalide: on laisse les états locaux existants.
      });
  }, [mergeAuthMeResponse]);

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

            const restrictedMapIds = (!isTeacherSnap && !visitSnap)
              ? allowedMapIdsFromAffiliation(studentAffiliation)
              : null;

            const mapsRes = await safeApi(() => api('/api/maps'), DEFAULT_MAPS);
            const safeMaps = Array.isArray(mapsRes) && mapsRes.length > 0 ? mapsRes : DEFAULT_MAPS;
            setMaps(safeMaps);

            const visibleAllowedMaps = mapsForAffiliationScope(safeMaps, restrictedMapIds);
            const requestedMapId = (restrictedMapIds && !restrictedMapIds.includes(mapIdState))
              ? restrictedMapIds[0]
              : mapIdState;
            const defaultMap = visitSnap
              ? defaultMapVisit
              : (isTeacherSnap ? defaultMapTeacher : defaultMapStudent);
            const fallbackMap = visibleAllowedMaps.find((mp) => mp.id === defaultMap)?.id
              || visibleAllowedMaps[0]?.id
              || requestedMapId
              || '';
            const resolvedMapId = visibleAllowedMaps.some((mp) => mp.id === requestedMapId)
              ? requestedMapId
              : fallbackMap;
            const mapQuery = resolvedMapId ? `map_id=${encodeURIComponent(resolvedMapId)}` : '';

            const tutorialsEndpoint = canTutorialsSnap
              ? '/api/tutorials?include_inactive=1'
              : '/api/tutorials';
            const [z, t, taskProjectsRes, p, m, tu] = await Promise.all([
              safeApi(() => (mapQuery ? api(`/api/zones?${mapQuery}`) : Promise.resolve([])), []),
              safeApi(() => (mapQuery ? api(`/api/tasks?${mapQuery}`) : Promise.resolve([])), []),
              safeApi(() => (mapQuery ? api(`/api/task-projects?${mapQuery}`) : Promise.resolve([])), []),
              safeApi(() => api('/api/plants'), []),
              safeApi(() => (mapQuery ? api(`/api/map/markers?${mapQuery}`) : Promise.resolve([])), []),
              safeApi(() => api(tutorialsEndpoint), []),
            ]);

            if (resolvedMapId !== mapIdState) {
              setActiveMapId(resolvedMapId);
            }
            setZones(z);
            if (Array.isArray(t)) setTasks(t);
            else console.warn('[ForetMap] GET /api/tasks : réponse non tableau, état tâches inchangé');
            setTaskProjects(Array.isArray(taskProjectsRes) ? taskProjectsRes : []);
            setPlants(p); setMarkers(m); setTutorials(tu);
            if (!isTeacherSnap) {
              const sess = studentRef.current;
              if (sess?.id && !sess.preview_mode) {
                const sid = sess.id;
                api('/api/auth/me')
                  .then((d) => {
                    if (studentRef.current?.id !== sid) return;
                    const hasSideEffects = d?.taskEnrollment != null
                      || typeof d?.forumParticipate === 'boolean'
                      || typeof d?.contextCommentParticipate === 'boolean'
                      || typeof d?.refreshedToken === 'string'
                      || d?.autoProfilePromotion;
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
  }, [DEFAULT_MAPS, forceLogout, mergeAuthMeResponse]);

  useEffect(() => {
    if (pinSuccessFetchAllTick === 0) return;
    void fetchAll();
  }, [pinSuccessFetchAllTick, fetchAll]);

  const tasksForActiveMap = useMemo(() => (
    tasks.filter((t) => {
      const effectiveMapId = t.map_id_resolved || t.map_id || t.zone_map_id || t.marker_map_id || null;
      return effectiveMapId === activeMapId || effectiveMapId == null;
    })
  ), [tasks, activeMapId]);
  const teacherPendingValidationCount = useMemo(
    () => tasksForActiveMap.filter((t) => t.status === 'done').length,
    [tasksForActiveMap]
  );
  const visibleMaps = useMemo(() => {
    const allowedMapIds = (effectiveIsTeacher || showPublicVisit)
      ? null
      : allowedMapIdsFromAffiliation(student?.affiliation);
    return mapsForAffiliationScope(maps, allowedMapIds);
  }, [maps, effectiveIsTeacher, showPublicVisit, student?.affiliation]);
  useEffect(() => {
    if (!Array.isArray(visibleMaps) || visibleMaps.length === 0) {
      if (activeMapId) setActiveMapId('');
      return;
    }
    if (activeMapId && visibleMaps.some((map) => map.id === activeMapId)) return;
    const preferredDefaultMapId = showPublicVisit
      ? publicSettings?.map?.default_map_visit
      : (effectiveIsTeacher ? publicSettings?.map?.default_map_teacher : publicSettings?.map?.default_map_student);
    const nextMapId = pickVisibleMapId(visibleMaps, preferredDefaultMapId);
    setActiveMapId((prev) => (prev === nextMapId ? prev : nextMapId));
  }, [
    activeMapId,
    effectiveIsTeacher,
    publicSettings?.map?.default_map_student,
    publicSettings?.map?.default_map_teacher,
    publicSettings?.map?.default_map_visit,
    showPublicVisit,
    visibleMaps,
  ]);
  const mascotStudioMapLabel = useMemo(() => {
    const m = visibleMaps.find((x) => x.id === activeMapId);
    return String(m?.label || m?.id || activeMapId || '').trim() || activeMapId;
  }, [visibleMaps, activeMapId]);
  const openMascotPackStudioTab = useCallback(() => {
    setTab('mascot_packs');
  }, []);
  const previewStudent = useMemo(() => {
    if (!isTeacher || roleViewMode !== 'student') return null;
    const fallbackName = String(sessionUser?.displayName || authClaims?.roleDisplayName || 'Utilisateur').trim();
    return {
      id: `preview-${authClaims?.userId || 'teacher'}`,
      first_name: fallbackName,
      last_name: '',
      pseudo: null,
      affiliation: 'both',
      preview_mode: true,
    };
  }, [authClaims?.roleDisplayName, authClaims?.userId, isTeacher, roleViewMode, sessionUser?.displayName]);
  const studentForUi = student || previewStudent;
  const studentActiveAssignedTasksCount = useMemo(() => {
    if (!studentForUi) return 0;
    return tasksForActiveMap.filter((t) => (
      t.assignments?.some((a) => a.student_first_name === studentForUi.first_name && a.student_last_name === studentForUi.last_name)
      && (t.status === 'available' || t.status === 'in_progress')
    )).length;
  }, [studentForUi, tasksForActiveMap]);
  const studentAffiliation = (studentForUi?.affiliation || 'both').toLowerCase();
  const isN3Affiliated = isN3OnlyAffiliation(studentAffiliation);
  const roleTerms = getRoleTerms(isN3Affiliated);
  const appLoaderText = getContentText(publicSettings, 'app.loader', 'Chargement de la forêt...');
  const appServerDownNotice = getContentText(publicSettings, 'app.server_down_notice', 'Serveur indisponible. Nouvel essai automatique toutes les 2 minutes.');
  const appRetryNow = getContentText(publicSettings, 'app.retry_now', 'Réessayer maintenant');
  const appFooterVersionPrefix = getContentText(publicSettings, 'app.footer_version_prefix', 'Version');
  const canAccessStudentMapTasks = true;
  /** Met à jour le filtre lieu du volet Tâches (sans changer d’onglet). */
  const handleMapLocationTasksFocus = useCallback((focus) => {
    setTasksLocationFocus(focus);
  }, []);
  const isVisitor = effectiveRoleContext.roleSlug === 'visiteur';
  const canAccessForum = !isVisitor && publicSettings?.modules?.forum_enabled !== false;
  const canParticipateForum = useMemo(() => {
    if (effectiveIsTeacher) return true;
    const s = studentForUi;
    if (!s) return true;
    if (typeof s.forumParticipate === 'boolean') return s.forumParticipate;
    if (s.forum_participate != null) return Number(s.forum_participate) !== 0;
    return true;
  }, [effectiveIsTeacher, studentForUi]);
  const canManageMediaLibrary = !!authClaims?.elevated || !!authClaims?.nativePrivileged;

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
    const fallbackName = String(sessionUser?.displayName || authClaims?.roleDisplayName || 'Utilisateur').trim();
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
  }, [authClaims?.roleDisplayName, authClaims?.roleSlug, authClaims?.userType, canOpenUserDialogs, effectiveIsTeacher, profileTargetUserId, sessionUser?.avatar_path, sessionUser?.displayName, sessionUser?.email, student]);
  const canOpenTeacherStatsFromBadge = effectiveIsTeacher
    && publicSettings?.modules?.stats_enabled !== false
    && hasPermission('stats.read.all');
  const canViewGeneralStats = publicSettings?.modules?.stats_enabled !== false
    && hasPermission('stats.read.all');
  const canSwitchToStudentView = isTeacher && (effectiveRoleContext.roleSlug === 'prof' || effectiveRoleContext.roleSlug === 'admin');
  const canSwitchToTeacherView = isTeacher && effectiveRoleContext.roleSlug === 'admin';
  const onTaskFormOverlayOpenChange = useCallback((open) => {
    pauseDataRefreshForTaskOverlaysRef.current = !!open;
  }, []);

  useOverlayHistoryBack(showStats && canOpenUserDialogs, () => setShowStats(false));
  useOverlayHistoryBack(showProfile && canOpenUserDialogs && !!profileTargetUser, () => setShowProfile(false));

  const shouldUseDesktopSplit = useMemo(() => {
    if (viewportWidth < DESKTOP_SPLIT_MIN_WIDTH) return false;
    const pagePadding = 32;
    const columnGap = 16;
    const usableWidth = Math.max(0, viewportWidth - pagePadding);
    const availableForColumns = Math.max(0, usableWidth - columnGap);
    const mapWidth = availableForColumns * (1.25 / 2.25);
    const tasksWidth = availableForColumns * (1 / 2.25);
    return mapWidth >= DESKTOP_SPLIT_MIN_MAP_PX && tasksWidth >= DESKTOP_SPLIT_MIN_TASKS_PX;
  }, [viewportWidth]);
  const isCombinedMapTasksTab = tab === 'maptasks';
  const useSplitMapTasks = shouldUseDesktopSplit && isCombinedMapTasksTab && canAccessStudentMapTasks;
  /** Ouvre l’onglet Tâches avec le filtre lieu (carte seule ; en split le filtre est déjà synchronisé au clic). */
  const navigateToTasksForLocation = useCallback((focus) => {
    if (!focus?.kind || focus.id == null || focus.id === '') return;
    setTasksLocationFocus(focus);
    if (!(effectiveIsTeacher || canAccessStudentMapTasks)) return;
    if (useSplitMapTasks) return;
    setTab('tasks');
  }, [effectiveIsTeacher, canAccessStudentMapTasks, useSplitMapTasks]);

  const [plantCatalogPreview, setPlantCatalogPreview] = useState(null);
  const openPlantCatalogPreviewById = useCallback((plantId) => {
    const id = Number(plantId);
    if (!Number.isFinite(id) || id <= 0) return;
    const p = (plants || []).find((x) => Number(x.id) === id);
    if (p) setPlantCatalogPreview(p);
  }, [plants]);

  const useWideMain = shouldUseDesktopSplit;
  const mapChromeCompactVisible = !loading && (useSplitMapTasks || (!useSplitMapTasks && tab === 'map'));
  const tutorialsModuleEnabled = publicSettings?.modules?.tutorials_enabled !== false;
  const mergeTasksTutoNav = tutorialsModuleEnabled && !!(tasksLocationFocus?.kind && tasksLocationFocus?.id != null && String(tasksLocationFocus.id).trim() !== '');
  const tasksTabLabel = mergeTasksTutoNav ? '✅ Tâches&tuto' : (tutorialsModuleEnabled ? '✅ Tâches et tuto' : '✅ Tâches');
  const mapTasksSplitLabel = tutorialsModuleEnabled ? '🗺️ Cartes, tâches et tuto' : '🗺️ Cartes & tâches';

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
  });
  const teacherSyncStatus = effectiveIsTeacher ? (rtStatus === 'off' ? 'polling' : rtStatus) : rtStatus;
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
    return () => {
      if (!initialFetchDoneRef.current) return;
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

  useEffect(() => {
    if (effectiveIsTeacher) return;
    if (!canAccessStudentMapTasks && (tab === 'map' || tab === 'tasks' || tab === 'maptasks')) {
      setTab('plants');
    }
  }, [effectiveIsTeacher, canAccessStudentMapTasks, tab]);

  useEffect(() => {
    if (tab === 'maptasks' && !shouldUseDesktopSplit) {
      setTab('map');
    }
  }, [shouldUseDesktopSplit, tab]);

  useEffect(() => {
    if (tab === 'tuto' && publicSettings?.modules?.tutorials_enabled === false) setTab('map');
    if (tab === 'stats' && publicSettings?.modules?.stats_enabled === false) setTab('map');
    if (tab === 'stats' && publicSettings?.modules?.stats_enabled !== false && !canViewGeneralStats) setTab('map');
    if (tab === 'visit' && publicSettings?.modules?.visit_enabled === false) setTab('map');
    if (tab === 'mascot_packs' && publicSettings?.modules?.visit_enabled === false) setTab('map');
    if (tab === 'notebook' && publicSettings?.modules?.observations_enabled === false) setTab('map');
    if (tab === 'forum' && !canAccessForum) setTab('about');
    if (tab === 'media_library' && !effectiveIsTeacher) setTab('about');
  }, [tab, publicSettings?.modules?.tutorials_enabled, publicSettings?.modules?.stats_enabled, publicSettings?.modules?.visit_enabled, publicSettings?.modules?.observations_enabled, publicSettings?.modules?.forum_enabled, canAccessForum, canViewGeneralStats, effectiveIsTeacher]);

  /** Avec une zone/repère au focus, l’onglet Tuto est fusionné avec Tâches (navigation vers la vue Tâches). */
  useEffect(() => {
    if (!mergeTasksTutoNav || tab !== 'tuto') return;
    setTab('tasks');
  }, [mergeTasksTutoNav, tab]);

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

  const updateZone = async (id, data) => {
    await api(`/api/zones/${id}`, 'PUT', data);
    await fetchAll();
  };
  const updateTeacherSession = useCallback((updatedUser) => {
    setSessionUser((prev) => {
      const nextDisplayName = updatedUser?.pseudo
        || updatedUser?.display_name
        || `${updatedUser?.first_name || ''} ${updatedUser?.last_name || ''}`.trim()
        || prev?.displayName
        || 'Utilisateur';
      const next = {
        id: updatedUser?.id || prev?.id || authClaims?.userId || null,
        userType: 'teacher',
        displayName: nextDisplayName,
        email: updatedUser?.email ?? prev?.email ?? null,
        avatar_path: updatedUser?.avatar_path ?? updatedUser?.avatarPath ?? prev?.avatar_path ?? null,
        visit_mascot_catalog_id: updatedUser?.visit_mascot_catalog_id ?? prev?.visit_mascot_catalog_id ?? null,
      };
      saveStoredSession({ user: next });
      return next;
    });
  }, [authClaims?.userId]);
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

  useEffect(() => {
    if (!toast) return;
    addNotification({
      key: `toast:${toast}`,
      level: NOTIFICATION_LEVEL.INFO,
      category: NOTIFICATION_CATEGORY.OPERATIONS,
      title: 'Information',
      message: String(toast),
    });
  }, [addNotification, toast]);

  const openNotificationAction = useCallback((item) => {
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
  }, [effectiveIsTeacher, markAsRead, studentForUi, trackActionClick, validateStudentSession]);

  // O5 — valeurs de session globales exposées par contexte (cf. SessionContext).
  // NB : hasPermission/hasPermissionInRole restent en props (volontairement) — le chemin élève
  // les omet pour forcer `() => false` ; un prof en « vue élève » garde ses droits réels, donc les
  // exposer globalement ferait réapparaître des contrôles prof côté vue élève. Idem identités.
  const sessionContextValue = useMemo(() => ({
    isN3Affiliated,
    canParticipateContextComments,
  }), [isN3Affiliated, canParticipateContextComments]);

  // O5 — données partagées exposées par contexte (cf. DataContext). `maps` exclu (variante
  // visibleMaps/maps) et VisitView exclu (noms de props distincts) : ces deux-là restent en props.
  const dataContextValue = useMemo(() => ({
    zones,
    markers,
    plants,
    tasks,
    tutorials,
    taskProjects,
    activeMapId,
  }), [zones, markers, plants, tasks, tutorials, taskProjects, activeMapId]);

  if (!student && !isTeacher) return (
    <PublicSettingsProvider value={publicSettings}>
    <>
      {toast && <Toast msg={toast} onDone={() => setToast(null)}/>}
      {showPublicVisit ? (
        <div id="app">
          <div className="main main--guest-visit">
            <VisitView
              student={null}
              isTeacher={false}
              initialMapId={publicSettings?.map?.default_map_visit || activeMapId}
              onBackToAuth={() => {
                abandonAllOverlays();
                setGuestVisitNeedsMascotChoice(false);
                setShowPublicVisit(false);
              }}
              availableTutorials={[]}
              requireGuestMascotChoice={guestVisitNeedsMascotChoice}
              onGuestMascotChoiceDone={() => {
                safeLocalStorageSetItem(GUEST_VISIT_MASCOT_CONFIRMED_KEY, '1');
                setGuestVisitNeedsMascotChoice(false);
              }}
            />
          </div>
          <footer className="app-footer">{appFooterVersionPrefix} {appVersion != null ? appVersion : '…'}</footer>
        </div>
      ) : (
        <AuthScreen
          onLogin={s => {
            const userType = String(s?.auth?.userType || s?.user_type || 'student').toLowerCase();
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
            setIsTeacher(Array.isArray(claims?.permissions) && claims.permissions.includes('teacher.access'));
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
  const currentUser = (effectiveIsTeacher ? sessionUser : studentForUi) || sessionUser || {
    pseudo: null,
    displayName: authClaims?.roleDisplayName || null,
    first_name: authClaims?.roleDisplayName || 'Utilisateur',
    last_name: '',
  };
  const currentUserLabel = currentUser?.pseudo
    || currentUser?.displayName
    || `${currentUser?.first_name || ''} ${currentUser?.last_name || ''}`.trim()
    || 'Utilisateur';

  return (
    <PublicSettingsProvider value={publicSettings}>
    <SessionProvider value={sessionContextValue}>
    <DataProvider value={dataContextValue}>
    <div id="app">
      {plantCatalogPreview && (
        <Suspense fallback={null}>
          <PlantCatalogPreviewModalLazy
            plant={plantCatalogPreview}
            maps={visibleMaps}
            onClose={() => setPlantCatalogPreview(null)}
            onForceLogout={forceLogout}
          />
        </Suspense>
      )}
      {showIosInstallHint && !deferredInstallPrompt && !isStandaloneMode && (
        <div className="fade-in install-ios-banner" role="status" aria-live="polite">
          <span>Pour installer ForetMap sur iPhone ou iPad : ouvre Safari, touche Partager, puis « Sur l’écran d’accueil ».</span>
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
        <div className="fade-in" role="alert" style={{
          margin:'8px 12px 0', padding:'10px 14px', borderRadius:12,
          background:'#fef3c7', border:'1px solid #f59e0b', color:'#78350f', fontSize:'.9rem'
        }}>
          {appServerDownNotice}
          <button type="button" className="btn btn-sm" style={{marginLeft:10, verticalAlign:'middle'}}
            onClick={() => { failCountRef.current = 0; setRefreshMs(DATA_REFRESH_INTERVAL_MS); setServerDown(false); fetchAll(); }}>
            {appRetryNow}
          </button>
        </div>
      )}
      {!serverDown && latestCriticalNotification && (
        <div className="fade-in notif-critical-banner" role="alert">
          <strong>{latestCriticalNotification.title}</strong> {latestCriticalNotification.message}
        </div>
      )}
      {sessionValidationError && studentForUi && !effectiveIsTeacher && (
        <div className="fade-in" role="alert" style={{
          margin:'8px 12px 0', padding:'10px 14px', borderRadius:12,
          background:'#eff6ff', border:'1px solid #93c5fd', color:'#1e3a8a', fontSize:'.9rem'
        }}>
          <strong>Session pas encore recollée au serveur.</strong> Les infos peuvent être un peu vieilles — un clic pour rafraîchir.
          <button
            type="button"
            className="btn btn-sm"
            style={{ marginLeft: 10, verticalAlign: 'middle' }}
            onClick={() => {
              setSessionValidationError(false);
              validateStudentSession(studentForUi);
            }}
          >
            Réessayer
          </button>
        </div>
      )}
      {toast && <Toast msg={toast} onDone={() => setToast(null)}/>}
      {profilePromotion && !effectiveIsTeacher && studentForUi && !studentForUi.preview_mode && (
        <AutoProfilePromotionModal
          data={profilePromotion}
          roleTerms={roleTerms}
          onClose={() => setProfilePromotion(null)}
        />
      )}
      {showPin && <PinModal
        onSuccess={() => {
          const claims = getAuthClaims();
          setPinSuccessFetchAllTick((n) => n + 1);
          setAuthClaims(claims);
          setIsTeacher(Array.isArray(claims?.permissions) && claims.permissions.includes('teacher.access'));
          setShowPin(false);
          setToast(claims?.elevated ? 'Droits étendus activés — c’est bon 🔓' : 'Session mise à jour, tout roule');
        }}
        onClose={() => setShowPin(false)}
        uiSettings={publicSettings}
        isN3Affiliated={isN3Affiliated}
      />}
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

      <header className="app-header">
        <div className="logo">
          <img
            className="app-header-logo"
            src={withAppBase('/app-logo-n3.png')}
            alt=""
            width={28}
            height={28}
            decoding="async"
          />
          <span className="logo-title">ForêtMap</span>
        </div>
        <div className="header-right">
          {!isStandaloneMode && deferredInstallPrompt && (
            <button
              type="button"
              className="lock-btn install-btn"
              aria-label="Installer l'application"
              title="Installer l'application"
              onClick={handleInstallClick}
            >
              ⬇️ <span className="lock-label">Installer</span>
            </button>
          )}
          {isTeacher && (
            <span
              className="app-version-badge"
              title={`Version installée: ${appVersion != null ? appVersion : 'chargement...'}`}
              aria-label={`Version ${appVersion != null ? appVersion : 'en chargement'}`}
            >
              <span className="app-version-badge__version">v{appVersion != null ? appVersion : '…'}</span>
              <span className="app-version-badge__status">à jour</span>
            </span>
          )}
          {effectiveIsTeacher && (
            <span
              className="realtime-prof-wrap"
              title={RT_PROF_TOOLTIPS[teacherSyncStatus] || ''}
              aria-label={RT_PROF_TOOLTIPS[teacherSyncStatus] || 'État du temps réel'}
              role="status"
            >
              <span className={`realtime-dot realtime-dot--${teacherSyncStatus}`} aria-hidden />
            </span>
          )}
          <NotificationCenter
            roleKey={notificationRoleKey}
            unreadCount={notificationsUnreadCount}
            items={notifications}
            prefs={notificationPrefs}
            metrics={notificationMetrics}
            onTogglePref={updatePreference}
            onOpenAction={openNotificationAction}
            onMarkAsRead={markAsRead}
            onMarkAllRead={markAllRead}
            onRemove={removeNotification}
            onClearRead={clearRead}
            onOpenPanel={trackOpenedPanel}
            onResetMetrics={resetMetrics}
            helpText={helpText(HELP_TOOLTIPS.header.notifications)}
          />
          <Tooltip text={helpText(HELP_TOOLTIPS.header.userBadge)}>
            <button
              type="button"
              className="user-badge"
              onClick={() => {
                if (canOpenUserDialogs) {
                  setShowStats(true);
                  return;
                }
                if (canOpenTeacherStatsFromBadge) {
                  setTab('stats');
                }
              }}
              style={{ cursor: (canOpenUserDialogs || canOpenTeacherStatsFromBadge) ? 'pointer' : 'default' }}
              aria-label={
                canOpenUserDialogs
                  ? 'Voir mes statistiques'
                  : (canOpenTeacherStatsFromBadge ? `Ouvrir les statistiques ${roleTerms.studentPlural}` : 'Badge utilisateur')
              }
            >
              <StudentAvatar student={currentUser} size={20} style={{ border: 'none' }} />
              <span className="user-badge-text">{currentUserLabel}</span>
            </button>
          </Tooltip>
          {canOpenUserDialogs && (
            <Tooltip text={helpText(HELP_TOOLTIPS.header.profileEdit)}>
              <button
                className="lock-btn"
                aria-label="Modifier mon profil"
                onClick={() => setShowProfile(true)}
              >
                ✏️
              </button>
            </Tooltip>
          )}
          {isTeacher && (
            <>
              {roleViewMode !== 'native' && (
                <Tooltip text={helpText(HELP_TOOLTIPS.header.roleReset)}>
                  <button
                    className="lock-btn"
                    aria-label="Revenir au rôle normal"
                    onClick={() => {
                      setRoleViewMode('native');
                      setTab('map');
                      setShowStats(false);
                      setShowProfile(false);
                    }}
                  >
                    ↩️
                  </button>
                </Tooltip>
              )}
              {roleViewMode !== 'student' && canSwitchToStudentView && (
                <Tooltip text={helpText(HELP_TOOLTIPS.header.roleStudent)}>
                  <button
                    className="lock-btn"
                    aria-label={`Passer en vue ${roleTerms.studentSingular}`}
                    onClick={() => {
                      setRoleViewMode('student');
                      setTab('map');
                      setShowStats(false);
                      setShowProfile(false);
                    }}
                  >
                    🎓
                  </button>
                </Tooltip>
              )}
              {roleViewMode !== 'teacher' && canSwitchToTeacherView && (
                <Tooltip text={helpText(HELP_TOOLTIPS.header.roleTeacher)}>
                  <button
                    className="lock-btn"
                    aria-label={`Passer en vue ${roleTerms.teacherShort}`}
                    onClick={() => {
                      setRoleViewMode('teacher');
                      setTab('map');
                      setShowStats(false);
                      setShowProfile(false);
                    }}
                  >
                    🧑‍🏫
                  </button>
                </Tooltip>
              )}
            </>
          )}
          <Tooltip text={helpText(HELP_TOOLTIPS.header.elevatedMode)}>
            <button
              className={`lock-btn ${authClaims?.elevated ? 'active' : ''}`}
              aria-label={authClaims?.elevated ? 'Désactiver les droits étendus' : 'Activer les droits étendus'}
              onClick={() => {
              if (authClaims?.elevated) {
                safeLocalStorageRemoveItem('foretmap_teacher_token');
                let storedStudent = null;
                try {
                  const raw = safeLocalStorageGetItem('foretmap_student', null);
                  if (raw) storedStudent = JSON.parse(raw);
                } catch (_) {
                  storedStudent = null;
                }
                const fromElevation = storedStudent && typeof storedStudent.elevationStudentToken === 'string'
                  ? storedStudent.elevationStudentToken.trim()
                  : '';
                const fromAuth = storedStudent && typeof storedStudent.authToken === 'string'
                  ? storedStudent.authToken.trim()
                  : '';
                const baseStudentToken = fromElevation || fromAuth || null;
                if (baseStudentToken) {
                  const cleanedStudent = { ...storedStudent, authToken: baseStudentToken };
                  delete cleanedStudent.elevationStudentToken;
                  safeLocalStorageSetItem('foretmap_auth_token', baseStudentToken);
                  saveStoredSession({
                    token: baseStudentToken,
                    user: {
                      id: cleanedStudent.auth?.canonicalUserId || cleanedStudent.id || null,
                      userType: 'student',
                      displayName: cleanedStudent.pseudo || `${cleanedStudent.first_name || ''} ${cleanedStudent.last_name || ''}`.trim() || 'Utilisateur',
                      email: cleanedStudent.email || null,
                      avatar_path: cleanedStudent.avatar_path ?? cleanedStudent.avatarPath ?? null,
                    },
                    student: cleanedStudent,
                  });
                  saveLegacyStudentSnapshot(cleanedStudent);
                  updateStudentSession(cleanedStudent);
                } else {
                  const authToken = safeLocalStorageGetItem('foretmap_auth_token', null);
                  if (authToken) saveStoredSession({ token: authToken });
                }
                const claims = getAuthClaims();
                setAuthClaims(claims);
                setIsTeacher(Array.isArray(claims?.permissions) && claims.permissions.includes('teacher.access'));
                setToast('Droits étendus coupés — mode léger');
              } else {
                setShowPin(true);
              }
            }}
            >
              {authClaims?.elevated ? <>🔓 <span className="lock-label">Élevé</span></> : '🔒'}
            </button>
          </Tooltip>
          <Tooltip text={helpText(HELP_TOOLTIPS.header.logout)}>
            <button className="lock-btn" aria-label="Déconnexion" onClick={() => {
              clearStoredSession();
              studentRef.current = null;
              setStudent(null); setSessionUser(null); setIsTeacher(false); setAuthClaims(null);
            }}>↩️</button>
          </Tooltip>
        </div>
      </header>

      {authClaims?.impersonating && (
        <div className="role-preview-banner role-preview-banner--impersonation fade-in" role="status">
          <span className="role-preview-banner__icon" aria-hidden>👤</span>
          <div className="role-preview-banner__text" style={{ flex: '1 1 200px' }}>
            <strong>Prise de contrôle (admin)</strong>
            <span>
              Tu navigues avec l’identité de{' '}
              <strong>{String(authClaims?.roleDisplayName || 'utilisateur').trim()}</strong>
              {authClaims?.userType === 'student' ? ' (n3beur)' : authClaims?.userType === 'teacher' ? ' (n3boss)' : ''}.
              Les actions sont enregistrées pour ce compte.
            </span>
          </div>
          <div className="impersonation-banner-actions">
            <Tooltip text={helpText(HELP_TOOLTIPS.header.impersonationStop)}>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => { stopAdminImpersonation(); }}>
                Revenir à mon compte admin
              </button>
            </Tooltip>
          </div>
        </div>
      )}

      {isTeacher && roleViewMode === 'student' && (
        <div className="role-preview-banner fade-in" role="status">
          <span className="role-preview-banner__icon" aria-hidden>🎓</span>
          <div className="role-preview-banner__text">
            <strong>Vue n3beur (aperçu)</strong>
            <span>Navigation en bas, écrans comme un n3beur (sans les onglets n3boss du haut). Tes vrais droits n3boss restent actifs côté serveur.</span>
          </div>
        </div>
      )}
      {isTeacher && roleViewMode === 'teacher' && (
        <div className="role-preview-banner role-preview-banner--teacher fade-in" role="status">
          <span className="role-preview-banner__icon" aria-hidden>🧑‍🏫</span>
          <div className="role-preview-banner__text">
            <strong>Vue n3boss (aperçu)</strong>
            <span>Interface un peu épurée (moins de boutons admin visibles). Tes permissions réelles s’appliquent toujours quand tu agis.</span>
          </div>
        </div>
      )}

      {effectiveIsTeacher ? (
        <div className={`main teacher-main app-main-shell app-main-shell--teacher ${useWideMain ? 'main--wide' : ''} ${mapChromeCompactVisible ? 'teacher-main--map-visible' : ''} ${useSplitMapTasks ? 'main--maptasks-split' : ''}`}>
          <div className="top-tabs app-tabs-surface">
            {shouldUseDesktopSplit && (
              <button className={`top-tab ${tab === 'maptasks' ? 'active' : ''}`} onClick={() => setTab('maptasks')}>
                {mapTasksSplitLabel}{teacherPendingValidationCount > 0 ? ` (${teacherPendingValidationCount} à valider)` : ''}
              </button>
            )}
            <button className={`top-tab ${tab === 'map' ? 'active' : ''}`} onClick={() => setTab('map')}>🗺️ Carte & Zones</button>
            <button className={`top-tab ${tab === 'tasks' || (mergeTasksTutoNav && tab === 'tuto') ? 'active' : ''}`} onClick={() => setTab('tasks')}>
              {tasksTabLabel}{teacherPendingValidationCount > 0 ? ` (${teacherPendingValidationCount} à valider)` : ''}
            </button>
            <button className={`top-tab ${tab === 'plants' ? 'active' : ''}`} onClick={() => setTab('plants')}>🌱 Biodiversité</button>
            {publicSettings?.modules?.tutorials_enabled !== false && !mergeTasksTutoNav && (
              <button className={`top-tab ${tab === 'tuto' ? 'active' : ''}`} onClick={() => setTab('tuto')}>📘 Tuto</button>
            )}
            {canAccessForum && <button className={`top-tab ${tab === 'forum' ? 'active' : ''}`} onClick={() => setTab('forum')}>💬 Forum</button>}
            {publicSettings?.modules?.stats_enabled !== false && (
              <button className={`top-tab ${tab === 'stats' ? 'active' : ''}`} onClick={() => setTab('stats')}>📊 Stats</button>
            )}
            {publicSettings?.modules?.visit_enabled !== false && (
              <button className={`top-tab ${tab === 'visit' ? 'active' : ''}`} onClick={() => setTab('visit')}>🧭 Visite</button>
            )}
            {publicSettings?.modules?.visit_enabled !== false && (
              <button className={`top-tab ${tab === 'mascot_packs' ? 'active' : ''}`} onClick={() => setTab('mascot_packs')}>🎨 Packs mascotte</button>
            )}
            <button className={`top-tab ${tab === 'media_library' ? 'active' : ''}`} onClick={() => setTab('media_library')}>
              🗂️ Médiathèque
            </button>
            {(
              hasPermissionInRole('admin.roles.manage')
              || hasPermissionInRole('admin.users.assign_roles')
              || hasPermissionInRole('stats.export')
              || hasPermissionInRole('students.import')
              || hasPermissionInRole('students.delete')
              || hasPermissionInRole('users.create')
            ) && (
              <button className={`top-tab ${tab === 'profiles' ? 'active' : ''}`} onClick={() => setTab('profiles')}>
                🛡️ {isN3Affiliated ? 'n3boss & utilisateurs' : 'Profils & utilisateurs'}
              </button>
            )}
            {hasPermissionInRole('admin.settings.read') && (
              <button className={`top-tab ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>
                ⚙️ Paramètres
              </button>
            )}
            {hasPermission('audit.read') && (
              <button className={`top-tab ${tab === 'audit' ? 'active' : ''}`} onClick={() => setTab('audit')}>📜 Audit</button>
            )}
            <button className={`top-tab ${tab === 'about' ? 'active' : ''}`} onClick={() => setTab('about')}>ℹ️ À propos</button>
          </div>
          {loading ? (
            <div className="loader" style={{ height: '60vh' }}>
              <div className="loader-leaf">🌿</div>
              <p>{appLoaderText}</p>
            </div>
          ) : (
            <>
              {useSplitMapTasks && (
                <div className="desktop-split-view" role="region" aria-label={tutorialsModuleEnabled ? 'Vue carte, tâches et tutoriels' : 'Vue carte et tâches'}>
                  <section className="desktop-split-pane desktop-split-pane--map">
                    <MapView
                      maps={visibleMaps}
                      onMapChange={setActiveMapId}
                      isTeacher
                      student={currentUser}
                      onZoneUpdate={updateZone}
                      onRefresh={fetchAll}
                      embedded
                      onLocationTasksFocus={handleMapLocationTasksFocus}
                      onOpenPlantCatalogPreview={openPlantCatalogPreviewById}
                      onForceLogout={forceLogout}
                    />
                  </section>
                  <section className="desktop-split-pane desktop-split-pane--tasks">
                    <div className="desktop-split-scroll">
                      <TasksView
                        maps={visibleMaps}
                        isTeacher
                        student={currentUser}
                        canSelfAssignTasks
                        canViewOtherUsersIdentity
                        hasPermission={hasPermission}
                        hasPermissionInRole={hasPermissionInRole}
                        onRefresh={fetchAll}
                        onForceLogout={forceLogout}
                        onTaskFormOverlayOpenChange={onTaskFormOverlayOpenChange}
                        mapLocationFocus={tasksLocationFocus}
                        onMapLocationFocusChange={setTasksLocationFocus}
                        onOpenPlantCatalogPreview={openPlantCatalogPreviewById}
                      />
                    </div>
                  </section>
                </div>
              )}
              {!useSplitMapTasks && tab === 'map'    && <MapView maps={visibleMaps} onMapChange={setActiveMapId} isTeacher student={currentUser} canSelfAssignTasks onZoneUpdate={updateZone} onRefresh={fetchAll} onLocationTasksFocus={handleMapLocationTasksFocus} onNavigateToTasksForLocation={(effectiveIsTeacher || canAccessStudentMapTasks) ? navigateToTasksForLocation : undefined} onOpenPlantCatalogPreview={openPlantCatalogPreviewById} onForceLogout={forceLogout}/>}
              {!useSplitMapTasks && tab === 'tasks'  && <TasksView  maps={visibleMaps} isTeacher student={currentUser} canSelfAssignTasks canViewOtherUsersIdentity hasPermission={hasPermission} hasPermissionInRole={hasPermissionInRole} onRefresh={fetchAll} onForceLogout={forceLogout} onTaskFormOverlayOpenChange={onTaskFormOverlayOpenChange} mapLocationFocus={tasksLocationFocus} onMapLocationFocusChange={setTasksLocationFocus} onOpenPlantCatalogPreview={openPlantCatalogPreviewById} />}
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
                  <TutorialsViewLazy maps={visibleMaps} isTeacher onRefresh={fetchAll} onForceLogout={forceLogout} />
                </TabSuspense>
              )}
              {publicSettings?.modules?.stats_enabled !== false && tab === 'stats' && (
                hasPermission('stats.read.all') ? (
                  <TabSuspense><TeacherStatsLazy /></TabSuspense>
                ) : (
                  <div className="empty"><p>Pas l’accès stats ici — demande un coup de main côté n3boss si besoin.</p></div>
                )
              )}
              {tab === 'profiles' && (
                <TabSuspense>
                  <ProfilesAdminViewLazy
                    maps={maps}
                    onImpersonationApplied={handleAdminImpersonationApplied}
                  />
                </TabSuspense>
              )}
              {tab === 'audit' && (
                hasPermission('audit.read') ? (
                  <TabSuspense><AuditLogLazy /></TabSuspense>
                ) : (
                  <div className="empty"><p>Journal d’audit réservé — il te manque un droit pour l’ouvrir.</p></div>
                )
              )}
              {publicSettings?.modules?.visit_enabled !== false && tab === 'visit' && (
                <TabSuspense>
                <VisitViewLazy
                  student={currentUser}
                  isTeacher
                  availableTutorials={tutorials}
                  initialMapId={activeMapId}
                  onForceLogout={forceLogout}
                  onOpenMascotPackStudioTab={openMascotPackStudioTab}
                  profileVisitMascotId={currentUser?.visit_mascot_catalog_id || null}
                  mapZones={zones}
                  mapMarkers={markers}
                  catalogTutorials={tutorials}
                  onOpenPlantCatalogPreview={openPlantCatalogPreviewById}
                />
                </TabSuspense>
              )}
              {publicSettings?.modules?.visit_enabled !== false && tab === 'mascot_packs' && (
                <div className="mascot-pack-studio-page" style={{ padding: '12px 16px 24px' }}>
                  <h2 className="section-title" style={{ marginTop: 0 }}>Packs mascotte (visite)</h2>
                  <p className="section-sub" style={{ marginBottom: 14 }}>
                    Carte active :{' '}
                    <select
                      className="form-select"
                      style={{ display: 'inline-block', maxWidth: 280, verticalAlign: 'middle' }}
                      value={activeMapId}
                      onChange={(e) => setActiveMapId(e.target.value)}
                      aria-label="Choisir la carte pour les packs mascotte"
                    >
                      {visibleMaps.map((m) => (
                        <option key={m.id} value={m.id}>{m.label || m.id}</option>
                      ))}
                    </select>
                  </p>
                  <Suspense fallback={(
                    <div className="loader" style={{ padding: '24px 16px', minHeight: 120 }}>
                      <div className="loader-leaf">🌿</div>
                      <p className="section-sub">Chargement de l’éditeur packs mascotte…</p>
                    </div>
                  )}
                  >
                    <VisitMascotPackManagerLazy
                      variant="page"
                      mapId={activeMapId}
                      mapLabel={mascotStudioMapLabel}
                      onPacksChanged={fetchAll}
                      onForceLogout={forceLogout}
                      mascotDialogSettings={publicSettings?.visit?.mascot?.dialog}
                    />
                  </Suspense>
                </div>
              )}
              {tab === 'settings' && <TabSuspense><SettingsAdminViewLazy /></TabSuspense>}
              {tab === 'media_library' && <TabSuspense><MediaLibraryViewLazy canManage={canManageMediaLibrary} /></TabSuspense>}
              {tab === 'forum' && canAccessForum && <TabSuspense><ForumViewLazy authClaims={authClaims} canParticipateForum /></TabSuspense>}
              {tab === 'about' && <TabSuspense><AboutViewLazy appVersion={appVersion} isTeacher={effectiveIsTeacher} /></TabSuspense>}
            </>
          )}
        </div>
      ) : (
        <>
          <div className={`main app-main-shell app-main-shell--student ${useWideMain ? 'main--wide' : ''} ${mapChromeCompactVisible ? 'main--map-visible' : ''} ${useSplitMapTasks ? 'main--maptasks-split' : ''}`}>
            {loading ? (
              <div className="loader" style={{ height: '60vh' }}>
                <div className="loader-leaf">🌿</div>
                <p>{appLoaderText}</p>
              </div>
            ) : (
              <>
                {useSplitMapTasks && (
                  <div className="desktop-split-view" role="region" aria-label={tutorialsModuleEnabled ? 'Vue carte, tâches et tutoriels' : 'Vue carte et tâches'}>
                    <section className="desktop-split-pane desktop-split-pane--map">
                      <MapView
                        maps={visibleMaps}
                        onMapChange={setActiveMapId}
                        isTeacher={false}
                        student={studentForUi}
                        canSelfAssignTasks={canSelfAssignTasks}
                        canEnrollOnTasks={canSelfAssignMoreTasks}
                        onZoneUpdate={updateZone}
                        onRefresh={fetchAll}
                        embedded
                        onLocationTasksFocus={handleMapLocationTasksFocus}
                        onOpenPlantCatalogPreview={openPlantCatalogPreviewById}
                        onForceLogout={forceLogout}
                      />
                    </section>
                    <section className="desktop-split-pane desktop-split-pane--tasks">
                      <div className="desktop-split-scroll">
                        <TasksView
                          maps={visibleMaps}
                          isTeacher={false}
                          student={studentForUi}
                          canSelfAssignTasks={canSelfAssignTasks}
                          canEnrollOnTasks={canSelfAssignMoreTasks}
                          canViewOtherUsersIdentity={canViewOtherUsersIdentity}
                          onRefresh={fetchAll}
                          onForceLogout={forceLogout}
                          onTaskFormOverlayOpenChange={onTaskFormOverlayOpenChange}
                          mapLocationFocus={tasksLocationFocus}
                          onMapLocationFocusChange={setTasksLocationFocus}
                          onOpenPlantCatalogPreview={openPlantCatalogPreviewById}
                        />
                      </div>
                    </section>
                  </div>
                )}
                {!useSplitMapTasks && tab === 'map'    && canAccessStudentMapTasks && <MapView maps={visibleMaps} onMapChange={setActiveMapId} isTeacher={false} student={studentForUi} canSelfAssignTasks={canSelfAssignTasks} canEnrollOnTasks={canSelfAssignMoreTasks} onZoneUpdate={updateZone} onRefresh={fetchAll} onLocationTasksFocus={handleMapLocationTasksFocus} onNavigateToTasksForLocation={navigateToTasksForLocation} onOpenPlantCatalogPreview={openPlantCatalogPreviewById} onForceLogout={forceLogout}/>}
                {!useSplitMapTasks && tab === 'tasks'  && canAccessStudentMapTasks && <TasksView maps={visibleMaps} isTeacher={false} student={studentForUi} canSelfAssignTasks={canSelfAssignTasks} canEnrollOnTasks={canSelfAssignMoreTasks} canViewOtherUsersIdentity={canViewOtherUsersIdentity} onRefresh={fetchAll} onForceLogout={forceLogout} onTaskFormOverlayOpenChange={onTaskFormOverlayOpenChange} mapLocationFocus={tasksLocationFocus} onMapLocationFocusChange={setTasksLocationFocus} onOpenPlantCatalogPreview={openPlantCatalogPreviewById} />}
                {tab === 'plants' && (
                  <TabSuspense>
                    <PlantViewerLazy
                      maps={visibleMaps}
                      onForceLogout={forceLogout}
                    />
                  </TabSuspense>
                )}
                {publicSettings?.modules?.tutorials_enabled !== false && tab === 'tuto' && (
                  <TabSuspense>
                    <TutorialsViewLazy maps={visibleMaps} isTeacher={false} onRefresh={fetchAll} onForceLogout={forceLogout} />
                  </TabSuspense>
                )}
                {tab === 'stats' && canViewGeneralStats && <TabSuspense><TeacherStatsLazy /></TabSuspense>}
                {publicSettings?.modules?.observations_enabled !== false && tab === 'notebook' && (
                  <TabSuspense><ObservationNotebookLazy student={studentForUi} onForceLogout={forceLogout} /></TabSuspense>
                )}
                {publicSettings?.modules?.visit_enabled !== false && tab === 'visit' && (
                  <TabSuspense>
                  <VisitViewLazy
                    student={studentForUi}
                    isTeacher={false}
                    availableTutorials={tutorials}
                    initialMapId={activeMapId}
                    onForceLogout={forceLogout}
                  profileVisitMascotId={studentForUi?.visit_mascot_catalog_id || null}
                    mapZones={zones}
                    mapMarkers={markers}
                    catalogTutorials={tutorials}
                    onOpenPlantCatalogPreview={openPlantCatalogPreviewById}
                  />
                  </TabSuspense>
                )}
                {tab === 'forum' && canAccessForum && <TabSuspense><ForumViewLazy authClaims={authClaims} canParticipateForum={canParticipateForum} /></TabSuspense>}
                {tab === 'about' && <TabSuspense><AboutViewLazy appVersion={appVersion} isTeacher={false} /></TabSuspense>}
              </>
            )}
          </div>
          <nav className="bottom-nav">
            {canAccessStudentMapTasks && shouldUseDesktopSplit && (
              <button className={`nav-btn ${tab === 'maptasks' ? 'active' : ''}`} onClick={() => setTab('maptasks')}>
                <span className="nav-icon">🗺️</span>
                {tutorialsModuleEnabled ? 'Cartes & tâches · tuto' : 'Cartes & tâches'}{studentActiveAssignedTasksCount > 0 && ` (${studentActiveAssignedTasksCount})`}
              </button>
            )}
            {canAccessStudentMapTasks && (
              <button className={`nav-btn ${tab === 'map' ? 'active' : ''}`} onClick={() => setTab('map')}>
                <span className="nav-icon">🗺️</span> Carte
              </button>
            )}
            {canAccessStudentMapTasks && (
              mergeTasksTutoNav ? (
                <button className={`nav-btn ${tab === 'tasks' || tab === 'tuto' ? 'active' : ''}`} type="button" onClick={() => setTab('tasks')}>
                  <span className="nav-icon">✅</span>
                  Tâches&tuto{studentActiveAssignedTasksCount > 0 && ` (${studentActiveAssignedTasksCount})`}
                </button>
              ) : (
                <button className={`nav-btn ${tab === 'tasks' ? 'active' : ''}`} type="button" onClick={() => setTab('tasks')}>
                  <span className="nav-icon">✅</span>
                  {tutorialsModuleEnabled ? 'Tâches · tuto' : 'Tâches'}{studentActiveAssignedTasksCount > 0 && ` (${studentActiveAssignedTasksCount})`}
                </button>
              )
            )}
            <button className={`nav-btn ${tab === 'plants' ? 'active' : ''}`} onClick={() => setTab('plants')}>
              <span className="nav-icon">🌱</span> Biodiversité
            </button>
            {publicSettings?.modules?.tutorials_enabled !== false && !mergeTasksTutoNav && (
              <button className={`nav-btn ${tab === 'tuto' ? 'active' : ''}`} type="button" onClick={() => setTab('tuto')}>
                <span className="nav-icon">📘</span> Tuto
              </button>
            )}
            {canViewGeneralStats && (
              <button className={`nav-btn ${tab === 'stats' ? 'active' : ''}`} onClick={() => setTab('stats')}>
                <span className="nav-icon">📊</span> Stats
              </button>
            )}
            {publicSettings?.modules?.observations_enabled !== false && (
              <button className={`nav-btn ${tab === 'notebook' ? 'active' : ''}`} onClick={() => setTab('notebook')}>
                <span className="nav-icon">📓</span> Carnet
              </button>
            )}
            {publicSettings?.modules?.visit_enabled !== false && (
              <button className={`nav-btn ${tab === 'visit' ? 'active' : ''}`} onClick={() => setTab('visit')}>
                <span className="nav-icon">🧭</span> Visite
              </button>
            )}
            {canAccessForum && (
              <button className={`nav-btn ${tab === 'forum' ? 'active' : ''}`} onClick={() => setTab('forum')}>
                <span className="nav-icon">💬</span> Forum
              </button>
            )}
            <button className={`nav-btn ${tab === 'about' ? 'active' : ''}`} onClick={() => setTab('about')}>
              <span className="nav-icon">ℹ️</span> À propos
            </button>
          </nav>
        </>
      )}
      <footer className="app-footer">{appFooterVersionPrefix} {appVersion != null ? appVersion : '…'}</footer>
    </div>
    </DataProvider>
    </SessionProvider>
    </PublicSettingsProvider>
  );
}


export { App };
