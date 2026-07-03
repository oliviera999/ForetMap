import React, { useEffect, useState } from 'react';
import { MARKER_EMOJIS } from '../../constants/emojis';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import { useOverlayHistoryBack } from '../../hooks/useOverlayHistoryBack';
import { TimedToast } from '../../shared/components/TimedToast.jsx';
import { orderedLivingBeingsForForm } from '../../utils/livingBeings';
import { buildMarkerPayload, markerFormFromMarker } from '../../utils/markerModalForm.js';
import { DialogShell } from '../DialogShell';
import { MarkdownContent } from '../MarkdownContent.jsx';
import { ContextComments } from '../context-comments';
import {
  MarkerCommonFormFields,
  MarkerEmojiField,
  MarkerVisitImageBuilder,
} from './MarkerFormSections.jsx';
import { LocationModalTabBar } from './LocationModalTabBar.jsx';
import { MarkerTutorialCardList } from './MarkerTutorialCardList.jsx';
import { PhotoGallery } from './PhotoGallery.jsx';
import { ZoneTasksStudentPanel, ZoneTasksTeacherPanel } from './ZoneTasksPanel.jsx';
import { ZoneTutorialsTeacherPanel } from './ZoneTutorialsPanel.jsx';
import { LocationVisitAside } from './mapModalShared.jsx';
import { useLocationModalData } from './useLocationModalData.js';
import { useVisitMediaBlocks } from './useVisitMediaBlocks.js';

function MarkerModal({
  marker,
  plants,
  tasks,
  tutorials = [],
  onClose,
  onSave,
  onUpdate,
  onDelete,
  onDuplicate,
  onLinkTask,
  onUnlinkTask,
  onLinkTutorial,
  onUnlinkTutorial,
  onAssignTasks,
  isTeacher,
  student,
  canSelfAssignTasks = true,
  canEnrollOnTasks,
  markerEmojis = MARKER_EMOJIS,
  onNavigateToTasksForLocation = null,
  onOpenTutorialPreview = null,
  contextCommentsEnabled = true,
  canParticipateContextComments = true,
  onRequestAdjustMarkerPosition = null,
  onOpenPlantCatalogPreview = null,
}) {
  const canEnroll = canEnrollOnTasks !== undefined ? canEnrollOnTasks : canSelfAssignTasks;
  const dialogRef = useDialogA11y(onClose);
  useOverlayHistoryBack(true, onClose);
  const isNew = !marker.id;
  const [tab, setTab] = useState('tasks');
  const [form, setForm] = useState(() => markerFormFromMarker(marker));
  const [saving, setSaving] = useState(false);
  const [linkTaskId, setLinkTaskId] = useState('');
  const [linkTutorialId, setLinkTutorialId] = useState('');
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);
  const [assigning, setAssigning] = useState(false);
  const [toast, setToast] = useState(null);
  const [duplicating, setDuplicating] = useState(false);
  const {
    visitEditorialBlocks,
    visitMediaOptions,
    photoOptions: markerPhotoOptions,
    imageBlocks,
    addImageBlock,
    updateImageBlock,
    removeImageBlock,
    attachPhotoToVisit: attachMarkerPhotoToVisit,
  } = useVisitMediaBlocks({
    targetType: 'marker',
    targetId: marker.id,
    mapId: marker.map_id,
    visitBodyJson: marker.visit_body_json,
    enabled: !isNew,
    onToast: setToast,
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Dérivations tâches / tutoriels / biodiversité / bloc visite mutualisées avec
  // ZoneInfoModal — `linkedTasks` / `studentAssignableTasks` y restent mémoïsés
  // (l'effet de nettoyage de la sélection en dépend, fix P0 anti-boucle).
  const {
    linkedTasks,
    studentAssignableTasks,
    assignableTasks,
    linkedTutorialsDirect,
    linkedTutorialsAll,
    tutorialsOnlyViaTasks,
    linkedTutorialsVisible,
    assignableTutorials,
    livingNames: markerLivingNamesOrdered,
    livingBeingsOnlyOnTasks,
    visitAsideTutorials,
    visitAsideSpecies,
    showVisitAsideBlock,
    showTasksTab,
    showTutorialsTab,
  } = useLocationModalData('marker', marker, { tasks, tutorials, student, isTeacher, isNew });

  useEffect(() => {
    if (isNew) return;
    if (!showTasksTab && tab === 'tasks') setTab('info');
  }, [isNew, showTasksTab, tab]);

  useEffect(() => {
    if (isNew) return;
    if (!showTutorialsTab && tab === 'tutorials') setTab('info');
  }, [isNew, showTutorialsTab, tab]);

  useEffect(() => {
    // Garde la référence quand rien ne change : un nouveau tableau systématique
    // relancerait un rendu à chaque passage (boucle « Maximum update depth exceeded »).
    setSelectedTaskIds((prev) => {
      const next = prev.filter((id) => studentAssignableTasks.some((t) => t.id === id));
      return next.length === prev.length ? prev : next;
    });
  }, [studentAssignableTasks]);

  useEffect(() => {
    setForm(markerFormFromMarker(marker, { defaultEmoji: '🌱' }));
    // Déps volontairement au niveau des champs lus (réinitialise seulement sur changement réel,
    // pas sur une nouvelle identité d'objet `marker` au re-rendu parent).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    marker.id,
    marker.label,
    marker.note,
    marker.emoji,
    marker.plant_name,
    marker.living_beings,
    marker.living_beings_list,
    marker.visit_subtitle,
    marker.visit_short_description,
    marker.visit_details_title,
    marker.visit_details_text,
    marker.visit_body_json,
  ]);

  const buildPayload = () => buildMarkerPayload(marker, form, visitEditorialBlocks);

  const saveNew = async () => {
    if (!form.label.trim()) return;
    setSaving(true);
    try {
      await onSave(buildPayload());
      onClose();
    } catch (e) {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!form.label.trim()) return;
    if (!onUpdate) return;
    setSaving(true);
    try {
      await onUpdate(marker.id, buildPayload());
      setToast('Sauvegardé ✓');
      setTab('info');
    } catch (e) {
      setToast('Erreur');
    }
    setSaving(false);
  };

  const TABS_EXISTING = [
    ...(showTasksTab ? [{ id: 'tasks', label: '✅ Tâches' }] : []),
    ...(showTutorialsTab ? [{ id: 'tutorials', label: '📘 Tutoriels' }] : []),
    { id: 'info', label: 'ℹ️ Info' },
    { id: 'photos', label: '📷 Photos' },
    ...(isTeacher ? [{ id: 'edit', label: '✏️ Modifier' }] : []),
  ];

  if (isNew) {
    return (
      <DialogShell
        open
        onClose={onClose}
        overlayClassName="modal-overlay"
        dialogClassName="log-modal fade-in"
        ariaLabel="Nouveau repère"
        closeOnOverlay
        dialogRef={dialogRef}
      >
        {toast && <TimedToast msg={toast} onDone={() => setToast(null)} />}
        <button className="modal-close" onClick={onClose}>
          ✕
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <h3 style={{ margin: 0 }}>Nouveau repère</h3>
        </div>
        {isTeacher ? (
          <>
            <MarkerCommonFormFields form={form} setForm={setForm} plants={plants} set={set} />
            <MarkerEmojiField
              id="marker-new-emoji-custom"
              form={form}
              setForm={setForm}
              markerEmojis={markerEmojis}
            />
            <button
              className="btn btn-primary btn-full"
              style={{ marginTop: 8 }}
              onClick={saveNew}
              disabled={saving}
            >
              {saving ? '...' : '📍 Placer'}
            </button>
          </>
        ) : (
          <p style={{ color: '#64748b', fontSize: '.9rem' }}>
            Création de repère réservée au professeur.
          </p>
        )}
      </DialogShell>
    );
  }

  return (
    <DialogShell
      open
      onClose={onClose}
      overlayClassName="modal-overlay"
      dialogClassName="log-modal fade-in"
      dialogStyle={{ paddingTop: 16 }}
      ariaLabel={`Repère ${marker.label || ''}`}
      closeOnOverlay
      dialogRef={dialogRef}
    >
      {toast && <TimedToast msg={toast} onDone={() => setToast(null)} />}
      <button className="modal-close" onClick={onClose}>
        ✕
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{marker.label}</h3>
          <div style={{ marginTop: 3, fontSize: '.72rem', color: '#64748b', fontWeight: 600 }}>
            Repère
          </div>
        </div>
        {isTeacher && (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {onDuplicate && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={duplicating}
                title="Créer une copie sur la même carte (position légèrement décalée)"
                onClick={async () => {
                  setDuplicating(true);
                  try {
                    await onDuplicate(marker);
                  } catch (_) {
                    setToast('Duplication impossible');
                  }
                  setDuplicating(false);
                }}
              >
                {duplicating ? '…' : '📋 Copie'}
              </button>
            )}
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => {
                if (confirm(`Supprimer le repère « ${marker.label} » ?`)) {
                  onDelete(marker.id);
                  onClose();
                }
              }}
            >
              🗑️
            </button>
          </div>
        )}
      </div>

      <LocationModalTabBar tabs={TABS_EXISTING} activeTab={tab} onSelect={setTab} />

      {onNavigateToTasksForLocation && marker.id && (
        <div style={{ marginBottom: 12 }}>
          <button
            type="button"
            className="btn btn-secondary btn-full"
            onClick={() => {
              onNavigateToTasksForLocation({ kind: 'marker', id: String(marker.id) });
              onClose();
            }}
          >
            ✅ Ouvrir l’onglet Tâches filtré sur ce repère
          </button>
          <p style={{ fontSize: '.74rem', color: '#64748b', margin: '6px 0 0', lineHeight: 1.4 }}>
            Affiche les tâches et tutoriels rattachés à ce lieu dans la liste des tâches.
          </p>
        </div>
      )}

      {tab === 'tasks' && isTeacher && (
        <ZoneTasksTeacherPanel
          locationKind="marker"
          linkedTasks={linkedTasks}
          assignableTasks={assignableTasks}
          linkTaskId={linkTaskId}
          onChangeLinkTaskId={setLinkTaskId}
          onUnlinkTask={async (t) => {
            await onUnlinkTask?.(t);
            setToast('Tâche dissociée');
          }}
          onLinkTask={async (id) => {
            await onLinkTask?.(id);
            setLinkTaskId('');
            setToast('Tâche liée au repère ✓');
          }}
        />
      )}
      {tab === 'tasks' && !isTeacher && (
        <ZoneTasksStudentPanel
          locationKind="marker"
          linkedTasks={linkedTasks}
          student={student}
          canSelfAssignTasks={canSelfAssignTasks}
          canEnroll={canEnroll}
          selectedTaskIds={selectedTaskIds}
          assigning={assigning}
          onToggleTask={(id) =>
            setSelectedTaskIds((prev) =>
              prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
            )
          }
          onAssign={async () => {
            if (!onAssignTasks || selectedTaskIds.length === 0) return;
            setAssigning(true);
            const result = await onAssignTasks(selectedTaskIds);
            if (result.failedCount > 0) {
              const ok =
                result.assignedCount > 0 ? `${result.assignedCount} tâche(s) prise(s). ` : '';
              setToast(
                `${ok}${result.failedCount} échec(s) : ${result.firstError || 'erreur inconnue'}`,
              );
            } else {
              setToast(`${result.assignedCount} tâche(s) prise(s) en charge ✓`);
            }
            setSelectedTaskIds([]);
            setAssigning(false);
          }}
        />
      )}
      {tab === 'tutorials' && isTeacher && (
        <ZoneTutorialsTeacherPanel
          locationKind="marker"
          linkedTutorialsDirect={linkedTutorialsDirect}
          tutorialsOnlyViaTasks={tutorialsOnlyViaTasks}
          assignableTutorials={assignableTutorials}
          linkTutorialId={linkTutorialId}
          onChangeLinkTutorialId={setLinkTutorialId}
          onUnlinkTutorial={async (tu) => {
            await onUnlinkTutorial?.(tu);
            setToast('Tutoriel dissocié');
          }}
          onLinkTutorial={async (id) => {
            await onLinkTutorial?.(id);
            setLinkTutorialId('');
            setToast('Tutoriel lié au repère ✓');
          }}
        />
      )}
      {tab === 'tutorials' && !isTeacher && (
        <div className="fade-in">
          <MarkerTutorialCardList
            tutorials={linkedTutorialsVisible}
            currentMarkerId={marker.id}
            onOpenTutorialPreview={onOpenTutorialPreview}
          />
        </div>
      )}
      {tab === 'info' && (
        <div className="fade-in">
          {marker.note && (
            <div
              style={{
                background: '#f0fdf4',
                borderRadius: 10,
                padding: '10px 14px',
                marginBottom: 12,
                border: '1px solid var(--mint)',
                fontSize: '.88rem',
                color: '#333',
                lineHeight: 1.6,
              }}
            >
              <MarkdownContent>{marker.note}</MarkdownContent>
            </div>
          )}
          {showVisitAsideBlock && (
            <LocationVisitAside
              entity={marker}
              locationKind="marker"
              plants={plants}
              livingNames={markerLivingNamesOrdered}
              livingBeingsOnlyOnTasks={livingBeingsOnlyOnTasks}
              visitAsideSpecies={visitAsideSpecies}
              visitAsideTutorials={visitAsideTutorials}
              tutorials={isTeacher ? linkedTutorialsAll : linkedTutorialsVisible}
              onOpenTutorialPreview={onOpenTutorialPreview}
              onOpenPlantCatalogPreview={onOpenPlantCatalogPreview}
            />
          )}
          {orderedLivingBeingsForForm(
            marker.living_beings_list || marker.living_beings,
            marker.plant_name,
          ).length === 0 &&
            livingBeingsOnlyOnTasks.length === 0 &&
            !marker.note &&
            !showVisitAsideBlock && (
              <p
                style={{
                  color: '#bbb',
                  fontSize: '.85rem',
                  fontStyle: 'italic',
                  textAlign: 'center',
                  padding: '20px 0',
                }}
              >
                Aucune information pour l’instant.
              </p>
            )}
          {contextCommentsEnabled && (
            <ContextComments
              contextType="marker"
              contextId={marker.id}
              title="Commentaires du repère"
              placeholder="Ajouter une observation sur ce repère..."
              canParticipateContextComments={canParticipateContextComments}
            />
          )}
        </div>
      )}
      {tab === 'photos' && (
        <div className="fade-in">
          <PhotoGallery markerId={marker.id} isTeacher={isTeacher} />
        </div>
      )}
      {tab === 'edit' && isTeacher && (
        <div className="fade-in">
          <MarkerCommonFormFields form={form} setForm={setForm} plants={plants} set={set} />
          <MarkerVisitImageBuilder
            imageBlocks={imageBlocks}
            visitMediaOptions={visitMediaOptions}
            markerPhotoOptions={markerPhotoOptions}
            onAddImageBlock={addImageBlock}
            onUpdateImageBlock={updateImageBlock}
            onRemoveImageBlock={removeImageBlock}
            onAssociatePhoto={attachMarkerPhotoToVisit}
          />
          <MarkerEmojiField
            id="marker-edit-emoji-custom"
            form={form}
            setForm={setForm}
            markerEmojis={markerEmojis}
          />
          <button className="btn btn-primary btn-full" onClick={saveEdit} disabled={saving}>
            {saving ? '...' : '💾 Sauvegarder'}
          </button>
          {onRequestAdjustMarkerPosition && (
            <button
              type="button"
              className="btn btn-ghost btn-full"
              style={{ marginTop: 8 }}
              onClick={() => {
                onRequestAdjustMarkerPosition();
                onClose();
              }}
            >
              📍 Ajuster la position sur la carte
            </button>
          )}
        </div>
      )}
    </DialogShell>
  );
}

export { MarkerModal };
