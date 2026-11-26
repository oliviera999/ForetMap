import { Suspense, useEffect, useState } from 'react';
import { lazyScreen } from '../../shared/lazyScreen.jsx';
import { AppLoader } from './AppLoader.jsx';

/**
 * Carte et tâches hors du chunk shell initial : le shell connecté s'affiche plus tôt
 * après connexion ; le premier onglet charge son morceau à la demande.
 */
const MapView = lazyScreen(() => import('../map-views').then((m) => ({ default: m.MapView })));
const TasksView = lazyScreen(() =>
  import('../tasks-views').then((m) => ({ default: m.TasksView })),
);

const PANEL_FALLBACK = (
  <AppLoader text="Chargement…" style={{ minHeight: '40vh', padding: '1.5rem' }} />
);

/**
 * Zone carte + tâches partagée par les branches prof et élève d'App.jsx (D4) :
 * vue scindée bureau (useSplitMapTasks), onglet carte seul, onglet tâches seul.
 * Chaque différence historique entre les deux branches est préservée via une
 * prop dédiée (voir cartographie D4) :
 *
 * - `canAccessSoloMapTasks` : gating des onglets carte/tâches hors split
 *   (prof : toujours true ; élève : canAccessStudentMapTasks) ;
 * - `splitMapCanSelfAssignTasks` : la branche prof ne passait PAS
 *   `canSelfAssignTasks` au MapView du split (asymétrie historique avec le
 *   MapView plein écran prof, sans effet réel car le défaut vaut true) —
 *   préservée telle quelle : prof = undefined, élève = canSelfAssignTasks ;
 * - `canEnrollOnTasks` : jamais passé côté prof (undefined → les vues
 *   retombent sur canSelfAssignTasks, comme avant) ;
 * - `hasPermission` / `hasPermissionInRole` : volontairement absents côté
 *   élève (undefined → défaut `() => false` des vues, cf. note O5 d'App.jsx).
 *
 * Mobile : une fois un onglet visité, il reste monté mais masqué (`hidden`) pour
 * éviter le coût de remontage (image de plan, tuiles) à chaque aller-retour.
 */
export function MapTasksArea({
  isTeacher,
  student,
  maps,
  onMapChange,
  useSplitMapTasks,
  tab,
  tutorialsModuleEnabled,
  canAccessSoloMapTasks,
  splitMapCanSelfAssignTasks,
  canSelfAssignTasks,
  canEnrollOnTasks,
  canViewOtherUsersIdentity,
  hasPermission,
  hasPermissionInRole,
  onZoneUpdate,
  onRefresh,
  onForceLogout,
  onLocationTasksFocus,
  onNavigateToTasksForLocation,
  onTaskFormOverlayOpenChange,
  mapLocationFocus,
  onMapLocationFocusChange,
  onOpenPlantCatalogPreview,
  onPersistVisitMascotId = null,
  mapRouteRequest = null,
  onMapRouteRequestHandled = null,
  mapPlaceRequest = null,
  onMapPlaceRequestHandled = null,
  tasksFocusRequest = null,
  onTasksFocusRequestHandled = null,
  onStartPedagoSession = null,
}) {
  const [keepMapMounted, setKeepMapMounted] = useState(() => tab === 'map');
  const [keepTasksMounted, setKeepTasksMounted] = useState(() => tab === 'tasks');

  useEffect(() => {
    if (tab === 'map') setKeepMapMounted(true);
    if (tab === 'tasks') setKeepTasksMounted(true);
  }, [tab]);

  const mapRequestProps = {
    routeRequest: mapRouteRequest,
    onRouteRequestHandled: onMapRouteRequestHandled,
    placeRequest: mapPlaceRequest,
    onPlaceRequestHandled: onMapPlaceRequestHandled,
  };
  const tasksRequestProps = {
    focusRequest: tasksFocusRequest,
    onFocusRequestHandled: onTasksFocusRequestHandled,
  };

  const mapView = (
    <MapView
      maps={maps}
      onMapChange={onMapChange}
      isTeacher={isTeacher}
      student={student}
      canSelfAssignTasks={useSplitMapTasks ? splitMapCanSelfAssignTasks : canSelfAssignTasks}
      canEnrollOnTasks={canEnrollOnTasks}
      onZoneUpdate={onZoneUpdate}
      onRefresh={onRefresh}
      embedded={useSplitMapTasks || undefined}
      onLocationTasksFocus={onLocationTasksFocus}
      onNavigateToTasksForLocation={useSplitMapTasks ? undefined : onNavigateToTasksForLocation}
      onOpenPlantCatalogPreview={onOpenPlantCatalogPreview}
      onPersistVisitMascotId={onPersistVisitMascotId}
      onForceLogout={onForceLogout}
      {...mapRequestProps}
    />
  );

  const tasksView = (
    <TasksView
      maps={maps}
      onMapChange={onMapChange}
      isTeacher={isTeacher}
      student={student}
      canSelfAssignTasks={canSelfAssignTasks}
      canEnrollOnTasks={canEnrollOnTasks}
      canViewOtherUsersIdentity={canViewOtherUsersIdentity}
      hasPermission={hasPermission}
      hasPermissionInRole={hasPermissionInRole}
      onRefresh={onRefresh}
      onForceLogout={onForceLogout}
      onTaskFormOverlayOpenChange={onTaskFormOverlayOpenChange}
      mapLocationFocus={mapLocationFocus}
      onMapLocationFocusChange={onMapLocationFocusChange}
      onOpenPlantCatalogPreview={onOpenPlantCatalogPreview}
      onStartPedagoSession={onStartPedagoSession}
      {...tasksRequestProps}
    />
  );

  return (
    <>
      {useSplitMapTasks && (
        <div
          className="desktop-split-view"
          role="region"
          aria-label={
            tutorialsModuleEnabled ? 'Vue carte, tâches et tutoriels' : 'Vue carte et tâches'
          }
        >
          <section className="desktop-split-pane desktop-split-pane--map">
            <Suspense fallback={PANEL_FALLBACK}>{mapView}</Suspense>
          </section>
          <section className="desktop-split-pane desktop-split-pane--tasks">
            <div className="desktop-split-scroll">
              <Suspense fallback={PANEL_FALLBACK}>{tasksView}</Suspense>
            </div>
          </section>
        </div>
      )}
      {!useSplitMapTasks && canAccessSoloMapTasks && keepMapMounted && (
        <div hidden={tab !== 'map'} aria-hidden={tab !== 'map'}>
          <Suspense fallback={tab === 'map' ? PANEL_FALLBACK : null}>{mapView}</Suspense>
        </div>
      )}
      {!useSplitMapTasks && canAccessSoloMapTasks && keepTasksMounted && (
        <div hidden={tab !== 'tasks'} aria-hidden={tab !== 'tasks'}>
          <Suspense fallback={tab === 'tasks' ? PANEL_FALLBACK : null}>{tasksView}</Suspense>
        </div>
      )}
    </>
  );
}
