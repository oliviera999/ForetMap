import { useState, useEffect } from 'react';
import {
  SurfaceVisibilityField,
  normalizeSurfaceList,
} from '../../shared/ui/SurfaceVisibilityField.jsx';
import {
  LocationAudienceFields,
  normalizeAudienceGroupList,
  normalizeAudienceRoleList,
} from '../../shared/ui/LocationAudienceFields.jsx';
import { api } from '../../services/api';
import {
  MARKER_EMOJIS,
  ZONE_NAME_PREFIX_EMOJI_MAX_CHARS,
  stripLeadingMarkerEmoji,
} from '../../constants/emojis';
import { ZONE_COLORS } from '../../constants/garden';
import { ColorPaletteField } from '../ColorPaletteField.jsx';
import { useDialogA11y } from '../../shared/platform/useDialogA11y';
import { useOverlayHistoryBack } from '../../shared/platform/useOverlayHistoryBack';
import {
  nextLivingBeingsFromMultiSelect,
  orderedLivingBeingsForForm,
} from '../../utils/livingBeings';
import {
  buildZoneName,
  buildZonePayload,
  isZoneVisitBodyReadyForSave,
  mergeZoneListIntoDetail,
} from '../../utils/zoneModalForm.js';
import { isInfrastructureLocation, locationCategoryIds } from '../../utils/locationCategories.js';
import { zoneEmojiOf } from '../../utils/zoneDisplay.js';
import { MarkdownContent } from '../MarkdownContent.jsx';
import { MarkdownTextarea } from '../MarkdownTextarea.jsx';
import {
  LocationLinksFields,
  normalizeLocationLinksForForm,
} from '../../shared/ui/LocationLinksFields.jsx';
import {
  LocationNotesFields,
  normalizeLocationNotesForForm,
} from '../../shared/ui/LocationNotesFields.jsx';
import { LocationLinksBlock } from './LocationLinksBlock.jsx';
import { LocationNotesBlock } from './LocationNotesBlock.jsx';
import { useAudienceGroupOptions } from '../../hooks/useAudienceGroupOptions.js';
import { LivingBeingsCatalogPanel } from './LivingBeingsCatalogPanel.jsx';
import { MarkerVisitImageBuilder } from './MarkerFormSections.jsx';
import { PhotoGallery } from './PhotoGallery.jsx';
import { ZoneInfoModalHeader } from './ZoneInfoModalHeader.jsx';
import { LocationModalTabBar } from './LocationModalTabBar.jsx';
import { ZoneOrMarkerEmojiField } from './ZoneOrMarkerEmojiField.jsx';
import { LocationCategoryPicker } from './LocationCategoryPicker.jsx';
import { ZoneTutorialsStudentPanel } from './ZoneTutorialsPanel.jsx';
import { LocationVisitAside, useScrollIntoViewOnMount } from './mapModalShared.jsx';
import { useLocationModalData } from './useLocationModalData.js';
import { useVisitMediaBlocks } from './useVisitMediaBlocks.js';
import {
  LocationCommentsSection,
  LocationEmptyInfo,
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
import { IconDrawZone, IconSave } from '../../shared/icons.jsx';

function ZoneInfoModal({
  zone,
  plants,
  categoryCatalog = [],
  tasks,
  tutorials = [],
  isTeacher,
  student,
  canSelfAssignTasks = true,
  canEnrollOnTasks,
  markerEmojis = MARKER_EMOJIS,
  emojiParsingList = MARKER_EMOJIS,
  contextCommentsEnabled = true,
  canParticipateContextComments = true,
  onClose,
  onUpdate,
  onDelete,
  onDuplicate,
  onEditPoints,
  onLinkTask,
  onUnlinkTask,
  onAssignTasks,
  onLinkTutorial,
  onUnlinkTutorial,
  onNavigateToTasksForLocation = null,
  onOpenTutorialPreview = null,
  onOpenPlantCatalogPreview = null,
  focusComments = false,
}) {
  const canEnroll = canEnrollOnTasks !== undefined ? canEnrollOnTasks : canSelfAssignTasks;
  const dialogRef = useDialogA11y(onClose);
  useOverlayHistoryBack(true, onClose);

  // Liste zones allégée : corps visite / historique complet via GET /api/zones/:id.
  const [zoneDetail, setZoneDetail] = useState(zone);
  useEffect(() => {
    setZoneDetail((prev) => mergeZoneListIntoDetail(prev, zone));
    const needsDetail =
      (!!zone.has_visit_body && (zone.visit_body_json == null || zone.visit_body_json === '')) ||
      !!zone.history_truncated;
    if (!needsDetail || !zone?.id) return undefined;
    let cancelled = false;
    api(`/api/zones/${encodeURIComponent(zone.id)}`)
      .then((detail) => {
        if (!cancelled && detail && typeof detail === 'object') setZoneDetail(detail);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [zone]);

  const commentsRef = useScrollIntoViewOnMount(focusComments);
  const [zoneName, setZoneName] = useState(
    stripLeadingMarkerEmoji(zone.name || '', emojiParsingList),
  );
  // Colonne `zones.emoji` (audit C4) en priorité — le reset d'effet doit la suivre,
  // sinon un emoji hors préfixe de nom retombe sur markerEmojis[0] (🌱).
  const [zoneEmoji, setZoneEmoji] = useState(
    () => zoneEmojiOf(zone, emojiParsingList) || markerEmojis[0] || '📍',
  );
  const [livingBeings, setLivingBeings] = useState(() =>
    orderedLivingBeingsForForm(zone.living_beings_list || zone.living_beings, zone.current_plant),
  );
  const [categoryIds, setCategoryIds] = useState(() => locationCategoryIds(zone));
  // Clé stable des catégories de la zone : l'effet de resynchronisation ci-dessous ne doit
  // pas se rejouer à chaque polling (le tableau `category_ids` change d'identité à chaque
  // réponse) et écraser une sélection en cours d'édition.
  const zoneCategoryIdsKey = locationCategoryIds(zone).join('|');
  const [zoneColor, setZoneColor] = useState(zone.color || ZONE_COLORS[0]);
  const [desc, setDesc] = useState(zone.description || '');
  const [visitSubtitle, setVisitSubtitle] = useState(zone.visit_subtitle || '');
  const [visitShortDesc, setVisitShortDesc] = useState(zone.visit_short_description || '');
  const [visitDetailsTitle, setVisitDetailsTitle] = useState(zone.visit_details_title || 'Détails');
  const [visitDetailsText, setVisitDetailsText] = useState(zone.visit_details_text || '');
  const [hiddenSurfaces, setHiddenSurfaces] = useState(() =>
    normalizeSurfaceList(zone.hidden_surfaces),
  );
  const [searchAliases, setSearchAliases] = useState(zone.search_aliases || '');
  const [visibleRoleSlugs, setVisibleRoleSlugs] = useState(() =>
    normalizeAudienceRoleList(zone.visible_role_slugs),
  );
  const [links, setLinks] = useState(() => normalizeLocationLinksForForm(zone.links));
  const [notes, setNotes] = useState(() => normalizeLocationNotesForForm(zone.notes));
  const [visibleGroupIds, setVisibleGroupIds] = useState(() =>
    normalizeAudienceGroupList(zone.visible_group_ids),
  );
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [toast, setToast] = useState(null);
  const {
    visitEditorialBlocks,
    visitMediaOptions,
    photoOptions: zonePhotoOptions,
    imageBlocks,
    addImageBlock,
    updateImageBlock,
    removeImageBlock,
    attachPhotoToVisit: attachZonePhotoToVisit,
  } = useVisitMediaBlocks({
    targetType: 'zone',
    targetId: zone.id,
    mapId: zone.map_id,
    visitBodyJson: zoneDetail.visit_body_json ?? zone.visit_body_json,
    onToast: setToast,
  });

  const zoneLivingNames = orderedLivingBeingsForForm(
    zone.living_beings_list || zone.living_beings,
    zone.current_plant,
  );
  const zoneTitleDisplay = isInfrastructureLocation(zone)
    ? zone.name || ''
    : stripLeadingMarkerEmoji(zone.name || '', emojiParsingList) || zone.name || '';
  // Dérivations tâches / tutoriels / biodiversité / bloc visite mutualisées avec
  // MarkerModal — `linkedTasks` / `studentAssignableTasks` y restent mémoïsés
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
    livingBeingsOnlyOnTasks,
    visitAsideTutorials,
    visitAsideSpecies,
    visitAsideShortDesc,
    showVisitAsideBlock,
    showTasksTab,
    showTutorialsTab,
  } = useLocationModalData('zone', zone, { tasks, tutorials, student, isTeacher });
  // Groupes proposables dans les réglages d'audience (migration 262) : chargés seulement
  // pour un compte qui édite.
  const audienceGroupOptions = useAudienceGroupOptions(isTeacher);
  const [tab, setTab] = useLocationModalTab(focusComments ? 'info' : 'tasks', {
    showTasksTab,
    showTutorialsTab,
    disabled: false,
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
    taskLinkedMessage: 'Tâche liée à la zone ✓',
    tutorialLinkedMessage: 'Tutoriel lié à la zone ✓',
  });

  useEffect(() => {
    setZoneName(stripLeadingMarkerEmoji(zone.name || '', emojiParsingList));
    setZoneEmoji(zoneEmojiOf(zone, emojiParsingList) || markerEmojis[0] || '📍');
    setLivingBeings(
      orderedLivingBeingsForForm(zone.living_beings_list || zone.living_beings, zone.current_plant),
    );
    setCategoryIds(zoneCategoryIdsKey ? zoneCategoryIdsKey.split('|') : []);
    setZoneColor(zone.color || ZONE_COLORS[0]);
    setDesc(zone.description || '');
    setVisitSubtitle(zone.visit_subtitle || '');
    setVisitShortDesc(zone.visit_short_description || '');
    setVisitDetailsTitle(zone.visit_details_title || 'Détails');
    setVisitDetailsText(zone.visit_details_text || '');
    setHiddenSurfaces(normalizeSurfaceList(zone.hidden_surfaces));
    setSearchAliases(zone.search_aliases || '');
    setVisibleRoleSlugs(normalizeAudienceRoleList(zone.visible_role_slugs));
    setLinks(normalizeLocationLinksForForm(zone.links));
    setNotes(normalizeLocationNotesForForm(zone.notes));
    setVisibleGroupIds(normalizeAudienceGroupList(zone.visible_group_ids));
  }, [
    zone.id,
    zone.name,
    zone.emoji,
    zone.living_beings,
    zone.living_beings_list,
    zone.current_plant,
    zoneCategoryIdsKey,
    zone.color,
    zone.description,
    zone.visit_subtitle,
    zone.visit_short_description,
    zone.visit_details_title,
    zone.visit_details_text,
    zone.visit_body_json,
    zone.hidden_surfaces,
    zone.search_aliases,
    zone.visible_role_slugs,
    zone.links,
    zone.notes,
    zone.visible_group_ids,
    emojiParsingList,
    markerEmojis,
  ]);

  const save = async () => {
    const name = buildZoneName(zoneName, zoneEmoji, { markerEmojis, emojiParsingList });
    if (!name) {
      setToast('Nom requis');
      return;
    }
    setSaving(true);
    try {
      await onUpdate(
        zone.id,
        buildZonePayload(
          name,
          {
            zoneEmoji,
            livingBeings,
            categoryIds,
            zoneColor,
            desc,
            visitSubtitle,
            visitShortDesc,
            visitDetailsTitle,
            visitDetailsText,
            hiddenSurfaces,
            searchAliases,
            visibleRoleSlugs,
            visibleGroupIds,
            links,
            notes,
          },
          visitEditorialBlocks,
          {
            omitVisitEditorialBlocks: !isZoneVisitBodyReadyForSave(zone, zoneDetail),
          },
        ),
      );
      setToast('Sauvegardé ✓');
      setTab('info');
    } catch (_) {
      setToast('Erreur');
    }
    setSaving(false);
  };

  const TABS = buildLocationModalTabs({ showTasksTab, showTutorialsTab, isTeacher });

  return (
    <LocationModalShell
      ariaLabel={`Zone ${zoneTitleDisplay}`}
      onClose={onClose}
      dialogRef={dialogRef}
      dialogStyle={{ paddingTop: 16 }}
      toast={toast}
      onToastDone={() => setToast(null)}
    >
      <ZoneInfoModalHeader
        zone={zone}
        isTeacher={isTeacher}
        duplicating={duplicating}
        onDuplicate={
          onDuplicate
            ? async (z) => {
                setDuplicating(true);
                try {
                  await onDuplicate(z);
                } finally {
                  setDuplicating(false);
                }
              }
            : null
        }
        onDuplicateError={() => setToast('Duplication impossible')}
        onDelete={onDelete}
        onClose={onClose}
      />

      <LocationModalTabBar tabs={TABS} activeTab={tab} onSelect={setTab} />

      <LocationTasksShortcut
        kind="zone"
        entityId={zone.id}
        onNavigate={onNavigateToTasksForLocation}
        onClose={onClose}
      />

      {tab === 'info' && (
        <div className="fade-in">
          {zone.description && (
            <LocationTextBox>
              <MarkdownContent>{zone.description}</MarkdownContent>
            </LocationTextBox>
          )}
          <LocationNotesBlock notes={zone.notes} />
          <LocationLinksBlock links={zone.links} />
          {showVisitAsideBlock && (
            <LocationVisitAside
              entity={zone}
              locationKind="zone"
              plants={plants}
              livingNames={zoneLivingNames}
              livingBeingsOnlyOnTasks={livingBeingsOnlyOnTasks}
              visitAsideSpecies={visitAsideSpecies}
              visitAsideTutorials={visitAsideTutorials}
              shortDescription={visitAsideShortDesc}
              tutorials={isTeacher ? linkedTutorialsAll : linkedTutorialsVisible}
              onOpenTutorialPreview={onOpenTutorialPreview}
              onOpenPlantCatalogPreview={onOpenPlantCatalogPreview}
            />
          )}
          {(zoneDetail.history || zone.history)?.length > 0 && (
            <div className="history-list">
              <h4>Historique cultures</h4>
              {(zoneDetail.history || zone.history).map((h, i) => (
                <div
                  key={`${h?.harvested_at ?? ''}-${h?.plant ?? ''}-${i}`}
                  className="history-item"
                >
                  <span>{h.plant}</span>
                  <span style={{ color: '#aaa', fontSize: 'var(--text-xs)' }}>
                    {h.harvested_at}
                  </span>
                </div>
              ))}
            </div>
          )}
          {!isInfrastructureLocation(zone) &&
            orderedLivingBeingsForForm(
              zone.living_beings_list || zone.living_beings,
              zone.current_plant,
            ).length === 0 &&
            livingBeingsOnlyOnTasks.length === 0 &&
            !zone.description &&
            !zone.notes?.length &&
            !zone.links?.length &&
            !(zoneDetail.history || zone.history)?.length &&
            !showVisitAsideBlock && (
              <LocationEmptyInfo>Zone vide — aucune information pour l'instant.</LocationEmptyInfo>
            )}
          <LocationCommentsSection
            enabled={contextCommentsEnabled}
            commentsRef={commentsRef}
            kind="zone"
            entityId={zone.id}
            focusComments={focusComments}
            canParticipateContextComments={canParticipateContextComments}
          />
        </div>
      )}

      {tab === 'photos' && (
        <div className="fade-in">
          <PhotoGallery zoneId={zone.id} isTeacher={isTeacher} />
        </div>
      )}

      {tab === 'edit' && isTeacher && (
        <div className="fade-in">
          <div className="field">
            <label>Nom de la zone *</label>
            <input
              value={zoneName}
              onChange={(e) => setZoneName(e.target.value)}
              placeholder="Ex: Potager Est"
            />
          </div>
          <div className="field">
            <label>Êtres vivants</label>
            <p
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--ink-soft)',
                margin: '0 0 8px',
                lineHeight: 'var(--lh-normal)',
              }}
            >
              Maintenez Ctrl (Windows) ou Cmd (Mac) pour en choisir plusieurs. L’ordre de la liste
              est conservé pour l’affichage. Retirer un être vivant de la liste peut l’enregistrer
              dans l’historique des cultures.
            </p>
            <select
              multiple
              size={Math.min(10, Math.max(4, plants.length + 1))}
              value={livingBeings}
              onChange={(e) => {
                const picked = Array.from(e.target.selectedOptions).map((opt) => opt.value);
                setLivingBeings(nextLivingBeingsFromMultiSelect(livingBeings, picked, plants));
              }}
            >
              {plants.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.emoji} {p.name}
                </option>
              ))}
            </select>
          </div>
          {livingBeings.length > 0 && (
            <LivingBeingsCatalogPanel plants={plants} names={livingBeings} showHeading={false} />
          )}
          <LocationCategoryPicker
            kind="zone"
            catalog={categoryCatalog}
            value={categoryIds}
            onChange={setCategoryIds}
          />
          <div className="field">
            <label>Description</label>
            <MarkdownTextarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={3}
              placeholder="Observations, conseils, notes sur cette zone…"
            />
          </div>
          <ColorPaletteField id="zone-info-color" value={zoneColor} onChange={setZoneColor} />
          <p
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--ink-soft)',
              margin: '0 0 10px',
              lineHeight: 'var(--lh-normal)',
            }}
          >
            Textes ci-dessous : même contenu qu’en mode visite (sous-titre, accroche, bloc
            dépliable).
          </p>
          <div className="field">
            <label>Sous-titre (visite)</label>
            <input
              value={visitSubtitle}
              onChange={(e) => setVisitSubtitle(e.target.value)}
              placeholder="Optionnel"
            />
          </div>
          <div className="field">
            <label>Description courte (visite)</label>
            <MarkdownTextarea
              value={visitShortDesc}
              onChange={(e) => setVisitShortDesc(e.target.value)}
              rows={2}
              placeholder="Texte d’accroche sous le titre"
            />
          </div>
          <div className="field">
            <label>Titre du bloc dépliable (visite)</label>
            <input
              value={visitDetailsTitle}
              onChange={(e) => setVisitDetailsTitle(e.target.value)}
              placeholder="Détails"
            />
          </div>
          <div className="field">
            <label>Détails dépliables (visite)</label>
            <MarkdownTextarea
              value={visitDetailsText}
              onChange={(e) => setVisitDetailsText(e.target.value)}
              rows={4}
              placeholder="Contenu du panneau repliable"
            />
          </div>
          <div className="field">
            <label htmlFor="zone-search-aliases">Alias de recherche</label>
            <input
              id="zone-search-aliases"
              value={searchAliases}
              onChange={(e) => setSearchAliases(e.target.value)}
              placeholder="Autres noms, séparés par ; (ex. G12 ; salle info)"
            />
          </div>
          <SurfaceVisibilityField
            mode="hidden"
            idPrefix="zone"
            value={hiddenSurfaces}
            onChange={setHiddenSurfaces}
          />
          <LocationAudienceFields
            idPrefix="zone"
            NoteEditor={MarkdownTextarea}
            visibleRoleSlugs={visibleRoleSlugs}
            onVisibleRoleSlugsChange={setVisibleRoleSlugs}
            groupOptions={audienceGroupOptions}
            visibleGroupIds={visibleGroupIds}
            onVisibleGroupIdsChange={setVisibleGroupIds}
          />
          <LocationNotesFields
            idPrefix="zone"
            NoteEditor={MarkdownTextarea}
            groupOptions={audienceGroupOptions}
            notes={notes}
            onChange={setNotes}
          />
          <LocationLinksFields
            idPrefix="zone"
            groupOptions={audienceGroupOptions}
            links={links}
            onChange={setLinks}
          />
          <MarkerVisitImageBuilder
            imageBlocks={imageBlocks}
            visitMediaOptions={visitMediaOptions}
            markerPhotoOptions={zonePhotoOptions}
            onAddImageBlock={addImageBlock}
            onUpdateImageBlock={updateImageBlock}
            onRemoveImageBlock={removeImageBlock}
            onAssociatePhoto={attachZonePhotoToVisit}
            introText="Choisis des photos déjà associées à la zone, ou associe d’abord une photo de l’onglet Photos."
            photoImportHeading="Photos liées à cette zone"
            pickerEmptyHint="Aucune photo visite — onglet Photos ou associe une photo zone ci-dessus."
          />
          <div className="field">
            <label htmlFor="zone-edit-emoji-custom">Emoji de zone</label>
            <ZoneOrMarkerEmojiField
              id="zone-edit-emoji-custom"
              value={zoneEmoji}
              onChange={setZoneEmoji}
              maxLen={ZONE_NAME_PREFIX_EMOJI_MAX_CHARS}
            />
            <div
              style={{
                display: 'flex',
                gap: 6,
                flexWrap: 'wrap',
                maxHeight: 180,
                overflowY: 'auto',
                paddingRight: 2,
                WebkitOverflowScrolling: 'touch',
                touchAction: 'pan-y',
              }}
            >
              {markerEmojis.map((emoji) => (
                <button
                  type="button"
                  key={emoji}
                  className={`emoji-btn ${zoneEmoji === emoji ? 'sel' : ''}`}
                  onClick={() => setZoneEmoji(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
          <LocationSaveButton
            saving={saving}
            onClick={save}
            icon={<IconSave size={15} />}
            label="Enregistrer"
          />
          {onEditPoints && (
            <button
              className="btn btn-ghost btn-full"
              style={{ marginTop: 8 }}
              onClick={() => {
                onEditPoints(zone);
                onClose();
              }}
            >
              <IconDrawZone size={14} /> Modifier le contour de la zone
            </button>
          )}
        </div>
      )}
      {tab === 'tasks' && (
        <LocationTasksTab
          kind="zone"
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
          kind="zone"
          linkedTutorialsDirect={linkedTutorialsDirect}
          tutorialsOnlyViaTasks={tutorialsOnlyViaTasks}
          assignableTutorials={assignableTutorials}
          links={linkActions}
        />
      )}
      {tab === 'tutorials' && !isTeacher && (
        <ZoneTutorialsStudentPanel
          tutorials={linkedTutorialsVisible}
          zoneId={zone.id}
          onOpenTutorialPreview={onOpenTutorialPreview}
        />
      )}
    </LocationModalShell>
  );
}

export { ZoneInfoModal };
