import { api } from '../../services/api';
import { ZoneInfoModal } from './ZoneInfoModal.jsx';
import { MarkerModal } from './MarkerModal.jsx';
import { ZoneDrawModal } from './ZoneDrawModal.jsx';

/**
 * Fenêtres de lieu de la carte de travail : fiche de la zone ou du repère sélectionné, et
 * création d'une zone tracée ou d'un repère posé.
 *
 * Extrait de `MapViewImpl` (`src/components/map-views.jsx`, étape B4 de l'audit du
 * 25/09/2026, § 3.3 ligne 5 — patron O6). Composant sans état : la sélection vit dans la
 * carte, qui passe ses setters ; les actions API viennent de `useMapCrudActions`.
 */
export function MapViewLocationModals({
  activeMapId,
  isTeacher,
  student,
  canSelfAssignTasks,
  canEnrollOnTasks,
  plants,
  tasks,
  tutorials,
  categoryCatalog,
  markerEmojis,
  emojiParsingList,
  contextCommentsEnabled,
  canParticipateContextComments,
  commentsFocusKey,
  selectedZone,
  setSelectedZone,
  selectedMarker,
  setSelectedMarker,
  pendingZone,
  setPendingZone,
  pendingMarker,
  setPendingMarker,
  crud,
  onZoneUpdate,
  onRefresh,
  onNavigateToTasksForLocation,
  onOpenPlantCatalogPreview,
  onOpenTutorialPreview,
  onCloseDetail,
  onEditZonePoints,
  onRequestAdjustMarkerPosition,
  setToast,
}) {
  const {
    saveMarker,
    updateMarker,
    linkTaskToLocation,
    unlinkTaskFromLocation,
    linkTutorialToLocation,
    unlinkTutorialFromLocation,
    deleteMarker,
    deleteZone,
    duplicateZone,
    duplicateMarker,
    assignTasksToStudent,
  } = crud;

  const updateMarkerAndClose = async (id, data) => {
    await updateMarker(id, data);
    setSelectedMarker(null);
  };

  const duplicateZoneAndSelect = async (z) => {
    const created = await duplicateZone(z);
    setSelectedZone(created);
    setToast('Zone dupliquée ✓');
  };

  const duplicateMarkerAndSelect = async (m) => {
    const created = await duplicateMarker(m);
    setSelectedMarker(created);
    setToast('Repère dupliqué ✓');
  };

  /** Ouvre une fiche espèce du catalogue et referme la fiche du lieu. */
  const plantPreviewThenClose = (close) =>
    onOpenPlantCatalogPreview
      ? (id) => {
          onOpenPlantCatalogPreview(id);
          close(null);
        }
      : null;

  return (
    <>
      {selectedZone && (
        <ZoneInfoModal
          zone={selectedZone}
          plants={plants}
          categoryCatalog={categoryCatalog}
          tasks={tasks}
          tutorials={tutorials}
          isTeacher={isTeacher}
          student={student}
          canSelfAssignTasks={canSelfAssignTasks}
          canEnrollOnTasks={canEnrollOnTasks}
          markerEmojis={markerEmojis}
          emojiParsingList={emojiParsingList}
          contextCommentsEnabled={contextCommentsEnabled}
          canParticipateContextComments={canParticipateContextComments}
          focusComments={commentsFocusKey === `zone:${selectedZone.id}`}
          onClose={() => {
            onCloseDetail();
            setSelectedZone(null);
          }}
          onUpdate={async (id, data) => {
            await onZoneUpdate(id, data);
            setSelectedZone(null);
            await onRefresh();
          }}
          onDelete={async (id) => {
            await deleteZone(id);
            setSelectedZone(null);
          }}
          onDuplicate={isTeacher ? duplicateZoneAndSelect : undefined}
          onLinkTask={async (taskId) => linkTaskToLocation(taskId, 'zone', selectedZone.id)}
          onUnlinkTask={(t) => unlinkTaskFromLocation(t, 'zone', selectedZone.id)}
          onAssignTasks={assignTasksToStudent}
          onLinkTutorial={async (tutorialId) =>
            linkTutorialToLocation(tutorialId, 'zone', selectedZone.id)
          }
          onUnlinkTutorial={(tu) => unlinkTutorialFromLocation(tu, 'zone', selectedZone.id)}
          onEditPoints={
            isTeacher
              ? (z) => {
                  onEditZonePoints(z);
                  setSelectedZone(null);
                }
              : null
          }
          onNavigateToTasksForLocation={onNavigateToTasksForLocation}
          onOpenTutorialPreview={onOpenTutorialPreview}
          onOpenPlantCatalogPreview={plantPreviewThenClose(setSelectedZone)}
        />
      )}
      {selectedMarker && (
        <MarkerModal
          marker={selectedMarker}
          plants={plants}
          categoryCatalog={categoryCatalog}
          tasks={tasks}
          tutorials={tutorials}
          isTeacher={isTeacher}
          student={student}
          canSelfAssignTasks={canSelfAssignTasks}
          canEnrollOnTasks={canEnrollOnTasks}
          markerEmojis={markerEmojis}
          contextCommentsEnabled={contextCommentsEnabled}
          canParticipateContextComments={canParticipateContextComments}
          focusComments={commentsFocusKey === `marker:${selectedMarker.id}`}
          onClose={() => {
            onCloseDetail();
            setSelectedMarker(null);
          }}
          onUpdate={updateMarkerAndClose}
          onDelete={deleteMarker}
          onDuplicate={isTeacher ? duplicateMarkerAndSelect : undefined}
          onLinkTask={async (taskId) => linkTaskToLocation(taskId, 'marker', selectedMarker.id)}
          onUnlinkTask={(t) => unlinkTaskFromLocation(t, 'marker', selectedMarker.id)}
          onLinkTutorial={async (tutorialId) =>
            linkTutorialToLocation(tutorialId, 'marker', selectedMarker.id)
          }
          onUnlinkTutorial={(tu) => unlinkTutorialFromLocation(tu, 'marker', selectedMarker.id)}
          onAssignTasks={assignTasksToStudent}
          onNavigateToTasksForLocation={onNavigateToTasksForLocation}
          onOpenTutorialPreview={onOpenTutorialPreview}
          onOpenPlantCatalogPreview={plantPreviewThenClose(setSelectedMarker)}
          onRequestAdjustMarkerPosition={isTeacher ? onRequestAdjustMarkerPosition : undefined}
        />
      )}
      {pendingZone && (
        <ZoneDrawModal
          points_pct={pendingZone}
          plants={plants}
          categoryCatalog={categoryCatalog}
          markerEmojis={markerEmojis}
          emojiParsingList={emojiParsingList}
          onClose={() => setPendingZone(null)}
          onSave={async (data) => {
            await api('/api/zones', 'POST', { ...data, map_id: activeMapId });
            setPendingZone(null);
            await onRefresh();
          }}
        />
      )}
      {pendingMarker && (
        <MarkerModal
          marker={{
            x_pct: pendingMarker.xp,
            y_pct: pendingMarker.yp,
            label: '',
            note: '',
            emoji: markerEmojis[0] || '🌱',
            map_id: activeMapId,
          }}
          plants={plants}
          categoryCatalog={categoryCatalog}
          isTeacher={isTeacher}
          markerEmojis={markerEmojis}
          onClose={() => setPendingMarker(null)}
          onSave={saveMarker}
          onDelete={() => setPendingMarker(null)}
        />
      )}
    </>
  );
}
