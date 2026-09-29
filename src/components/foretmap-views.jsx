import { useState, useMemo, useCallback, useRef } from 'react';
import { api } from '../services/api';
import { useHelp } from '../hooks/useHelp';
import { Tooltip } from '../shared/components/Tooltip.jsx';
import { HelpPanel } from './HelpPanel';
import { resolveHelpPanelSection, resolveTooltipKey } from '../utils/helpResolve';
import { plantIdsMarkedOnMap, ZONE_PRESENCE_FILTER } from '../utils/plantFilters';
import { useBiodivCatalogPage } from '../hooks/useBiodivCatalogPage';
import { TimedToast } from '../shared/components/TimedToast.jsx';
import { useAppDialogs } from '../shared/components/AppDialogsProvider.jsx';
import { useDebouncedAutoSave } from '../shared/hooks/useDebouncedAutoSave.js';
import { useEditConflictConfirm } from '../hooks/useEditConflictConfirm.js';
import { createEditRevisionSession, withExpectedRevision } from '../utils/editRevision.js';
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
import { SpeciesObservationReviewPanel } from './observations/SpeciesObservationReviewPanel.jsx';
import { PlantCatalogPreviewModal } from './biodiv/PlantCatalogPreview.jsx';
import { IconBiodiv, IconClose, IconDelete, IconEdit, IconLeaf } from '../shared/icons.jsx';

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
  const confirmPlantOverwrite = useEditConflictConfirm();
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
    presenceByPlantId,
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

  // Pastille « Sur la carte » : même définition que chez l'élève (présence du serveur :
  // registre, zones ou repères). Elle ne comptait jusqu'ici que les zones et repères.
  const plantMapLinkedIds = useMemo(
    () => plantIdsMarkedOnMap(displayedPlants, presenceByPlantId, zones, markers),
    [displayedPlants, presenceByPlantId, zones, markers],
  );

  // Révision de la fiche à l'ouverture du formulaire, avancée par nos propres
  // enregistrements (automatiques ou bouton) — pas par le rafraîchissement de la liste.
  const plantEditSessionRef = useRef(null);
  const startEdit = (p) => {
    plantEditSessionRef.current = createEditRevisionSession(p.edit_revision, {
      confirmOverwrite: confirmPlantOverwrite,
    });
    setEditId(p.id);
    setForm(extractPlantForm(p));
    setShowAdd(false);
  };
  const putPlant = (id, body) => {
    const session = plantEditSessionRef.current;
    if (!session) return api(`/api/plants/${id}`, 'PUT', body);
    return session.save((expected) =>
      api(`/api/plants/${id}`, 'PUT', withExpectedRevision(body, expected)),
    );
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
      if (editId) await putPlant(editId, form);
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
    await putPlant(editId, sent);
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

      <SpeciesObservationReviewPanel maps={maps} onOpenPlant={onOpenPlant} onToast={setToast} />

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
          return (
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
    presenceByPlantId,
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

  const plantMapLinkedIds = useMemo(
    () => plantIdsMarkedOnMap(displayedPlants, presenceByPlantId, zones, markers),
    [displayedPlants, presenceByPlantId, zones, markers],
  );

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
export { PlantEditForm, PlantManager, PlantViewer, PlantCatalogPreviewModal };
