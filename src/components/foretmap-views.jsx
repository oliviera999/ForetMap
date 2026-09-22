import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { api, AccountDeletedError } from '../services/api';
import { compressImage } from '../shared/platform/image';
import { useHelp } from '../hooks/useHelp';
import { Tooltip } from '../shared/components/Tooltip.jsx';
import { HelpPanel } from './HelpPanel';
import { resolveHelpPanelSection, resolveTooltipKey } from '../utils/helpResolve';
import {
  plantLinkedToMapMarker,
  plantLinkedToMapZone,
  plantPresentOnActiveMap,
  ZONE_PRESENCE_FILTER,
} from '../utils/plantFilters';
import { useBiodivCatalogPage } from '../hooks/useBiodivCatalogPage';
import { MarkdownTextarea } from './MarkdownTextarea.jsx';
import { ObservationCard } from './ObservationCard.jsx';
import { ObservationNotebookStatus } from './ObservationNotebookStatus.jsx';
import { ObservationPhotoField } from './ObservationPhotoField.jsx';
import { TimedToast } from '../shared/components/TimedToast.jsx';
import { useAppDialogs } from '../shared/components/AppDialogsProvider.jsx';
import { useDebouncedAutoSave } from '../shared/hooks/useDebouncedAutoSave.js';
import { usePublicSettings } from '../contexts/PublicSettingsContext.jsx';
import { useSession } from '../contexts/SessionContext.jsx';
import { useData } from '../contexts/DataContext.jsx';
import {
  EMPTY_PLANT_FORM,
  extractPlantForm,
  persistPlantMapSiteNotes,
} from '../utils/plantFormValues.js';
import { DialogShell } from './DialogShell';
import { PlantEditForm } from './biodiv/PlantEditForm.jsx';
import { PlantCatalogTile } from './biodiv/PlantCatalogTile.jsx';
import { PlantImportPanel } from './biodiv/PlantImportPanel.jsx';
import { PlantCatalogFilterPanel } from './biodiv/PlantCatalogFilterPanel.jsx';
import { PlantHazardReviewPanel } from './biodiv/PlantHazardReviewPanel.jsx';
import { PlantCatalogPreviewModal } from './biodiv/PlantCatalogPreview.jsx';
import {
  IconBiodiv,
  IconClose,
  IconDelete,
  IconEdit,
  IconLeaf,
  IconNotebook,
  IconSave,
} from '../shared/icons.jsx';

// ── INTERACTIVE MAP ──────────────────────────────────────────────────────────

// ── FILTRES CATALOGUE BIODIVERSITÉ (élève + prof) ─────────────────────────────
// ── PLANT MANAGER (teacher) ───────────────────────────────────────────────────
// Même principe que `PlantViewer` : la grille montre des vignettes, la fiche complète
// s'ouvre dans la modale d'aperçu montée par `App` (`onOpenPlant`). L'édition, elle,
// passe en modale plutôt qu'en place dans la grille — la fiche n'est plus rendue à deux
// endroits (cf. docs/AUDIT_CHARGE_BIODIVERSITE_2026-09.md, lot 1).
function PlantManager({
  onRefresh,
  onForceLogout = null,
  onOpenPlant = null,
  maps = [],
  onActiveMapChange = null,
  canValidateHazards = false,
}) {
  const { confirm } = useAppDialogs();
  const publicSettings = usePublicSettings();
  const { canParticipateContextComments = true } = useSession();
  const { plants = [], zones = [], markers = [], activeMapId = null } = useData();
  const contextCommentsEnabled = publicSettings?.modules?.context_comments_enabled !== false;
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_PLANT_FORM });
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const { isHelpEnabled, hasSeenSection, markSectionSeen, trackPanelOpen, trackPanelDismiss } =
    useHelp({ publicSettings, isTeacher: true });
  const tooltipText = (path) => resolveTooltipKey(path, publicSettings, true);
  const helpPlants = resolveHelpPanelSection('plants', publicSettings);

  const {
    filteredPlants,
    displayedPlants,
    filterPanelProps,
    plantObservationCounts,
    applyObservationAcknowledged,
    plantGatingSummaries,
    refreshPlantGating,
    hasMore,
    nextBatch,
    showMore,
  } = useBiodivCatalogPage({
    plants,
    zones,
    markers,
    activeMapId,
    defaultZonePresence: ZONE_PRESENCE_FILTER.IN_MAP,
    enableObservationChips: true,
  });

  const editPlant = useMemo(
    () => (editId ? plants.find((p) => p.id === editId) || null : null),
    [editId, plants],
  );

  const plantMapLinks = useMemo(() => {
    const links = new Map();
    for (const p of displayedPlants) {
      links.set(p.id, {
        zones: zones.filter((z) => plantLinkedToMapZone(p, z)),
        markers: markers.filter((m) => plantLinkedToMapMarker(p, m)),
      });
    }
    return links;
  }, [displayedPlants, zones, markers]);

  const startEdit = (p) => {
    setEditId(p.id);
    setForm(extractPlantForm(p));
    setShowAdd(false);
  };

  const cancelEdit = () => {
    setEditId(null);
    setShowAdd(false);
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      let savedId = editId;
      if (editId) await api(`/api/plants/${editId}`, 'PUT', form);
      else {
        const created = await api('/api/plants', 'POST', form);
        savedId = created?.id;
      }
      if (savedId) {
        await persistPlantMapSiteNotes(api, savedId, form.map_ids, form.map_site_notes);
      }
      await onRefresh();
      setEditId(null);
      setShowAdd(false);
      setForm({ ...EMPTY_PLANT_FORM });
      setToast(editId ? 'Entrée biodiversité modifiée ✓' : 'Entrée biodiversité ajoutée ✓');
    } catch (e) {
      setToast('Erreur : ' + e.message);
    }
    setSaving(false);
  };

  const autoSavePersist = useCallback(async () => {
    const sent = form;
    await api(`/api/plants/${editId}`, 'PUT', sent);
    await persistPlantMapSiteNotes(api, editId, sent.map_ids, sent.map_site_notes);
    await onRefresh();
    return sent;
  }, [editId, form, onRefresh]);

  const { status: autoSaveStatus, error: autoSaveError } = useDebouncedAutoSave({
    value: form,
    resetKey: editId ? `plant:${editId}` : 'none',
    enabled: Boolean(editId) && form.name.trim().length > 0,
    onSave: autoSavePersist,
  });

  const del = async (p) => {
    if (!(await confirm({ message: `Supprimer "${p.name}" ?`, danger: true }))) return;
    try {
      await api(`/api/plants/${p.id}`, 'DELETE');
      await onRefresh();
      setToast('Entrée biodiversité supprimée');
    } catch (e) {
      setToast('Erreur : ' + e.message);
    }
  };

  return (
    <div>
      {toast && <TimedToast msg={toast} onDone={() => setToast(null)} />}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 4,
        }}
      >
        <h2 className="section-title">
          <IconBiodiv size={20} /> Base biodiversité
        </h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isHelpEnabled && (
            <HelpPanel
              sectionId="plants"
              title={helpPlants.title}
              entries={helpPlants.items}
              isTeacher
              isPulsing={!hasSeenSection('plants')}
              onMarkSeen={markSectionSeen}
              onOpen={trackPanelOpen}
              onDismiss={trackPanelDismiss}
            />
          )}
          {!showAdd && !editId && (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                setShowAdd(true);
                setForm({ ...EMPTY_PLANT_FORM });
              }}
            >
              + Ajouter
            </button>
          )}
        </div>
      </div>
      <p className="section-sub">
        {displayedPlants.length} / {filteredPlants.length} affichés
        {filteredPlants.length !== plants.length ? ` (${plants.length} dans le catalogue)` : ''} —
        fouille la biodiversité !
      </p>

      <PlantCatalogFilterPanel
        plants={plants}
        maps={maps}
        activeMapId={activeMapId}
        onActiveMapChange={onActiveMapChange}
        showZonePresence
        {...filterPanelProps}
      />

      <PlantHazardReviewPanel
        canValidate={canValidateHazards}
        plants={plants}
        onRefresh={onRefresh}
        onOpenPlant={onOpenPlant}
        onToast={setToast}
      />

      <PlantImportPanel setToast={setToast} onRefresh={onRefresh} />

      {showAdd && (
        <PlantEditForm
          title="Nouvel être vivant"
          form={form}
          setForm={setForm}
          onSave={save}
          onCancel={cancelEdit}
          saving={saving}
          plantId={null}
          onToast={setToast}
          maps={maps}
          onEnsurePlantId={async () => {
            if (!form.name.trim()) {
              setToast("Indique un nom pour la fiche avant d'importer une photo.");
              return null;
            }
            setSaving(true);
            try {
              const plant = await api('/api/plants', 'POST', form);
              await onRefresh();
              setEditId(plant.id);
              setShowAdd(false);
              setForm(extractPlantForm(plant));
              return Number(plant.id);
            } catch (e) {
              setToast('Erreur : ' + (e.message || String(e)));
              return null;
            } finally {
              setSaving(false);
            }
          }}
        />
      )}

      <div className="biodiv-grid biodiv-grid--tiles">
        {displayedPlants.map((p) => {
          const { zones: pZones = [], markers: pMarkers = [] } = plantMapLinks.get(p.id) || {};
          return (
            <PlantCatalogTile
              key={p.id}
              plant={p}
              onOpen={onOpenPlant}
              hasMapLink={pZones.length > 0 || pMarkers.length > 0}
              myObservationCount={plantObservationCounts[String(p.id)]?.my_observation_count ?? 0}
              siteObservationCount={
                plantObservationCounts[String(p.id)]?.site_observation_count ?? 0
              }
              gatingSummary={plantGatingSummaries.get(String(p.id)) || null}
              onObservationAcknowledged={(id, next) => {
                applyObservationAcknowledged(id, next);
                refreshPlantGating();
              }}
              offerPlantCommentAfterObservation={
                contextCommentsEnabled && canParticipateContextComments
              }
              onForceLogout={onForceLogout}
              actions={
                <>
                  <Tooltip text={tooltipText('plants.edit')}>
                    <button
                      className="btn btn-ghost btn-sm"
                      aria-label={`Modifier la fiche de ${p.name}`}
                      onClick={() => startEdit(p)}
                    >
                      <IconEdit size={16} />
                    </button>
                  </Tooltip>
                  <Tooltip text={tooltipText('plants.delete')}>
                    <button
                      className="btn btn-danger btn-sm"
                      aria-label={`Supprimer la fiche de ${p.name}`}
                      onClick={() => del(p)}
                    >
                      <IconDelete size={16} />
                    </button>
                  </Tooltip>
                </>
              }
            />
          );
        })}
      </div>

      {hasMore ? (
        <div className="biodiv-show-more">
          <button
            type="button"
            className="btn btn-secondary biodiv-show-more__btn"
            onClick={showMore}
          >
            Voir {nextBatch} de plus
          </button>
        </div>
      ) : null}

      {editPlant && (
        <DialogShell
          open={!!editPlant}
          onClose={cancelEdit}
          overlayClassName="modal-overlay modal-overlay--tuto-preview"
          dialogClassName="log-modal tuto-preview-modal"
          ariaLabelledBy="plant-edit-modal-title"
        >
          <div className="tuto-preview-modal__head">
            <button
              type="button"
              className="modal-close"
              onClick={cancelEdit}
              aria-label="Fermer l’édition"
            >
              <IconClose size={16} />
            </button>
            <h3 id="plant-edit-modal-title">
              <IconEdit size={16} /> Modifier — {editPlant.name}
            </h3>
          </div>
          <div className="tuto-preview-modal__body tuto-preview-modal__body--biodiv-scroll">
            <PlantEditForm
              title={null}
              form={form}
              setForm={setForm}
              onSave={save}
              onCancel={cancelEdit}
              saving={saving}
              plantId={editPlant.id}
              onToast={setToast}
              maps={maps}
              autoSaveStatus={autoSaveStatus}
              autoSaveError={autoSaveError}
            />
          </div>
        </DialogShell>
      )}
    </div>
  );
}

function ObservationNotebook({ student, onForceLogout = null }) {
  const { zones = [] } = useData();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [content, setContent] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [imageData, setImageData] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const galleryFileRef = useRef(null);
  const cameraFileRef = useRef(null);
  // Numéro de requête courant : invalide les setState d'un chargement obsolète
  // (démontage ou changement d'élève), comme le flag `cancelled` de l'ancien effet.
  const loadSeqRef = useRef(0);

  const load = useCallback(
    async ({ withLoading = false } = {}) => {
      const seq = ++loadSeqRef.current;
      if (withLoading) setLoading(true);
      setLoadError('');
      try {
        const data = await api(
          `/api/observations/student/${student.id}?studentId=${encodeURIComponent(student.id)}`,
        );
        if (seq !== loadSeqRef.current) return;
        setEntries(data);
      } catch (e) {
        if (seq !== loadSeqRef.current) return;
        if (e instanceof AccountDeletedError) {
          onForceLogout?.();
          return;
        }
        console.error('[ForetMap] observations', e);
        setEntries([]);
        setLoadError(e?.message || 'Impossible de charger ton carnet.');
      } finally {
        if (withLoading && seq === loadSeqRef.current) setLoading(false);
      }
    },
    [student.id, onForceLogout],
  );

  useEffect(() => {
    load({ withLoading: true });
    return () => {
      loadSeqRef.current += 1;
    };
  }, [load]);

  useEffect(() => {
    const onRealtime = (e) => {
      if (e.detail && e.detail.domain === 'observations') load();
    };
    window.addEventListener('foretmap_realtime', onRealtime);
    return () => window.removeEventListener('foretmap_realtime', onRealtime);
  }, [load]);

  const handleFile = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    compressImage(file)
      .then((d) => {
        setImageData(d);
        setPreview(d);
      })
      .catch(() => {});
  };

  const submit = async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      await api('/api/observations', 'POST', {
        studentId: student.id,
        zone_id: zoneId || null,
        content: content.trim(),
        imageData,
      });
      setContent('');
      setZoneId('');
      setImageData(null);
      setPreview(null);
      setShowForm(false);
      setToast('Observation enregistrée ✓');
      await load();
    } catch (e) {
      if (e instanceof AccountDeletedError) {
        onForceLogout?.();
        return;
      }
      setToast('Erreur : ' + e.message);
    }
    setSaving(false);
  };

  const deleteObs = async (id) => {
    try {
      await api(`/api/observations/${id}`, 'DELETE', { studentId: student.id });
      setToast('Observation supprimée');
      await load();
    } catch (e) {
      if (e instanceof AccountDeletedError) {
        onForceLogout?.();
        return;
      }
      setToast('Erreur : ' + e.message);
    }
  };

  return (
    <div className="fade-in">
      {toast && <TimedToast msg={toast} onDone={() => setToast(null)} />}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 4,
        }}
      >
        <h2 className="section-title">
          <IconNotebook size={20} /> Mon carnet
        </h2>
        {!showForm && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>
            + Observation
          </button>
        )}
      </div>
      <p className="section-sub">Tes observations sur la forêt comestible</p>

      {showForm && (
        <div className="plant-edit-form fade-in" style={{ marginBottom: 16 }}>
          <h4>Nouvelle observation</h4>
          <div className="field">
            <label>Zone (optionnel)</label>
            <select value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
              <option value="">— Aucune zone —</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Observation *</label>
            <MarkdownTextarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              placeholder="Qu'as-tu observé ? Croissance, insectes, couleur des feuilles…"
              autoFocus
            />
          </div>
          <div className="field">
            <label>Photo (optionnel)</label>
            <ObservationPhotoField
              preview={preview}
              galleryFileRef={galleryFileRef}
              cameraFileRef={cameraFileRef}
              onFile={handleFile}
              onRemove={() => {
                setImageData(null);
                setPreview(null);
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={submit}
              disabled={saving || !content.trim()}
            >
              {saving ? (
                '…'
              ) : (
                <>
                  <IconSave size={14} /> Enregistrer
                </>
              )}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setShowForm(false);
                setContent('');
                setImageData(null);
                setPreview(null);
              }}
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {loading || loadError || entries.length === 0 ? (
        <ObservationNotebookStatus
          loading={loading}
          loadError={loadError}
          entryCount={entries.length}
          onRetry={() => load({ withLoading: true })}
        />
      ) : (
        entries.map((e) => <ObservationCard key={e.id} entry={e} onDelete={deleteObs} />)
      )}
    </div>
  );
}

// ── PLANT VIEWER (student read-only) ──────────────────────────────────────────
// La fiche complète n'est plus rendue ici : le clic sur une vignette ouvre la modale
// d'aperçu montée par `App` (`onOpenPlant`), qui reçoit elle-même `maps`, le glossaire
// et le réseau trophique. Ces trois props ne transitent donc plus par cette vue.
function PlantViewer({
  onForceLogout = null,
  onOpenPlant = null,
  maps = [],
  onActiveMapChange = null,
}) {
  const publicSettings = usePublicSettings();
  const { canParticipateContextComments = true } = useSession();
  const { plants = [], zones = [], markers = [], activeMapId = null } = useData();
  const contextCommentsEnabled = publicSettings?.modules?.context_comments_enabled !== false;
  const { isHelpEnabled, hasSeenSection, markSectionSeen, trackPanelOpen, trackPanelDismiss } =
    useHelp({ publicSettings, isTeacher: false });
  const helpPlants = resolveHelpPanelSection('plants', publicSettings);

  const {
    filteredPlants: filtered,
    displayedPlants,
    filterPanelProps,
    plantObservationCounts,
    applyObservationAcknowledged,
    plantGatingSummaries,
    refreshPlantGating,
    hasMore,
    nextBatch,
    showMore,
  } = useBiodivCatalogPage({
    plants,
    zones,
    markers,
    activeMapId,
    defaultZonePresence: ZONE_PRESENCE_FILTER.IN_MAP,
    enableObservationChips: true,
  });

  const plantMapLinkedIds = useMemo(() => {
    const ids = new Set();
    for (const p of displayedPlants) {
      if (plantPresentOnActiveMap(p, zones, markers, activeMapId)) ids.add(p.id);
    }
    return ids;
  }, [displayedPlants, zones, markers, activeMapId]);

  return (
    <div className="fade-in">
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
      >
        <h2 className="section-title">
          <IconBiodiv size={20} /> Catalogue de biodiversité
        </h2>
        {isHelpEnabled && (
          <HelpPanel
            sectionId="plants"
            title={helpPlants.title}
            entries={helpPlants.items}
            isTeacher={false}
            isPulsing={!hasSeenSection('plants')}
            onMarkSeen={markSectionSeen}
            onOpen={trackPanelOpen}
            onDismiss={trackPanelDismiss}
          />
        )}
      </div>
      <p className="section-sub">
        {displayedPlants.length} / {filtered.length} affichés
        {filtered.length !== plants.length ? ` (${plants.length} au catalogue)` : ''} — affine avec
        les filtres
      </p>

      <PlantCatalogFilterPanel
        plants={plants}
        maps={maps}
        activeMapId={activeMapId}
        onActiveMapChange={onActiveMapChange}
        showZonePresence
        searchPlaceholder="Chercher un être vivant…"
        {...filterPanelProps}
      />

      {filtered.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">
            <IconLeaf size={28} />
          </div>
          <p>Aucun être vivant ne colle à ta recherche — essaie un autre mot.</p>
        </div>
      ) : (
        <>
          <div className="biodiv-grid biodiv-grid--tiles">
            {displayedPlants.map((p) => (
              <PlantCatalogTile
                key={p.id}
                plant={p}
                onOpen={onOpenPlant}
                hasMapLink={plantMapLinkedIds.has(p.id)}
                myObservationCount={plantObservationCounts[String(p.id)]?.my_observation_count ?? 0}
                siteObservationCount={
                  plantObservationCounts[String(p.id)]?.site_observation_count ?? 0
                }
                gatingSummary={plantGatingSummaries.get(String(p.id)) || null}
                onObservationAcknowledged={(id, next) => {
                  applyObservationAcknowledged(id, next);
                  refreshPlantGating();
                }}
                offerPlantCommentAfterObservation={
                  contextCommentsEnabled && canParticipateContextComments
                }
                onForceLogout={onForceLogout}
              />
            ))}
          </div>
          {hasMore ? (
            <div className="biodiv-show-more">
              <button
                type="button"
                className="btn btn-secondary biodiv-show-more__btn"
                onClick={showMore}
              >
                Voir {nextBatch} de plus
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

// Ré-exports morts supprimés (Lightbox, MapView, TasksView… n'étaient importés
// par personne et tiraient tasks-views + map-views dans ce chunk lazy).
export { PlantEditForm, PlantManager, ObservationNotebook, PlantViewer, PlantCatalogPreviewModal };
