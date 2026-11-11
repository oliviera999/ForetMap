import { Suspense } from 'react';
import { AppLoader, FULL_PAGE_LOADER_STYLE } from './AppLoader.jsx';
import { MapTasksArea } from './MapTasksArea.jsx';
import { PedagoTabs } from './PedagoTabs.jsx';
import { TeacherTopTabs } from './TeacherTopTabs.jsx';
import { TabSuspense } from '../TabSuspense.jsx';
import {
  AuditLogLazy,
  ForumViewLazy,
  MediaLibraryViewLazy,
  ObservationNotebookLazy,
  PlantManagerLazy,
  ProfilesAdminViewLazy,
  SettingsAdminViewLazy,
  TeacherStatsLazy,
  TutorialsViewLazy,
  VisitMascotPackManagerLazy,
} from './appLazyViews.js';

/** Style du loader de l'éditeur packs mascotte (constante : évite un objet recréé à chaque rendu). */
const MASCOT_PACK_LOADER_STYLE = { padding: '24px 16px', minHeight: 120 };

/**
 * Zone principale du shell **prof** (chrome n3boss) : barre d'onglets du haut, puis la
 * table de rendu par onglet (carte & tâches, plantes, tutoriels, stats, profils, audit,
 * packs mascotte, réglages, médiathèque, carnet, forum, onglets pédagogiques). Déplacée
 * telle quelle d'`App.jsx` (lot 6).
 *
 * Les dépendances sont passées explicitement par `App` : droits dérivés (`access`, cf.
 * `useAppAccess`), navigation pédagogique (`pedago`, cf. `useAppPedago`), demandes de
 * navigation à usage unique (`requests`, cf. `useAppTargetNavigation`), données partagées
 * (`dataSync`, cf. `useShellMapData`), session (`session`, cf. `useAppSession`) et
 * gestionnaires du shell. Seules les valeurs utiles à la branche sont lues : la liste de
 * props est commune aux deux branches (`TeacherMainContent` / `StudentMainContent`).
 */
export function TeacherMainContent({
  tab,
  appLoaderText,
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
  updateZone,
  navigateTab,
  hasForumUnread,
  handleMapLocationTasksFocus,
  navigateToTasksForLocation,
  onTaskFormOverlayOpenChange,
  tasksLocationFocus,
  setTasksLocationFocus,
  handleTeacherTabChange,
  teacherPendingValidationCount,
  onMascotPackDirtyChange,
  openMascotPackStudioTab,
  handleOpenSettingsLearning,
}) {
  const {
    loading,
    visibleMaps,
    chooseMap,
    setActiveMapId,
    fetchAll,
    tutorials,
    activeMapId,
    zones,
    markers,
  } = dataSync;
  const { forceLogout, onPersistVisitMascotId, handleAdminImpersonationApplied } = session;
  const { currentUser } = access;
  const {
    isTeacher,
    effectiveIsTeacher,
    hasPermission,
    hasPermissionInRole,
    isClassTeacher,
    canAccessStudentMapTasks,
    canAccessForum,
    canManageMediaLibrary,
    canReadStats,
    canManageQuiz,
    canManageFoodWeb,
    canManageIdKeys,
    canManageIndividuals,
    canMeasureIndividuals,
    pedagoModuleAccess,
    idKeysAvailable,
    individualsAvailable,
    pedagoSessionsAvailable,
    fresqueAvailable,
    tutorialsModuleEnabled,
  } = access;
  const {
    openPlantCatalogPreviewById,
    openGlossaryPopover,
    openPedagoQuizQuestion,
    pedagoGlossaryCode,
    setPedagoGlossaryCode,
    pedagoQuizQuestionCode,
    pedagoQuizNotionId,
    pedagoQuizNotionNiveau,
    pedagoIdKeysInitialKey,
    foodWebHighlightPlantId,
    pedagoEntry,
    pedagoMapRouteRequest,
    consumePedagoMapRouteRequest,
    sessionsProps,
    fresqueProps,
  } = pedago;
  const launchPedagoSession = pedago.pedagoSession.launchSession;
  const {
    mapPlaceRequest,
    consumeMapPlaceRequest,
    tasksFocusRequest,
    consumeTasksFocusRequest,
    forumThreadRequest,
    consumeForumThreadRequest,
  } = requests;

  return (
    /* `<main>` et non `<div>` : sans repère principal, `axe` signalait
     `landmark-one-main` sur tous les écrans et `region` sur CHAQUE bloc de
     contenu hors repère — 401 nœuds sur les tâches, 522 sur la biodiversité.
     Les styles ciblent la classe, pas la balise : rendu inchangé.
     Cf. `docs/AUDIT_VISITE_UI_UX_2026-09.md` §6. */
    <main
      className={`main teacher-main app-main-shell app-main-shell--teacher ${useWideMain ? 'main--wide' : ''} ${mapChromeCompactVisible ? 'teacher-main--map-visible' : ''} ${useSplitMapTasks ? 'main--maptasks-split' : ''}`}
    >
      <TeacherTopTabs
        tab={tab}
        onTabChange={handleTeacherTabChange}
        shouldUseDesktopSplit={shouldUseDesktopSplit}
        teacherPendingValidationCount={teacherPendingValidationCount}
        tutorialsModuleEnabled={tutorialsModuleEnabled}
        statsEnabled={publicSettings?.modules?.stats_enabled !== false}
        visitEnabled={publicSettings?.modules?.visit_enabled !== false}
        observationsEnabled={publicSettings?.modules?.observations_enabled !== false}
        idKeysEnabled={idKeysAvailable}
        pedagoSessionsEnabled={pedagoSessionsAvailable}
        individualsEnabled={individualsAvailable}
        fresqueEnabled={fresqueAvailable}
        canAccessForum={canAccessForum}
        hasForumUnread={hasForumUnread}
        isN3Affiliated={isN3Affiliated}
        hasPermission={hasPermission}
        hasPermissionInRole={hasPermissionInRole}
      />
      {loading ? (
        <AppLoader text={appLoaderText} style={FULL_PAGE_LOADER_STYLE} />
      ) : (
        <>
          <MapTasksArea
            mapRouteRequest={pedagoMapRouteRequest}
            onMapRouteRequestHandled={consumePedagoMapRouteRequest}
            mapPlaceRequest={mapPlaceRequest}
            onMapPlaceRequestHandled={consumeMapPlaceRequest}
            tasksFocusRequest={tasksFocusRequest}
            onTasksFocusRequestHandled={consumeTasksFocusRequest}
            onStartPedagoSession={pedagoSessionsAvailable ? launchPedagoSession : null}
            isTeacher
            student={currentUser}
            maps={visibleMaps}
            onMapChange={chooseMap}
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
                onForceLogout={forceLogout}
                onOpenPlant={openPlantCatalogPreviewById}
                maps={visibleMaps}
                onActiveMapChange={setActiveMapId}
                canValidateHazards={hasPermissionInRole('plants.hazards.validate')}
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
            (canReadStats ? (
              <TabSuspense>
                <TeacherStatsLazy
                  canReadAllStats={hasPermission('stats.read.all')}
                  classTeacherMode={isClassTeacher}
                />
              </TabSuspense>
            ) : (
              <div className="empty">
                <p>Pas l’accès stats ici — demande un coup de main côté n3boss si besoin.</p>
              </div>
            ))}
          {tab === 'profiles' && (
            <TabSuspense>
              <ProfilesAdminViewLazy onImpersonationApplied={handleAdminImpersonationApplied} />
            </TabSuspense>
          )}
          {tab === 'audit' &&
            (hasPermission('audit.read') ? (
              <TabSuspense>
                <AuditLogLazy canReadSecurity={hasPermission('audit.security.read')} />
              </TabSuspense>
            ) : (
              <div className="empty">
                <p>Journal d’audit réservé — il te manque un droit pour l’ouvrir.</p>
              </div>
            ))}
          {publicSettings?.modules?.visit_enabled !== false && tab === 'mascot_packs' && (
            <div className="mascot-pack-studio-page" style={{ padding: '12px 16px 24px' }}>
              <h2 className="section-title" style={{ marginTop: 0 }}>
                Packs mascotte (visite)
              </h2>
              <p className="section-sub" style={{ marginBottom: 14 }}>
                Les packs publiés sont proposés aux visiteurs sur <strong>toutes les cartes</strong>{' '}
                de la visite.
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
                canWriteSettings={hasPermissionInRole('admin.settings.write')}
                canManageTours={hasPermissionInRole('tours.manage')}
                canManageMoodle={hasPermissionInRole('integrations.moodle.manage')}
                canManageZones={hasPermissionInRole('zones.manage')}
                canManageMarkers={hasPermissionInRole('map.manage_markers')}
                canWriteSecrets={hasPermissionInRole('admin.settings.secrets.write')}
              />
            </TabSuspense>
          )}
          {tab === 'media_library' && (
            <TabSuspense>
              <MediaLibraryViewLazy canManage={canManageMediaLibrary} />
            </TabSuspense>
          )}
          {publicSettings?.modules?.observations_enabled !== false &&
            tab === 'notebook' &&
            (sessionUser?.id || authClaims?.userId) && (
              <TabSuspense>
                <ObservationNotebookLazy
                  zones={zones}
                  isTeacher={isTeacher}
                  onForceLogout={forceLogout}
                  onNavigateTab={(nav) => {
                    if (nav?.tab) navigateTab(nav.tab);
                  }}
                />
              </TabSuspense>
            )}
          {tab === 'forum' && canAccessForum && (
            <TabSuspense>
              <ForumViewLazy
                authClaims={authClaims}
                canParticipateForum
                threadRequest={forumThreadRequest}
                onThreadRequestHandled={consumeForumThreadRequest}
              />
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
            quizInitialNotionId={pedagoQuizNotionId}
            quizInitialNotionNiveau={pedagoQuizNotionNiveau}
            idKeysInitialKey={pedagoIdKeysInitialKey}
            maps={visibleMaps}
            foodWebHighlightPlantId={foodWebHighlightPlantId}
            canManageFoodWeb={canManageFoodWeb}
            canManageIdKeys={canManageIdKeys}
            canManageIndividuals={canManageIndividuals}
            canMeasureIndividuals={canMeasureIndividuals}
            appVersion={appVersion}
            canReadSiteIssues={hasPermissionInRole('admin.settings.read')}
            canReadTeacherGuide={
              hasPermissionInRole('reference_docs.teacher_guide.read') ||
              hasPermissionInRole('admin.settings.read')
            }
            onOpenSettingsLearning={handleOpenSettingsLearning}
            sessionsProps={sessionsProps}
            pedagoEntry={pedagoEntry}
            idKeysEnabled={idKeysAvailable}
            individualsEnabled={individualsAvailable}
            pedagoSessionsEnabled={pedagoSessionsAvailable}
            idKeysOffForLearners={pedagoModuleAccess.idKeys.learnerOff}
            individualsOffForLearners={pedagoModuleAccess.individuals.learnerOff}
            pedagoSessionsOffForLearners={pedagoModuleAccess.pedagoSessions.learnerOff}
            fresqueEnabled={fresqueAvailable}
            fresqueOffForLearners={pedagoModuleAccess.fresque.learnerOff}
            fresqueProps={fresqueProps}
          />
        </>
      )}
    </main>
  );
}
