import { useEffect, useState } from 'react';
import { MARKER_EMOJIS } from '../../constants/emojis';
import { useDialogA11y } from '../../shared/platform/useDialogA11y';
import { useOverlayHistoryBack } from '../../shared/platform/useOverlayHistoryBack';
import { useAppDialogs } from '../../shared/components/AppDialogsProvider.jsx';
import { orderedLivingBeingsForForm } from '../../utils/livingBeings';
import { buildMarkerPayload, markerFormFromMarker } from '../../utils/markerModalForm.js';
import { MarkdownContent } from '../MarkdownContent.jsx';
import { LocationLinksBlock } from './LocationLinksBlock.jsx';
import { LocationNotesBlock } from './LocationNotesBlock.jsx';
import { useAudienceGroupOptions } from '../../hooks/useAudienceGroupOptions.js';
import {
  MarkerCommonFormFields,
  MarkerEmojiField,
  MarkerVisitImageBuilder,
} from './MarkerFormSections.jsx';
import { LocationCategoryBadges } from './LocationCategoryPicker.jsx';
import { LocationModalTabBar } from './LocationModalTabBar.jsx';
import { MarkerTutorialCardList } from './MarkerTutorialCardList.jsx';
import { PhotoGallery } from './PhotoGallery.jsx';
import { LocationVisitAside, useScrollIntoViewOnMount } from './mapModalShared.jsx';
import { useLocationModalData } from './useLocationModalData.js';
import { useVisitMediaBlocks } from './useVisitMediaBlocks.js';
import {
  LocationCommentsSection,
  LocationEmptyInfo,
  LocationHeaderActions,
  LocationModalShell,
  LocationSaveButton,
  LocationTasksShortcut,
  LocationTasksTab,
  LocationTextBox,
  LocationTutorialsTeacherTab,
  buildLocationModalTabs,
} from './LocationModalParts.jsx';
import {
  useLocationLinkActions,
  useLocationModalTab,
  useLocationTaskAssignment,
} from './useLocationModalState.js';
import { IconMarker, IconSave } from '../../shared/icons.jsx';

function MarkerModal({
  marker,
  plants,
  categoryCatalog = [],
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
  focusComments = false,
}) {
  const canEnroll = canEnrollOnTasks !== undefined ? canEnrollOnTasks : canSelfAssignTasks;
  const { confirm } = useAppDialogs();
  const dialogRef = useDialogA11y(onClose);
  useOverlayHistoryBack(true, onClose);
  const isNew = !marker.id;
  const commentsRef = useScrollIntoViewOnMount(focusComments && !isNew);
  const [form, setForm] = useState(() => markerFormFromMarker(marker));
  const [saving, setSaving] = useState(false);
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
    visitAsideShortDesc,
    showVisitAsideBlock,
    showTasksTab,
    showTutorialsTab,
  } = useLocationModalData('marker', marker, { tasks, tutorials, student, isTeacher, isNew });
  // Groupes proposables dans les réglages d'audience (migration 262) : seulement pour un
  // compte qui édite — inutile de charger la liste pour un élève qui consulte une fiche.
  const audienceGroupOptions = useAudienceGroupOptions(isTeacher);
  const [tab, setTab] = useLocationModalTab(focusComments && !isNew ? 'info' : 'tasks', {
    showTasksTab,
    showTutorialsTab,
    disabled: isNew,
  });
  const assignment = useLocationTaskAssignment({
    studentAssignableTasks,
    onAssignTasks,
    setToast,
  });
  const linkActions = useLocationLinkActions({
    onLinkTask,
    onUnlinkTask,
    onLinkTutorial,
    onUnlinkTutorial,
    setToast,
    taskLinkedMessage: 'Tâche liée au repère ✓',
    tutorialLinkedMessage: 'Tutoriel lié au repère ✓',
  });

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
    } catch (_) {
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
    } catch (_) {
      setToast('Erreur');
    }
    setSaving(false);
  };

  const TABS_EXISTING = buildLocationModalTabs({ showTasksTab, showTutorialsTab, isTeacher });

  if (isNew) {
    return (
      <LocationModalShell
        ariaLabel="Nouveau repère"
        onClose={onClose}
        dialogRef={dialogRef}
        toast={toast}
        onToastDone={() => setToast(null)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <h3 style={{ margin: 0 }}>Nouveau repère</h3>
        </div>
        {isTeacher ? (
          <>
            <MarkerCommonFormFields
              groupOptions={audienceGroupOptions}
              form={form}
              setForm={setForm}
              plants={plants}
              set={set}
              categoryCatalog={categoryCatalog}
            />
            <MarkerEmojiField
              id="marker-new-emoji-custom"
              form={form}
              setForm={setForm}
              markerEmojis={markerEmojis}
            />
            <LocationSaveButton
              saving={saving}
              onClick={saveNew}
              icon={<IconMarker size={15} />}
              label="Placer"
              style={{ marginTop: 8 }}
            />
          </>
        ) : (
          <p style={{ color: 'var(--ink-soft)', fontSize: 'var(--text-base)' }}>
            Création de repère réservée au professeur.
          </p>
        )}
      </LocationModalShell>
    );
  }

  return (
    <LocationModalShell
      ariaLabel={`Repère ${marker.label || ''}`}
      onClose={onClose}
      dialogRef={dialogRef}
      dialogStyle={{ paddingTop: 16 }}
      toast={toast}
      onToastDone={() => setToast(null)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 'var(--text-md)' }}>{marker.label}</h3>
          <div
            style={{
              marginTop: 3,
              fontSize: 'var(--text-xs)',
              color: 'var(--ink-soft)',
              fontWeight: 'var(--fw-semibold)',
            }}
          >
            Repère
          </div>
          {(marker.categories || []).length > 0 && (
            <div style={{ marginTop: 4 }}>
              <LocationCategoryBadges item={marker} />
            </div>
          )}
        </div>
        {isTeacher && (
          <LocationHeaderActions
            duplicating={duplicating}
            duplicateTitle="Créer une copie sur la même carte (position légèrement décalée)"
            onDuplicateClick={
              onDuplicate
                ? async () => {
                    setDuplicating(true);
                    try {
                      await onDuplicate(marker);
                    } catch (_) {
                      setToast('Duplication impossible');
                    }
                    setDuplicating(false);
                  }
                : null
            }
            deleteAriaLabel="Supprimer le repère"
            onDeleteClick={async () => {
              if (
                await confirm({
                  message: `Supprimer le repère « ${marker.label} » ?`,
                  danger: true,
                })
              ) {
                onDelete(marker.id);
                onClose();
              }
            }}
          />
        )}
      </div>

      <LocationModalTabBar tabs={TABS_EXISTING} activeTab={tab} onSelect={setTab} />

      <LocationTasksShortcut
        kind="marker"
        entityId={marker.id}
        onNavigate={onNavigateToTasksForLocation}
        onClose={onClose}
      />

      {tab === 'tasks' && (
        <LocationTasksTab
          kind="marker"
          isTeacher={isTeacher}
          linkedTasks={linkedTasks}
          assignableTasks={assignableTasks}
          student={student}
          canSelfAssignTasks={canSelfAssignTasks}
          canEnroll={canEnroll}
          links={linkActions}
          assignment={assignment}
        />
      )}
      {tab === 'tutorials' && isTeacher && (
        <LocationTutorialsTeacherTab
          kind="marker"
          linkedTutorialsDirect={linkedTutorialsDirect}
          tutorialsOnlyViaTasks={tutorialsOnlyViaTasks}
          assignableTutorials={assignableTutorials}
          links={linkActions}
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
            <LocationTextBox>
              <MarkdownContent>{marker.note}</MarkdownContent>
            </LocationTextBox>
          )}
          <LocationNotesBlock notes={marker.notes} />
          <LocationLinksBlock links={marker.links} />
          {showVisitAsideBlock && (
            <LocationVisitAside
              entity={marker}
              locationKind="marker"
              plants={plants}
              livingNames={markerLivingNamesOrdered}
              livingBeingsOnlyOnTasks={livingBeingsOnlyOnTasks}
              visitAsideSpecies={visitAsideSpecies}
              visitAsideTutorials={visitAsideTutorials}
              shortDescription={visitAsideShortDesc}
              tutorials={isTeacher ? linkedTutorialsAll : linkedTutorialsVisible}
              onOpenTutorialPreview={onOpenTutorialPreview}
              onOpenPlantCatalogPreview={onOpenPlantCatalogPreview}
            />
          )}
          {orderedLivingBeingsForForm(marker.living_beings_list || marker.living_beings).length ===
            0 &&
            livingBeingsOnlyOnTasks.length === 0 &&
            !marker.note &&
            !marker.links?.length &&
            !marker.notes?.length &&
            !showVisitAsideBlock && (
              <LocationEmptyInfo>Aucune information pour l’instant.</LocationEmptyInfo>
            )}
          <LocationCommentsSection
            enabled={contextCommentsEnabled}
            commentsRef={commentsRef}
            kind="marker"
            entityId={marker.id}
            focusComments={focusComments}
            canParticipateContextComments={canParticipateContextComments}
          />
        </div>
      )}
      {tab === 'photos' && (
        <div className="fade-in">
          <PhotoGallery markerId={marker.id} isTeacher={isTeacher} />
        </div>
      )}
      {tab === 'edit' && isTeacher && (
        <div className="fade-in">
          <MarkerCommonFormFields
            groupOptions={audienceGroupOptions}
            form={form}
            setForm={setForm}
            plants={plants}
            set={set}
            categoryCatalog={categoryCatalog}
          />
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
          <LocationSaveButton
            saving={saving}
            onClick={saveEdit}
            icon={<IconSave size={15} />}
            label="Sauvegarder"
          />
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
              <IconMarker size={14} /> Ajuster la position sur la carte
            </button>
          )}
        </div>
      )}
    </LocationModalShell>
  );
}

export { MarkerModal };
