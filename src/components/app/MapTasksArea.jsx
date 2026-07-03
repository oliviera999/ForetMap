import React from 'react';

import { MapView } from '../map-views';
import { TasksView } from '../tasks-views';

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
 * Un seul bloc est rendu à la fois (split OU carte OU tâches) — iso-rendu.
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
}) {
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
            <MapView
              maps={maps}
              onMapChange={onMapChange}
              isTeacher={isTeacher}
              student={student}
              canSelfAssignTasks={splitMapCanSelfAssignTasks}
              canEnrollOnTasks={canEnrollOnTasks}
              onZoneUpdate={onZoneUpdate}
              onRefresh={onRefresh}
              embedded
              onLocationTasksFocus={onLocationTasksFocus}
              onOpenPlantCatalogPreview={onOpenPlantCatalogPreview}
              onForceLogout={onForceLogout}
            />
          </section>
          <section className="desktop-split-pane desktop-split-pane--tasks">
            <div className="desktop-split-scroll">
              <TasksView
                maps={maps}
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
              />
            </div>
          </section>
        </div>
      )}
      {!useSplitMapTasks && tab === 'map' && canAccessSoloMapTasks && (
        <MapView
          maps={maps}
          onMapChange={onMapChange}
          isTeacher={isTeacher}
          student={student}
          canSelfAssignTasks={canSelfAssignTasks}
          canEnrollOnTasks={canEnrollOnTasks}
          onZoneUpdate={onZoneUpdate}
          onRefresh={onRefresh}
          onLocationTasksFocus={onLocationTasksFocus}
          onNavigateToTasksForLocation={onNavigateToTasksForLocation}
          onOpenPlantCatalogPreview={onOpenPlantCatalogPreview}
          onForceLogout={onForceLogout}
        />
      )}
      {!useSplitMapTasks && tab === 'tasks' && canAccessSoloMapTasks && (
        <TasksView
          maps={maps}
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
        />
      )}
    </>
  );
}
