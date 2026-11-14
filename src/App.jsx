import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { getAuthClaims, getStoredSession } from './services/api';
import { useForetmapRealtime } from './hooks/useForetmapRealtime';
import { useNotificationCenter } from './hooks/useNotificationCenter';
import { useForumUnread } from './hooks/useForumUnread';
import { usePwaInstall } from './hooks/usePwaInstall';
import { useViewportLayout } from './hooks/useViewportLayout';
import { getRoleTerms } from './utils/n3-terminology';
import { isLtiArrivalLocation, resolveAppShellTexts } from './utils/appShellTexts';
import { normalizePedagoLevel } from './utils/biodivPedagoLevel.js';
import { AppFooter } from './components/app/AppFooter.jsx';
import { AppHeader } from './components/app/AppHeader.jsx';
import { AppProviders } from './components/app/AppProviders.jsx';
import { AppPedagoOverlays } from './components/app/AppPedagoOverlays.jsx';
import { AppNoticeBanners } from './components/app/AppNoticeBanners.jsx';
import { AppGlobalModals } from './components/app/AppGlobalModals.jsx';
import { TeacherMainContent } from './components/app/TeacherMainContent.jsx';
import { StudentMainContent } from './components/app/StudentMainContent.jsx';
import { UnauthenticatedShell } from './components/app/UnauthenticatedShell.jsx';
import { RolePreviewBanners } from './components/app/RolePreviewBanners.jsx';
import { LtiArrivee } from './components/lti/LtiArrivee.jsx';
import { PublicSettingsProvider } from './contexts/PublicSettingsContext.jsx';
import { useAppBootstrap } from './hooks/useAppBootstrap';
import { useShellMapData } from './hooks/useShellMapData';
import { useAppDataPolling } from './hooks/useAppDataPolling';
import { useAppStoragePersistence } from './hooks/useAppStoragePersistence';
import { useAuthTokenRenewal } from './hooks/useAuthTokenRenewal';
import { useToastNotificationBridge } from './hooks/useToastNotificationBridge';
import { useDefaultActiveMapFromSettings } from './hooks/useDefaultActiveMapFromSettings';
import { useActiveMapVisibilityReconciler } from './hooks/useActiveMapVisibilityReconciler';
import { useStudentSessionRef } from './hooks/useStudentSessionRef';
import { usePasswordChangeRequired } from './hooks/usePasswordChangeRequired';
import { useShellDialogs } from './hooks/useShellDialogs';
import { useGuestVisit } from './hooks/useGuestVisit';
import { useAppTabNavigation } from './hooks/useAppTabNavigation';
import { useForetBrandTheme } from './hooks/useForetBrandTheme';
import { useAppAccess } from './hooks/useAppAccess';
import { useAppSession } from './hooks/useAppSession';
import { useOfflineShell } from './hooks/useOfflineShell';
import { useActiveMapTasks } from './hooks/useActiveMapTasks';
import { useAppPedago } from './hooks/useAppPedago';
import { useAppTabGuards } from './hooks/useAppTabGuards';
import { useAppTargetNavigation } from './hooks/useAppTargetNavigation';
import { useShellContextValues } from './hooks/useShellContextValues';

/*
 * ── APP ─────────────────────────────────────────────────────────────────────────
 * Shell d'orchestration de ForêtMap : il détient les états partagés, appelle les hooks
 * par responsabilité et assemble l'arbre. Découpage (lot 6, cf. post-mortem
 * `docs/AUDIT_REFACTORING_APP_2026-08.md`) :
 * - droits dérivés de la session ............ `hooks/useAppAccess`
 * - cycle de vie de la session .............. `hooks/useAppSession`
 * - onglet courant, navigation, garde-fous .. `hooks/useAppTabNavigation`, `useAppTabGuards`
 * - connectivité / hors ligne ............... `hooks/useOfflineShell`
 * - navigation pédagogique, séance .......... `hooks/useAppPedago`
 * - cibles de notification, liens directs ... `hooks/useAppTargetNavigation`
 * - fournisseurs de contexte ................ `components/app/AppProviders`
 * - surcouches, bandeaux, modales globales .. `components/app/App{PedagoOverlays,NoticeBanners,GlobalModals}`
 * - table de rendu par onglet ............... `components/app/{Teacher,Student}MainContent`
 *
 * L'ordre des hooks à effets est celui d'avant le découpage : ne pas le permuter.
 */
function App() {
  const initialSession = useMemo(() => getStoredSession(), []);
  const [student, setStudent] = useState(() => initialSession?.student || null);
  const studentRef = useStudentSessionRef(initialSession?.student || null, student);
  /** Pendant les modales de la vue Tâches : pas de rafraîchissement données (évite la perte du clavier virtuel mobile). */
  const pauseDataRefreshForTaskOverlaysRef = useRef(false);
  const [sessionUser, setSessionUser] = useState(() => initialSession?.user || null);
  const guestVisit = useGuestVisit();
  const { showPublicVisit, guestVisitNeedsMascotChoice } = guestVisit;
  const dialogs = useShellDialogs();
  const { setShowPin, setShowStats, setShowProfile } = dialogs;
  /** Mot de passe provisoire ou compromis à changer : « Mon profil » s'ouvre à chaque signal. */
  const { passwordChangeRequired, markPasswordChangeRequired } = usePasswordChangeRequired({
    setShowProfile,
  });
  /** Dialogues applicatifs (confirm/prompt/notify) exposés par AppDialogsBridge. */
  const appDialogsRef = useRef(null);
  const tabNav = useAppTabNavigation({ appDialogsRef });
  const { tab, setTab, navigateTab } = tabNav;
  /** Synchronise le filtre lieu de l’onglet tâches avec la zone/repère ouvert(e) sur la carte. */
  const [tasksLocationFocus, setTasksLocationFocus] = useState(null);
  const [toast, setToast] = useState(null);
  /** Feedback OAuth long (erreurs / avertissement création visiteur) — bandeau sur l’écran de connexion. */
  const [oauthFeedback, setOauthFeedback] = useState(null);
  /** Retour Google / Moodle d'un compte soumis à la double authentification : étape à finir. */
  const [oauthMfaChallenge, setOauthMfaChallenge] = useState(null);
  const [profilePromotion, setProfilePromotion] = useState(null);
  const [sessionValidationError, setSessionValidationError] = useState(false);
  const [authClaims, setAuthClaims] = useState(() => getAuthClaims());
  const [roleViewMode, setRoleViewMode] = useState('native'); // native | student | teacher
  const { appVersion, publicSettings, publicSettingsReady } = useAppBootstrap();
  const { brand: foretBrand, style: foretBrandStyle } = useForetBrandTheme(publicSettings);
  const { isTabVisible, shouldUseDesktopSplit } = useViewportLayout();
  const pwa = usePwaInstall({ onToast: setToast });
  /** Incrémenté après succès modale PIN / login prof : déclenche un `fetchAll` sans s’accrocher à chaque changement de `authClaims`. */
  const [pinSuccessFetchAllTick, setPinSuccessFetchAllTick] = useState(0);

  // Droits et drapeaux d'interface (sans effet).
  const access = useAppAccess({
    authClaims,
    roleViewMode,
    sessionUser,
    student,
    publicSettings,
    passwordChangeRequired,
  });
  const { isTeacher, isTeacherAccount, effectiveIsTeacher, helpText, studentForUi } = access;
  const { isClassTeacher, canAccessStudentMapTasks, canSwitchToStudentView } = access;
  const { pedagoSessionsAvailable, rewardsModuleEnabled } = access;

  // D3 — cycle de vie session (OAuth, restauration, /api/auth/me, fenêtres, logout).
  const session = useAppSession({
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
  });
  const { forceLogout, mergeAuthMeResponse, validateStudentSession } = session;

  /*
   * Session établie au sens du chargement des données et du renouvellement de jeton.
   * Doit suivre la même porte que le rendu (`isTeacherAccount`), pas `isTeacher`
   * (`teacher.access`) : un compte enseignant sans cette permission — profil dérivé,
   * ou « Prof de classe » dont on a décoché « Accès interface n3boss » avant le
   * verrouillage — ouvrait l'app puis restait sur « Chargement de la forêt… » parce
   * que `fetchAll` n'était jamais lancé (`loading` reste à true tant que le premier
   * cycle n'a pas fini) et le jeton n'était plus prolongé.
   */
  const hasAuthenticatedShell = !!(student || isTeacherAccount);

  // D4 — données partagées, cycle de rechargement et choix du plan (cf. `useShellMapData`).
  const dataSync = useShellMapData({
    access,
    showPublicVisit,
    publicSettings,
    publicSettingsReady,
    hasAuthenticatedShell,
    studentRef,
    forceLogout,
    mergeAuthMeResponse,
  });
  const { activeMapId, setActiveMapId, zones, tasks, plants, markers, tutorials } = dataSync;
  const { loading, serverDown, fetchAll, chooseMap, visibleMaps, visitInitialMapId } = dataSync;

  useAppStoragePersistence({ tab, onToast: setToast });

  // Prolonge la session avant expiration : sans cela, 1 h 30 après la connexion,
  // l'utilisateur était déconnecté en plein travail (cf. `useAuthTokenRenewal`).
  useAuthTokenRenewal({ enabled: hasAuthenticatedShell, mergeAuthMeResponse });

  // Mise à jour de l'app, réseau, boîte d'envoi hors ligne, sortie terrain.
  const offline = useOfflineShell({
    hasAuthenticatedShell,
    setToast,
    fetchAll,
    fetchAllFull: dataSync.fetchAllFull,
    data: { maps: dataSync.maps, zones, markers, plants, tutorials, activeMapId },
  });

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

  const { tasksForActiveMap, teacherPendingValidationCount, studentActiveAssignedTasksCount } =
    useActiveMapTasks({ tasks, activeMapId, studentForUi });
  useActiveMapVisibilityReconciler({
    activeMapId,
    visibleMaps,
    effectiveIsTeacher,
    showPublicVisit,
    publicSettings,
    setActiveMapId,
  });
  // L'affiliation par compte n'existe plus (le périmètre cartes vient des groupes) : la
  // terminologie n3beur / n3boss est unifiée, `getRoleTerms` ignore déjà son argument. La
  // valeur reste exposée (props et `SessionContext`) pour ne pas retoucher chaque consommateur ;
  // elle vaut désormais toujours `false`.
  const isN3Affiliated = false;
  const roleTerms = getRoleTerms(isN3Affiliated);
  const texts = resolveAppShellTexts(publicSettings);
  /** Met à jour le filtre lieu du volet Tâches (sans changer d’onglet). */
  const handleMapLocationTasksFocus = useCallback((focus) => {
    setTasksLocationFocus(focus);
  }, []);
  const onTaskFormOverlayOpenChange = useCallback((open) => {
    pauseDataRefreshForTaskOverlaysRef.current = !!open;
  }, []);

  /** Cible mémoïsée de la modale statistiques (un littéral casserait le memo de StudentStats). */
  const statsDialogTarget = useMemo(
    () => ({ id: access.profileTargetUserId }),
    [access.profileTargetUserId],
  );

  /** Bascule de vue rôle (natif / élève / prof) : réinitialise onglet et dialogues. */
  const handleRoleViewModeSelect = useCallback(
    (mode) => {
      setRoleViewMode(mode);
      setTab('map');
      setShowStats(false);
      setShowProfile(false);
    },
    [setTab, setShowStats, setShowProfile],
  );

  const handleToastDone = useCallback(() => setToast(null), []);

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
      navigateTab('tasks');
    },
    [effectiveIsTeacher, canAccessStudentMapTasks, useSplitMapTasks, navigateTab],
  );

  // Navigation pédagogique et séance en cours (aperçu plante, glossaire, quiz, fresque…).
  const pedagoAuthenticated = !!(student || isTeacherAccount);
  const pedago = useAppPedago({
    plants,
    visibleMaps,
    navigateTab,
    chooseMap,
    access,
    pedagoAuthenticated,
    setToast,
  });
  const { pedagoSession } = pedago;

  const useWideMain = shouldUseDesktopSplit;
  const mapChromeCompactVisible =
    !loading && (useSplitMapTasks || (!useSplitMapTasks && tab === 'map'));
  // F3 (option A) : la fusion contextuelle Tâches/Tuto est supprimée — les onglets
  // restent stables ; seule l'adaptation grand écran (vue « Cartes & tâches ») subsiste.
  // Les libellés d'onglets prof sont dérivés dans TeacherTopTabs (pôles, audit D-4).

  const rtStatus = useForetmapRealtime({
    // Le prof de classe n'a ni fiche élève ni barre n3boss, mais le forum lui est ouvert.
    enabled: !!(student || effectiveIsTeacher || isClassTeacher),
    fetchAll,
    forceLogout,
    activeMapId,
    setTasks: dataSync.setTasks,
    setTaskProjects: dataSync.setTaskProjects,
    setZones: dataSync.setZones,
    setPlants: dataSync.setPlants,
    setMarkers: dataSync.setMarkers,
    pauseDataRefreshRef: pauseDataRefreshForTaskOverlaysRef,
    allowWebsocket: publicSettings?.realtime?.allow_websocket === true,
  });
  const teacherSyncStatus = effectiveIsTeacher
    ? rtStatus === 'off'
      ? 'polling'
      : rtStatus
    : rtStatus;

  useAppTabGuards({ tab, setTab, access, shouldUseDesktopSplit, publicSettings, student });

  useAppDataPolling({
    fetchAll,
    tab,
    rtStatus,
    refreshMs: dataSync.refreshMs,
    isTabVisible,
    pauseRef: pauseDataRefreshForTaskOverlaysRef,
    liveMinIntervalMs: publicSettings?.runtime?.rest_poll_floor_ms,
    backgroundMinIntervalMs: publicSettings?.runtime?.rest_poll_background_floor_ms,
  });

  const { hasUnread: hasForumUnread } = useForumUnread({
    enabled: !!(student || effectiveIsTeacher || isClassTeacher) && access.canAccessForum,
    userType: String(authClaims?.userType || '').toLowerCase(),
    userId: String(authClaims?.canonicalUserId || authClaims?.userId || ''),
    isForumOpen: tab === 'forum',
    rtStatus,
    isTabVisible,
  });

  const notif = useNotificationCenter({
    isTeacher: effectiveIsTeacher,
    isAdmin: access.isAdmin,
    isClassTeacher,
    tasksForActiveMap,
    student: studentForUi,
    teacherPendingValidationCount,
    rtStatus: teacherSyncStatus,
    serverDown,
    sessionValidationError,
    publicSettings,
    serverEnabled: hasAuthenticatedShell && !showPublicVisit,
  });

  useToastNotificationBridge({ toast, addNotification: notif.addNotification });

  // Demandes de navigation à usage unique (notification, lien direct `?tache=`…).
  const requests = useAppTargetNavigation({
    setToast,
    setPlantCatalogPreview: pedago.setPlantCatalogPreview,
    shouldUseDesktopSplit,
    canAccessStudentMapTasks,
    chooseMap,
    navigateTab,
    hasAuthenticatedShell,
    loading,
    markAsRead: notif.markAsRead,
    trackActionClick: notif.trackActionClick,
    studentForUi,
    effectiveIsTeacher,
    validateStudentSession,
  });
  const { openNotificationAction } = requests;

  // O5 — valeurs des contextes Session / Data (mémoïsées).
  const { sessionContextValue, dataContextValue } = useShellContextValues({
    isN3Affiliated,
    canParticipateContextComments: access.canParticipateContextComments,
    dataSync,
  });

  if (isLtiArrivalLocation()) {
    return (
      <PublicSettingsProvider value={publicSettings}>
        <LtiArrivee />
      </PublicSettingsProvider>
    );
  }

  /*
   * Porte d'entrée de l'application : une session ouverte suffit. Le critère précédent
   * (`!student && !isTeacher`) exigeait `teacher.access` pour tout compte sans fiche
   * n3beur : un prof de classe privé de cette permission se reconnectait avec succès
   * (jeton posé, 200 côté serveur) puis se retrouvait sur l'écran de connexion, sans
   * message — le symptôme était identique en connexion classique et en OAuth Google,
   * parce que le blocage est ici, après le jeton.
   */
  if (!student && !isTeacherAccount)
    return (
      <UnauthenticatedShell
        publicSettings={publicSettings}
        toast={toast}
        onToastDone={handleToastDone}
        oauthFeedback={oauthFeedback}
        onOauthFeedbackDismiss={() => setOauthFeedback(null)}
        mfaChallenge={oauthMfaChallenge}
        onMfaChallengeConsumed={() => setOauthMfaChallenge(null)}
        showPublicVisit={showPublicVisit}
        visitInitialMapId={visitInitialMapId}
        guestVisitNeedsMascotChoice={guestVisitNeedsMascotChoice}
        onGuestBackToAuth={guestVisit.onGuestBackToAuth}
        onGuestMascotChoiceDone={guestVisit.onGuestMascotChoiceDone}
        onLogin={session.handleAuthScreenLogin}
        onVisitGuest={guestVisit.handleVisitAsGuest}
        appVersion={appVersion}
        footerVersionPrefix={texts.footerVersionPrefix}
        isN3Affiliated={isN3Affiliated}
      />
    );
  const { currentUser, currentUserLabel } = access;
  const activeMapPedagoLevel = normalizePedagoLevel(
    (Array.isArray(visibleMaps) ? visibleMaps : []).find(
      (m) => String(m?.id) === String(activeMapId),
    )?.pedago_level,
  );
  const userBiodivPedagoPref = normalizePedagoLevel(
    student?.biodiv_pedago_level ?? sessionUser?.biodiv_pedago_level,
  );
  // Props communes aux deux tables de rendu par onglet (prof / apprenant).
  const mainProps = {
    tab,
    appLoaderText: texts.loader,
    useWideMain,
    mapChromeCompactVisible,
    useSplitMapTasks,
    shouldUseDesktopSplit,
    publicSettings,
    appVersion,
    isN3Affiliated,
    access,
    pedago,
    requests,
    dataSync,
    session,
    sessionUser,
    authClaims,
    updateZone: dataSync.updateZone,
    navigateTab,
    hasForumUnread,
    handleMapLocationTasksFocus,
    navigateToTasksForLocation,
    onTaskFormOverlayOpenChange,
    tasksLocationFocus,
    setTasksLocationFocus,
  };

  return (
    <AppProviders
      pedagoSession={pedagoSession}
      publicSettings={publicSettings}
      biodiv={{
        userPreference: userBiodivPedagoPref,
        mapLevel: activeMapPedagoLevel,
        groupLevels: session.biodivGroupPedagoLevels,
        classCurriculumNiveaux: session.biodivGroupCurriculumNiveaux,
        sessionLevel: pedagoSession.imposedLevel,
        sessionNotionNiveau: pedagoSession.imposedNotionNiveau,
        canTeacherPreview:
          effectiveIsTeacher || (canSwitchToStudentView && roleViewMode === 'student'),
        fullViewByDefault: effectiveIsTeacher || isClassTeacher,
      }}
      dialogsRef={appDialogsRef}
      sessionContextValue={sessionContextValue}
      dataContextValue={dataContextValue}
      tour={{
        tab,
        isTeacher: effectiveIsTeacher,
        isClassTeacher,
        enabled: discoveryTourAutoEnabled,
        accountSeen: session.discoveryTourSeen,
        accountSeenReady: session.discoveryTourSeenReady,
        onTourSeen: session.persistDiscoveryTourSeen,
      }}
    >
      <div id="app" style={foretBrandStyle} data-brand-logo={foretBrand.logoUrl || undefined}>
        <AppPedagoOverlays
          tab={tab}
          pedago={pedago}
          pedagoSessionsAvailable={pedagoSessionsAvailable}
          rewardsModuleEnabled={rewardsModuleEnabled}
          canAddToNotebook={
            pedagoAuthenticated && publicSettings?.modules?.observations_enabled !== false
          }
          visibleMaps={visibleMaps}
          navigateTab={navigateTab}
          forceLogout={forceLogout}
        />
        <AppNoticeBanners
          pwa={pwa}
          offline={offline}
          dataSync={dataSync}
          texts={texts}
          hasAuthenticatedShell={hasAuthenticatedShell}
          latestCriticalNotification={notif.latestCritical}
          openNotificationAction={openNotificationAction}
          sessionValidationError={sessionValidationError}
          setSessionValidationError={setSessionValidationError}
          studentForUi={studentForUi}
          effectiveIsTeacher={effectiveIsTeacher}
          validateStudentSession={validateStudentSession}
        />
        <AppGlobalModals
          offline={offline}
          dialogs={dialogs}
          access={access}
          hasAuthenticatedShell={hasAuthenticatedShell}
          lastSyncAt={dataSync.lastSyncAt}
          setToast={setToast}
          toast={toast}
          onToastDone={handleToastDone}
          profilePromotion={profilePromotion}
          setProfilePromotion={setProfilePromotion}
          roleTerms={roleTerms}
          onPinSuccess={() => {
            setPinSuccessFetchAllTick((n) => n + 1);
            setAuthClaims(getAuthClaims());
            setShowPin(false);
            setToast('Connexion professeur réussie, tout roule');
          }}
          publicSettings={publicSettings}
          isN3Affiliated={isN3Affiliated}
          statsDialogTarget={statsDialogTarget}
          onProfileUpdated={session.handleProfileUpdated}
          rewardsCelebrationEnabled={
            rewardsModuleEnabled && pedagoAuthenticated && !access.isPreviewStudentView
          }
        />

        <AppHeader
          isStandaloneMode={pwa.isStandaloneMode}
          deferredInstallPrompt={pwa.deferredInstallPrompt}
          onInstallClick={pwa.handleInstallClick}
          isTeacher={isTeacher}
          effectiveIsTeacher={effectiveIsTeacher}
          appVersion={appVersion}
          teacherSyncStatus={teacherSyncStatus}
          publicSettings={publicSettings}
          notificationRoleKey={notif.roleKey}
          notifications={notif.items}
          notificationsUnreadCount={notif.unreadCount}
          notificationPrefs={notif.prefs}
          notificationMetrics={notif.metrics}
          onNotificationTogglePref={notif.updatePreference}
          onNotificationOpenAction={openNotificationAction}
          onNotificationMarkAsRead={notif.markAsRead}
          onNotificationMarkAllRead={notif.markAllRead}
          onNotificationRemove={notif.removeNotification}
          onNotificationClearRead={notif.clearRead}
          onNotificationOpenPanel={notif.trackOpenedPanel}
          onNotificationResetMetrics={notif.resetMetrics}
          currentUser={currentUser}
          currentUserLabel={currentUserLabel}
          canOpenUserDialogs={access.canOpenUserDialogs}
          canOpenTeacherStatsFromBadge={access.canOpenTeacherStatsFromBadge}
          roleTerms={roleTerms}
          onOpenStats={dialogs.handleOpenStatsDialog}
          onOpenTeacherStatsTab={tabNav.handleOpenTeacherStatsTab}
          onOpenProfile={dialogs.handleOpenProfileDialog}
          roleViewMode={roleViewMode}
          canSwitchToStudentView={canSwitchToStudentView}
          canSwitchToTeacherView={access.canSwitchToTeacherView}
          onRoleViewModeSelect={handleRoleViewModeSelect}
          isTeacherAccount={isTeacherAccount}
          onRequestPin={dialogs.handleRequestPin}
          onLogout={session.handleLogout}
          helpText={helpText}
          offlineCenter={offline.headerOfflineCenter}
        />

        <RolePreviewBanners
          authClaims={authClaims}
          sessionUser={sessionUser}
          isTeacher={isTeacher}
          roleViewMode={roleViewMode}
          roleTerms={roleTerms}
          helpText={helpText}
          onStopImpersonation={session.stopAdminImpersonation}
          onRoleViewModeSelect={handleRoleViewModeSelect}
        />

        {effectiveIsTeacher ? (
          <TeacherMainContent
            {...mainProps}
            handleTeacherTabChange={tabNav.handleTeacherTabChange}
            teacherPendingValidationCount={teacherPendingValidationCount}
            onMascotPackDirtyChange={tabNav.onMascotPackDirtyChange}
            openMascotPackStudioTab={tabNav.openMascotPackStudioTab}
            handleOpenSettingsLearning={tabNav.handleOpenSettingsLearning}
          />
        ) : (
          <StudentMainContent
            {...mainProps}
            studentActiveAssignedTasksCount={studentActiveAssignedTasksCount}
          />
        )}
        <AppFooter versionPrefix={texts.footerVersionPrefix} appVersion={appVersion} />
      </div>
    </AppProviders>
  );
}

export { App };
