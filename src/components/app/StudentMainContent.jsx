import { AppLoader, FULL_PAGE_LOADER_STYLE } from './AppLoader.jsx';
import { MapTasksArea } from './MapTasksArea.jsx';
import { PedagoTabs } from './PedagoTabs.jsx';
import { StudentBottomNav } from './StudentBottomNav.jsx';
import { TabSuspense } from '../TabSuspense.jsx';
import {
  ForumViewLazy,
  ObservationNotebookLazy,
  PlantViewerLazy,
  ProfilesAdminViewLazy,
  TeacherStatsLazy,
  TutorialsViewLazy,
} from './appLazyViews.js';

/**
 * Zone principale du shell **apprenant** (élève, visiteur, personnel, prof de classe, prof
 * en « vue élève ») : table de rendu par onglet puis barre de navigation du bas. Déplacée
 * telle quelle d'`App.jsx` (lot 6).
 *
 * Les dépendances sont passées explicitement par `App` : droits dérivés (`access`, cf.
 * `useAppAccess`), navigation pédagogique (`pedago`, cf. `useAppPedago`), demandes de
 * navigation à usage unique (`requests`, cf. `useAppTargetNavigation`), données partagées
 * (`dataSync`, cf. `useShellMapData`), session (`session`, cf. `useAppSession`) et
 * gestionnaires du shell. Seules les valeurs utiles à la branche sont lues : la liste de
 * props est commune aux deux branches (`TeacherMainContent` / `StudentMainContent`).
 */
export function StudentMainContent({
  tab,
  appLoaderText,
  useWideMain,
  mapChromeCompactVisible,
  useSplitMapTasks,
  shouldUseDesktopSplit,
  publicSettings,
  appVersion,
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
  studentActiveAssignedTasksCount,
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
  const {
    isTeacher,
    isTeacherAccount,
    hasPermission,
    studentForUi,
    isVisitor,
    isClassTeacher,
    canAccessStudentMapTasks,
    canAccessTutorials,
    canAccessProfiles,
    canAccessForum,
    canParticipateForum,
    canManageFoodWeb,
    canManageIdKeys,
    canManageIndividuals,
    canMeasureIndividuals,
    canSelfAssignTasks,
    canSelfAssignMoreTasks,
    canViewOtherUsersIdentity,
    canViewGeneralStats,
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
    <>
      <main
        className={`main app-main-shell app-main-shell--student ${useWideMain ? 'main--wide' : ''} ${mapChromeCompactVisible ? 'main--map-visible' : ''} ${useSplitMapTasks ? 'main--maptasks-split' : ''}`}
      >
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
              isTeacher={false}
              student={studentForUi}
              maps={visibleMaps}
              onMapChange={chooseMap}
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
                  onForceLogout={forceLogout}
                  onOpenPlant={openPlantCatalogPreviewById}
                  maps={visibleMaps}
                  onActiveMapChange={setActiveMapId}
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
                <TeacherStatsLazy
                  canReadAllStats={hasPermission('stats.read.all')}
                  classTeacherMode={isClassTeacher}
                />
              </TabSuspense>
            )}
            {tab === 'profiles' && canAccessProfiles && (
              <TabSuspense>
                <ProfilesAdminViewLazy onImpersonationApplied={handleAdminImpersonationApplied} />
              </TabSuspense>
            )}
            {publicSettings?.modules?.observations_enabled !== false &&
              tab === 'notebook' &&
              (studentForUi?.id || sessionUser?.id || authClaims?.userId) && (
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
                  canParticipateForum={canParticipateForum}
                  threadRequest={forumThreadRequest}
                  onThreadRequestHandled={consumeForumThreadRequest}
                />
              </TabSuspense>
            )}
            <PedagoTabs
              isTeacher={false}
              tab={tab}
              visitEnabled={publicSettings?.modules?.visit_enabled !== false}
              student={studentForUi || (isTeacherAccount ? sessionUser : null)}
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
      <StudentBottomNav
        tab={tab}
        onTabChange={navigateTab}
        canAccessStudentMapTasks={canAccessStudentMapTasks}
        isVisitor={isVisitor}
        shouldUseDesktopSplit={shouldUseDesktopSplit}
        tutorialsModuleEnabled={tutorialsModuleEnabled}
        canAccessTutorials={canAccessTutorials}
        studentActiveAssignedTasksCount={studentActiveAssignedTasksCount}
        canViewGeneralStats={canViewGeneralStats}
        canAccessProfiles={canAccessProfiles}
        profilesLabel={isClassTeacher ? 'Classe' : 'Profils'}
        observationsEnabled={publicSettings?.modules?.observations_enabled !== false}
        visitEnabled={publicSettings?.modules?.visit_enabled !== false}
        idKeysEnabled={idKeysAvailable}
        pedagoSessionsEnabled={pedagoSessionsAvailable}
        individualsEnabled={individualsAvailable}
        fresqueEnabled={fresqueAvailable}
        canAccessForum={canAccessForum}
        hasForumUnread={hasForumUnread}
      />
    </>
  );
}
