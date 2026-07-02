import React, { useState, useEffect, useMemo } from 'react';
import {
  MARKER_EMOJIS,
  ZONE_NAME_PREFIX_EMOJI_MAX_CHARS,
  detectLeadingMarkerEmoji,
  stripLeadingMarkerEmoji,
} from '../../constants/emojis';
import { ZONE_COLORS } from '../../constants/garden';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import { useOverlayHistoryBack } from '../../hooks/useOverlayHistoryBack';
import { api } from '../../services/api';
import { TimedToast } from '../../shared/components/TimedToast.jsx';
import {
  nextLivingBeingsFromMultiSelect,
  orderedLivingBeingsForForm,
} from '../../utils/livingBeings';
import {
  dedupeTutorialsById,
  isTaskDetachedFromLocation,
  livingBeingNamesFromTasksAtLocation,
  taskLocationIds,
  tutorialLocationIds,
  tutorialsFromTasksAtLocation,
} from '../../utils/mapLocationContext';
import { canStudentAssignTask } from '../../utils/taskEnrollment.js';
import { parseVisitEditorialBlocksFromJson } from '../../utils/visitEditorialBlocks.js';
import {
  buildZoneName,
  buildZonePayload,
  computeZoneVisitImageBlocks,
  zoneTaskMapId,
} from '../../utils/zoneModalForm.js';
import { DialogShell } from '../DialogShell';
import { MarkdownContent } from '../MarkdownContent.jsx';
import { MarkdownTextarea } from '../MarkdownTextarea.jsx';
import { ContextComments } from '../context-comments';
import {
  BiodiversitySpeciesOpenLinks,
  LivingBeingsCatalogPanel,
} from './LivingBeingsCatalogPanel.jsx';
import { MarkerVisitImageBuilder } from './MarkerFormSections.jsx';
import { PhotoGallery } from './PhotoGallery.jsx';
import { ZoneInfoModalHeader } from './ZoneInfoModalHeader.jsx';
import { ZoneInfoModalTabBar } from './ZoneInfoModalTabBar.jsx';
import { ZoneOrMarkerEmojiField } from './ZoneOrMarkerEmojiField.jsx';
import { ZoneTasksStudentPanel, ZoneTasksTeacherPanel } from './ZoneTasksPanel.jsx';
import { ZoneTutorialsStudentPanel, ZoneTutorialsTeacherPanel } from './ZoneTutorialsPanel.jsx';
import { LocationTutorialPreviewList, tutorialLinkedToSameMap } from './mapModalShared.jsx';

function ZoneInfoModal({
  zone,
  plants,
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
}) {
  const canEnroll = canEnrollOnTasks !== undefined ? canEnrollOnTasks : canSelfAssignTasks;
  const dialogRef = useDialogA11y(onClose);
  useOverlayHistoryBack(true, onClose);
  const [tab, setTab] = useState('tasks');
  const [zoneName, setZoneName] = useState(
    stripLeadingMarkerEmoji(zone.name || '', emojiParsingList),
  );
  const [zoneEmoji, setZoneEmoji] = useState(
    () => detectLeadingMarkerEmoji(zone.name || '', emojiParsingList) || markerEmojis[0] || '📍',
  );
  const [livingBeings, setLivingBeings] = useState(() =>
    orderedLivingBeingsForForm(zone.living_beings_list || zone.living_beings, zone.current_plant),
  );
  const [stage, setStage] = useState(zone.stage || 'empty');
  const [special, setSpecial] = useState(!!zone.special);
  const [zoneColor, setZoneColor] = useState(zone.color || ZONE_COLORS[0]);
  const [desc, setDesc] = useState(zone.description || '');
  const [visitSubtitle, setVisitSubtitle] = useState(zone.visit_subtitle || '');
  const [visitShortDesc, setVisitShortDesc] = useState(zone.visit_short_description || '');
  const [visitDetailsTitle, setVisitDetailsTitle] = useState(zone.visit_details_title || 'Détails');
  const [visitDetailsText, setVisitDetailsText] = useState(zone.visit_details_text || '');
  const [linkTaskId, setLinkTaskId] = useState('');
  const [linkTutorialId, setLinkTutorialId] = useState('');
  const [selectedTaskIds, setSelectedTaskIds] = useState([]);
  const [assigning, setAssigning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [toast, setToast] = useState(null);
  const [visitEditorialBlocks, setVisitEditorialBlocks] = useState(() =>
    parseVisitEditorialBlocksFromJson(zone.visit_body_json),
  );
  const [visitMediaOptions, setVisitMediaOptions] = useState([]);
  const [zonePhotoOptions, setZonePhotoOptions] = useState([]);

  const displayStage = zone.special ? 'special' : zone.stage;
  const zoneLivingNames = orderedLivingBeingsForForm(
    zone.living_beings_list || zone.living_beings,
    zone.current_plant,
  );
  const zoneTitleDisplay = zone.special
    ? zone.name || ''
    : stripLeadingMarkerEmoji(zone.name || '', emojiParsingList) || zone.name || '';
  // Mémoïsés : l'effet de nettoyage de la sélection dépend de studentAssignableTasks —
  // une nouvelle identité à chaque rendu provoquerait une boucle rendu/effet.
  const linkedTasks = useMemo(
    () =>
      (tasks || []).filter(
        (t) =>
          taskLocationIds(t).zoneIds.some((id) => String(id) === String(zone.id)) &&
          !isTaskDetachedFromLocation(t),
      ),
    [tasks, zone.id],
  );
  const studentAssignableTasks = useMemo(
    () => linkedTasks.filter((t) => canStudentAssignTask(t, student)),
    [linkedTasks, student],
  );
  const assignableTasks = (tasks || []).filter((t) => {
    if (linkedTasks.some((lt) => lt.id === t.id)) return false;
    if (isTaskDetachedFromLocation(t)) return false;
    const mapId = zoneTaskMapId(t);
    return mapId === zone.map_id || mapId == null;
  });
  const showTasksTab = isTeacher || (!!student && linkedTasks.length > 0);
  const linkedTutorialsDirect = (tutorials || []).filter((tu) =>
    tutorialLocationIds(tu).zoneIds.some((id) => String(id) === String(zone.id)),
  );
  const tutorialsFromTasksHere = tutorialsFromTasksAtLocation('zone', zone.id, tasks, tutorials);
  const linkedTutorialsAll = dedupeTutorialsById([
    ...linkedTutorialsDirect,
    ...tutorialsFromTasksHere,
  ]);
  const tutorialsOnlyViaTasks = tutorialsFromTasksHere.filter(
    (tu) => !linkedTutorialsDirect.some((d) => String(d.id) === String(tu.id)),
  );
  const linkedTutorialsVisible = isTeacher
    ? linkedTutorialsAll
    : linkedTutorialsAll.filter((tu) => tu.is_active !== false);
  const showTutorialsTab = isTeacher || linkedTutorialsVisible.length > 0;
  const livingBeingsFromTasksHere = livingBeingNamesFromTasksAtLocation('zone', zone.id, tasks);
  const livingBeingsOnlyOnTasks = livingBeingsFromTasksHere.filter(
    (n) => !zoneLivingNames.includes(n),
  );
  const visitAsideTutorials = (isTeacher ? linkedTutorialsAll : linkedTutorialsVisible).length > 0;
  const visitAsideSpecies =
    !zone.special && (zoneLivingNames.length > 0 || livingBeingsOnlyOnTasks.length > 0);
  const showVisitAsideBlock = !!(
    zone.visit_subtitle ||
    zone.visit_short_description ||
    zone.visit_details_text ||
    visitAsideSpecies ||
    visitAsideTutorials
  );
  const assignableTutorials = (tutorials || []).filter(
    (tu) =>
      tu.is_active !== false &&
      !tutorialLocationIds(tu).zoneIds.some((id) => String(id) === String(zone.id)) &&
      tutorialLinkedToSameMap(tu, zone.map_id),
  );

  useEffect(() => {
    if (!showTasksTab && tab === 'tasks') {
      setTab('info');
    }
  }, [showTasksTab, tab]);

  useEffect(() => {
    if (!showTutorialsTab && tab === 'tutorials') {
      setTab('info');
    }
  }, [showTutorialsTab, tab]);

  useEffect(() => {
    setZoneName(stripLeadingMarkerEmoji(zone.name || '', emojiParsingList));
    setZoneEmoji(
      detectLeadingMarkerEmoji(zone.name || '', emojiParsingList) || markerEmojis[0] || '📍',
    );
    setLivingBeings(
      orderedLivingBeingsForForm(zone.living_beings_list || zone.living_beings, zone.current_plant),
    );
    setStage(zone.stage || 'empty');
    setSpecial(!!zone.special);
    setZoneColor(zone.color || ZONE_COLORS[0]);
    setDesc(zone.description || '');
    setVisitSubtitle(zone.visit_subtitle || '');
    setVisitShortDesc(zone.visit_short_description || '');
    setVisitDetailsTitle(zone.visit_details_title || 'Détails');
    setVisitDetailsText(zone.visit_details_text || '');
  }, [
    zone.id,
    zone.name,
    zone.living_beings,
    zone.living_beings_list,
    zone.current_plant,
    zone.stage,
    zone.special,
    zone.color,
    zone.description,
    zone.visit_subtitle,
    zone.visit_short_description,
    zone.visit_details_title,
    zone.visit_details_text,
    zone.visit_body_json,
    emojiParsingList,
    markerEmojis,
  ]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const [photos, content] = await Promise.all([
          api(`/api/zones/${zone.id}/photos`),
          api(`/api/visit/content?map_id=${encodeURIComponent(zone.map_id || '')}`),
        ]);
        if (cancel) return;
        const zoneVisit = (content?.zones || []).find((z) => String(z.id) === String(zone.id));
        const vm = [...(zoneVisit?.visit_media || [])].sort(
          (a, b) =>
            (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) ||
            Number(a.id) - Number(b.id),
        );
        setVisitMediaOptions(vm);
        setZonePhotoOptions(Array.isArray(photos) ? photos : []);
      } catch (_) {
        if (!cancel) {
          setVisitMediaOptions([]);
          setZonePhotoOptions([]);
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, [zone.id, zone.map_id]);

  useEffect(() => {
    setVisitEditorialBlocks(computeZoneVisitImageBlocks(zone.visit_body_json, visitMediaOptions));
  }, [zone.visit_body_json, zone.id, visitMediaOptions]);

  useEffect(() => {
    // Garde la référence quand rien ne change : un nouveau tableau systématique
    // relancerait un rendu à chaque passage (boucle « Maximum update depth exceeded »).
    setSelectedTaskIds((prev) => {
      const next = prev.filter((id) => studentAssignableTasks.some((t) => t.id === id));
      return next.length === prev.length ? prev : next;
    });
  }, [studentAssignableTasks]);

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
            livingBeings,
            stage,
            special,
            zoneColor,
            desc,
            visitSubtitle,
            visitShortDesc,
            visitDetailsTitle,
            visitDetailsText,
          },
          visitEditorialBlocks,
        ),
      );
      setToast('Sauvegardé ✓');
      setTab('info');
    } catch (e) {
      setToast('Erreur');
    }
    setSaving(false);
  };

  const imageBlocks = useMemo(
    () => visitEditorialBlocks.filter((b) => b.type === 'image'),
    [visitEditorialBlocks],
  );
  const addImageBlock = () => {
    const id = `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setVisitEditorialBlocks((prev) => [
      ...prev,
      {
        id,
        type: 'image',
        media_ids: [],
        layout: 'single',
        size: 'md',
        align: 'center',
        caption: '',
      },
    ]);
  };
  const updateImageBlock = (id, patch) => {
    setVisitEditorialBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  };
  const removeImageBlock = (id) => {
    setVisitEditorialBlocks((prev) => prev.filter((b) => b.id !== id));
  };
  const attachZonePhotoToVisit = async (photo) => {
    if (!photo?.image_url) return;
    try {
      await api('/api/visit/media', 'POST', {
        target_type: 'zone',
        target_id: zone.id,
        image_url: String(photo.image_url || '').trim(),
        caption: String(photo.caption || '').trim(),
      });
      const content = await api(
        `/api/visit/content?map_id=${encodeURIComponent(zone.map_id || '')}`,
      );
      const zoneVisit = (content?.zones || []).find((z) => String(z.id) === String(zone.id));
      const vm = [...(zoneVisit?.visit_media || [])].sort(
        (a, b) =>
          (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0) || Number(a.id) - Number(b.id),
      );
      setVisitMediaOptions(vm);
      setToast('Photo associée à la visite ✓');
    } catch (e) {
      setToast(e?.message || 'Erreur association photo');
    }
  };

  const TABS = [
    ...(showTasksTab ? [{ id: 'tasks', label: '✅ Tâches' }] : []),
    ...(showTutorialsTab ? [{ id: 'tutorials', label: '📘 Tutoriels' }] : []),
    { id: 'info', label: 'ℹ️ Info' },
    { id: 'photos', label: '📷 Photos' },
    ...(isTeacher ? [{ id: 'edit', label: '✏️ Modifier' }] : []),
  ];

  return (
    <DialogShell
      open
      onClose={onClose}
      overlayClassName="modal-overlay"
      dialogClassName="log-modal fade-in"
      dialogStyle={{ paddingTop: 16 }}
      ariaLabel={`Zone ${zoneTitleDisplay}`}
      closeOnOverlay
      dialogRef={dialogRef}
    >
      {toast && <TimedToast msg={toast} onDone={() => setToast(null)} />}
      <button className="modal-close" onClick={onClose}>
        ✕
      </button>

      <ZoneInfoModalHeader
        zone={zone}
        displayStage={displayStage}
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

      <ZoneInfoModalTabBar tabs={TABS} activeTab={tab} onSelect={setTab} />

      {onNavigateToTasksForLocation && (
        <div style={{ marginBottom: 12 }}>
          <button
            type="button"
            className="btn btn-secondary btn-full"
            onClick={() => {
              onNavigateToTasksForLocation({ kind: 'zone', id: String(zone.id) });
              onClose();
            }}
          >
            ✅ Ouvrir l’onglet Tâches filtré sur cette zone
          </button>
          <p style={{ fontSize: '.74rem', color: '#64748b', margin: '6px 0 0', lineHeight: 1.4 }}>
            Affiche les tâches et tutoriels rattachés à ce lieu dans la liste des tâches.
          </p>
        </div>
      )}

      {tab === 'info' && (
        <div className="fade-in">
          {zone.description && (
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
              <MarkdownContent>{zone.description}</MarkdownContent>
            </div>
          )}
          {showVisitAsideBlock && (
            <div style={{ marginBottom: 12 }}>
              {zone.visit_subtitle && (
                <p className="visit-subtitle" style={{ margin: '0 0 8px' }}>
                  {zone.visit_subtitle}
                </p>
              )}
              {zone.visit_short_description && (
                <MarkdownContent style={{ margin: '0 0 8px', fontSize: '.88rem', color: '#333' }}>
                  {zone.visit_short_description}
                </MarkdownContent>
              )}
              {zone.visit_details_text && (
                <details className="visit-details" style={{ marginTop: 8 }}>
                  <summary>{zone.visit_details_title || 'Détails'}</summary>
                  <MarkdownContent style={{ margin: '8px 0 0', fontSize: '.86rem' }}>
                    {zone.visit_details_text}
                  </MarkdownContent>
                </details>
              )}
              {visitAsideSpecies && (
                <details className="visit-details" style={{ marginTop: 8 }}>
                  <summary>Biodiversité</summary>
                  <div style={{ marginTop: 8 }}>
                    {zoneLivingNames.length > 0 && (
                      <div style={{ marginBottom: livingBeingsOnlyOnTasks.length ? 14 : 0 }}>
                        {zoneLivingNames.length > 1 || livingBeingsOnlyOnTasks.length > 0 ? (
                          <h4
                            style={{
                              margin: '0 0 8px',
                              fontSize: '.82rem',
                              color: 'var(--forest)',
                            }}
                          >
                            Sur cette zone
                          </h4>
                        ) : null}
                        {onOpenPlantCatalogPreview ? (
                          <BiodiversitySpeciesOpenLinks
                            plants={plants}
                            names={zoneLivingNames}
                            showHeading={false}
                            onOpenPlant={onOpenPlantCatalogPreview}
                          />
                        ) : (
                          <LivingBeingsCatalogPanel
                            plants={plants}
                            names={zoneLivingNames}
                            showHeading={false}
                          />
                        )}
                      </div>
                    )}
                    {livingBeingsOnlyOnTasks.length > 0 && (
                      <div>
                        <h4
                          style={{ margin: '0 0 8px', fontSize: '.82rem', color: 'var(--forest)' }}
                        >
                          Également dans les missions
                        </h4>
                        {onOpenPlantCatalogPreview ? (
                          <BiodiversitySpeciesOpenLinks
                            plants={plants}
                            names={livingBeingsOnlyOnTasks}
                            showHeading={false}
                            sectionTitle="Également dans les missions"
                            onOpenPlant={onOpenPlantCatalogPreview}
                          />
                        ) : (
                          <LivingBeingsCatalogPanel
                            plants={plants}
                            names={livingBeingsOnlyOnTasks}
                            showHeading={false}
                          />
                        )}
                      </div>
                    )}
                  </div>
                </details>
              )}
              {visitAsideTutorials && (
                <details className="visit-details" style={{ marginTop: 8 }}>
                  <summary>Tuto</summary>
                  <div style={{ marginTop: 8 }}>
                    <LocationTutorialPreviewList
                      tutorials={isTeacher ? linkedTutorialsAll : linkedTutorialsVisible}
                      locationKind="zone"
                      locationId={zone.id}
                      onOpenTutorialPreview={onOpenTutorialPreview}
                    />
                  </div>
                </details>
              )}
            </div>
          )}
          {zone.history?.length > 0 && (
            <div className="history-list">
              <h4>Historique cultures</h4>
              {zone.history.map((h, i) => (
                <div
                  key={`${h?.harvested_at ?? ''}-${h?.plant ?? ''}-${i}`}
                  className="history-item"
                >
                  <span>{h.plant}</span>
                  <span style={{ color: '#aaa', fontSize: '.76rem' }}>{h.harvested_at}</span>
                </div>
              ))}
            </div>
          )}
          {!zone.special &&
            orderedLivingBeingsForForm(
              zone.living_beings_list || zone.living_beings,
              zone.current_plant,
            ).length === 0 &&
            livingBeingsOnlyOnTasks.length === 0 &&
            !zone.description &&
            zone.history?.length === 0 &&
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
                Zone vide — aucune information pour l'instant.
              </p>
            )}
          {contextCommentsEnabled && (
            <ContextComments
              contextType="zone"
              contextId={zone.id}
              title="Commentaires de la zone"
              placeholder="Ajouter une observation sur cette zone..."
              canParticipateContextComments={canParticipateContextComments}
            />
          )}
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
              style={{ fontSize: '.76rem', color: '#64748b', margin: '0 0 8px', lineHeight: 1.45 }}
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
                const next = nextLivingBeingsFromMultiSelect(livingBeings, picked, plants);
                setLivingBeings(next);
                if (next.length === 0) setStage('empty');
                else if (stage === 'empty') setStage('growing');
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
          <div className="field">
            <label>État</label>
            <select value={stage} onChange={(e) => setStage(e.target.value)}>
              <option value="empty">Vide</option>
              <option value="growing">En croissance</option>
              <option value="ready">Prêt à récolter</option>
            </select>
          </div>
          <div className="field">
            <label
              style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
              title="Une zone spéciale représente un bâtiment ou une infrastructure (mare, ruches, compostage…) plutôt qu'une culture."
            >
              <input
                type="checkbox"
                checked={special}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setSpecial(checked);
                  // Évite un `stage` résiduel « special » (zones seedées) qui, une fois la
                  // case décochée, afficherait à tort la pastille « Zone spéciale ».
                  if (!checked && stage === 'special') setStage('empty');
                }}
                style={{ width: 18, height: 18 }}
              />
              Zone spéciale (bâtiment / infrastructure)
            </label>
          </div>
          <div className="field">
            <label>Description</label>
            <MarkdownTextarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              rows={3}
              placeholder="Observations, conseils, notes sur cette zone..."
            />
          </div>
          <div className="field">
            <label>Couleur</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {ZONE_COLORS.map((c) => (
                <div
                  key={c}
                  role="button"
                  tabIndex={0}
                  onClick={() => setZoneColor(c)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setZoneColor(c);
                    }
                  }}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    background: c,
                    cursor: 'pointer',
                    border: zoneColor === c ? '3px solid #1a4731' : '2px solid #ddd',
                    transition: 'transform .1s',
                    transform: zoneColor === c ? 'scale(1.15)' : 'none',
                  }}
                />
              ))}
            </div>
          </div>
          <p style={{ fontSize: '.78rem', color: '#64748b', margin: '0 0 10px', lineHeight: 1.45 }}>
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
          <button className="btn btn-primary btn-full" onClick={save} disabled={saving}>
            {saving ? '...' : '💾 Sauvegarder'}
          </button>
          {onEditPoints && (
            <button
              className="btn btn-ghost btn-full"
              style={{ marginTop: 8 }}
              onClick={() => {
                onEditPoints(zone);
                onClose();
              }}
            >
              🔷 Modifier le contour de la zone
            </button>
          )}
        </div>
      )}
      {tab === 'tasks' && isTeacher && (
        <ZoneTasksTeacherPanel
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
            setToast('Tâche liée à la zone ✓');
          }}
        />
      )}
      {tab === 'tasks' && !isTeacher && (
        <ZoneTasksStudentPanel
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
            setToast('Tutoriel lié à la zone ✓');
          }}
        />
      )}
      {tab === 'tutorials' && !isTeacher && (
        <ZoneTutorialsStudentPanel
          tutorials={linkedTutorialsVisible}
          zoneId={zone.id}
          onOpenTutorialPreview={onOpenTutorialPreview}
        />
      )}
    </DialogShell>
  );
}

export { ZoneInfoModal };
