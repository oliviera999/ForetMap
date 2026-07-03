import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { api, AccountDeletedError } from '../services/api';
import { SPECIAL_EMOJI, SPECIAL_DESC, TREE_LEGEND, TREE_DOTS } from '../constants/garden';
import { compressImage } from '../utils/image';
import { useHelp } from '../hooks/useHelp';
import { CatalogRemarksSection } from './map-views';
import { Tooltip } from './Tooltip';
import { HelpPanel } from './HelpPanel';
import { ContextComments } from './context-comments';
import { PlantSpeciesDiscoveryAcknowledgeButton } from './PlantSpeciesDiscoveryAcknowledge';
import { usePlantObservationCounts } from '../hooks/usePlantObservationCounts';
import {
  resolveHelpPanelSection,
  resolveHelpChrome,
  resolveTooltipKey,
} from '../utils/helpResolve';
import { plantLinkedToMapMarker, plantLinkedToMapZone } from '../utils/plantFilters';
import { usePlantCatalogFilters } from '../hooks/usePlantCatalogFilters';
import { MarkdownContent } from './MarkdownContent.jsx';
import { MarkdownTextarea } from './MarkdownTextarea.jsx';
import { ObservationCard } from './ObservationCard.jsx';
import { ObservationNotebookStatus } from './ObservationNotebookStatus.jsx';
import { ObservationPhotoField } from './ObservationPhotoField.jsx';
import { TimedToast } from '../shared/components/TimedToast.jsx';
import { usePublicSettings } from '../contexts/PublicSettingsContext.jsx';
import { useSession } from '../contexts/SessionContext.jsx';
import { useData } from '../contexts/DataContext.jsx';
import {
  normalizedPlantValue,
  isGenericPotagerLabel,
  EMPTY_PLANT_FORM,
  extractPlantForm,
} from '../utils/plantFormValues.js';
import { PlantEditForm } from './biodiv/PlantEditForm.jsx';
import { PlantImportPanel } from './biodiv/PlantImportPanel.jsx';
import { PlantSummaryBadges, PlantEcosystemHumanLead } from './biodiv/PlantSummaryBlocks.jsx';
import { PlantBiodivHeroPhoto, PlantMetaSections } from './biodiv/PlantMetaSections.jsx';
import { PlantCatalogFilterPanel } from './biodiv/PlantCatalogFilterPanel.jsx';
import {
  PlantBiodiversityCatalogPreviewCard,
  PlantCatalogPreviewModal,
} from './biodiv/PlantCatalogPreview.jsx';
import { PlantLocationPreviewMaps } from './biodiv/BiodivLocationMaps.jsx';

// ── INTERACTIVE MAP ──────────────────────────────────────────────────────────

// ── FILTRES CATALOGUE BIODIVERSITÉ (élève + prof) ─────────────────────────────
// ── PLANT MANAGER (teacher) ───────────────────────────────────────────────────
function PlantManager({ onRefresh, maps = [], onForceLogout = null }) {
  const publicSettings = usePublicSettings();
  const { canParticipateContextComments = true } = useSession();
  const { plants = [], zones = [], markers = [] } = useData();
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

  const { filteredPlants, filterPanelProps } = usePlantCatalogFilters(plants, zones, markers);

  const biodivObservationPlantIds = useMemo(() => {
    const ids = filteredPlants.map((p) => Number(p.id)).filter((n) => Number.isFinite(n) && n > 0);
    ids.sort((a, b) => a - b);
    return ids;
  }, [filteredPlants]);
  // Fetch + abonnement `foretmap_session_changed` mutualisés (motif copié entre
  // PlantManager et PlantViewer) ; clé stable = ids joints + plants.length (historique).
  const { counts: plantObservationCounts, applyAcknowledged: applyObservationAcknowledged } =
    usePlantObservationCounts(biodivObservationPlantIds, plants.length);

  // Liens carte pré-calculés une fois par changement de données (au lieu d'un
  // balayage O(zones + repères) par carte à chaque rendu).
  const plantMapLinks = useMemo(() => {
    const links = new Map();
    for (const p of filteredPlants) {
      links.set(p.id, {
        zones: zones.filter((z) => plantLinkedToMapZone(p, z)),
        markers: markers.filter((m) => plantLinkedToMapMarker(p, m)),
      });
    }
    return links;
  }, [filteredPlants, zones, markers]);

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
      if (editId) await api(`/api/plants/${editId}`, 'PUT', form);
      else await api('/api/plants', 'POST', form);
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

  const del = async (p) => {
    if (!confirm(`Supprimer "${p.name}" ?`)) return;
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
        <h2 className="section-title">🌱 Base biodiversité</h2>
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
        {filteredPlants.length} / {plants.length} êtres vivants à l’écran — fouille la biodiversité
        !
      </p>

      <PlantCatalogFilterPanel plants={plants} {...filterPanelProps} />

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

      <div className="biodiv-grid">
        {filteredPlants.map((p) => {
          const { zones: pZones = [], markers: pMarkers = [] } = plantMapLinks.get(p.id) || {};
          const hasMapLink = pZones.length > 0 || pMarkers.length > 0;
          return (
            <div key={p.id} data-biodiv-plant-id={p.id}>
              {editId === p.id ? (
                <div className="biodiv-card biodiv-card-edit fade-in">
                  <PlantEditForm
                    title={`Modifier — ${p.name}`}
                    form={form}
                    setForm={setForm}
                    onSave={save}
                    onCancel={cancelEdit}
                    saving={saving}
                    plantId={p.id}
                    onToast={setToast}
                  />
                </div>
              ) : (
                <article className="biodiv-card fade-in">
                  <div className="biodiv-card-head">
                    <div className="biodiv-card-title-wrap">
                      <span className="biodiv-emoji">{p.emoji}</span>
                      <div className="biodiv-card-title-content">
                        <h3>{p.name}</h3>
                        <p className="plant-scientific">
                          {normalizedPlantValue(p.scientific_name) ||
                            'Nom scientifique non renseigne'}
                        </p>
                      </div>
                    </div>
                    {(normalizedPlantValue(p.taxonomy?.group) ||
                      normalizedPlantValue(p.taxon_group) ||
                      normalizedPlantValue(p.group_2)) && (
                      <span className="task-chip">
                        {normalizedPlantValue(p.taxonomy?.group) ||
                          normalizedPlantValue(p.taxon_group) ||
                          normalizedPlantValue(p.group_2)}
                      </span>
                    )}
                  </div>

                  <div className="biodiv-card-body">
                    {p.description ? (
                      <MarkdownContent className="plant-row-desc">{p.description}</MarkdownContent>
                    ) : (
                      <p className="plant-row-desc">
                        <em style={{ color: '#bbb' }}>Pas de description</em>
                      </p>
                    )}
                    <PlantBiodivHeroPhoto plant={p} />
                    <PlantEcosystemHumanLead plant={p} />
                    <CatalogRemarksSection plant={p} />
                    <div className="task-meta">
                      {normalizedPlantValue(p.habitat) && !isGenericPotagerLabel(p.habitat) && (
                        <span className="task-chip">🏡 {p.habitat}</span>
                      )}
                      {normalizedPlantValue(p.trophic_role) && (
                        <span className="task-chip">🔗 {p.trophic_role}</span>
                      )}
                    </div>
                    <PlantSummaryBadges plant={p} />
                    <PlantMetaSections plant={p} />
                    {hasMapLink ? (
                      <div>
                        <div
                          style={{
                            fontSize: '.74rem',
                            fontWeight: 700,
                            color: '#aaa',
                            textTransform: 'uppercase',
                            marginBottom: 4,
                          }}
                        >
                          Sur la carte
                        </div>
                        <PlantLocationPreviewMaps maps={maps} zones={pZones} markers={pMarkers} />
                        <div
                          style={{
                            fontSize: '.74rem',
                            fontWeight: 700,
                            color: '#aaa',
                            textTransform: 'uppercase',
                            margin: '10px 0 4px',
                          }}
                        >
                          Zones et repères
                        </div>
                        <div className="plant-zones">
                          {pZones.map((z) => (
                            <span key={`zone-${z.id}`} className="plant-zone-chip">
                              📍 {z.name}
                            </span>
                          ))}
                          {pMarkers.map((m) => (
                            <span key={`marker-${m.id}`} className="plant-zone-chip">
                              📌 {m.label?.trim() ? m.label : 'Repère'}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p style={{ fontSize: '.82rem', color: '#bbb', fontStyle: 'italic' }}>
                        Pas encore associé à une zone ni à un repère sur la carte
                      </p>
                    )}
                    <div
                      className="plant-discovery-ack-row"
                      style={{
                        marginTop: 10,
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 8,
                        alignItems: 'center',
                      }}
                    >
                      <PlantSpeciesDiscoveryAcknowledgeButton
                        plantId={p.id}
                        speciesName={p.name}
                        myObservationCount={
                          plantObservationCounts[String(p.id)]?.my_observation_count ?? 0
                        }
                        siteObservationCount={
                          plantObservationCounts[String(p.id)]?.site_observation_count ?? 0
                        }
                        offerPlantCommentAfterObservation={
                          contextCommentsEnabled && canParticipateContextComments
                        }
                        onAcknowledged={applyObservationAcknowledged}
                        onForceLogout={onForceLogout}
                      />
                    </div>
                  </div>

                  {contextCommentsEnabled && (
                    <ContextComments
                      contextType="plant"
                      contextId={String(p.id)}
                      title="Commentaires sur cette fiche"
                      placeholder="Remarque ou question sur cet être vivant…"
                      canParticipateContextComments={canParticipateContextComments}
                    />
                  )}

                  <div className="task-actions">
                    <Tooltip text={tooltipText('plants.edit')}>
                      <button
                        className="btn btn-ghost btn-sm"
                        aria-label="Modifier la fiche biodiversité"
                        onClick={() => startEdit(p)}
                      >
                        ✏️
                      </button>
                    </Tooltip>
                    <Tooltip text={tooltipText('plants.delete')}>
                      <button
                        className="btn btn-danger btn-sm"
                        aria-label="Supprimer la fiche biodiversité"
                        onClick={() => del(p)}
                      >
                        🗑️
                      </button>
                    </Tooltip>
                  </div>
                </article>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── OBSERVATION NOTEBOOK (student) ────────────────────────────────────────────
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
        <h2 className="section-title">📓 Mon carnet</h2>
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
              placeholder="Qu'as-tu observé ? Croissance, insectes, couleur des feuilles..."
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
              {saving ? '...' : '💾 Enregistrer'}
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
          onRetry={load}
        />
      ) : (
        entries.map((e) => <ObservationCard key={e.id} entry={e} onDelete={deleteObs} />)
      )}
    </div>
  );
}

// ── PLANT VIEWER (student read-only) ──────────────────────────────────────────
function PlantViewer({
  maps = [],
  onForceLogout = null,
  onOpenPlant = null,
  onOpenGlossaryTerm = null,
  onNavigateToFoodWeb = null,
}) {
  const publicSettings = usePublicSettings();
  const { canParticipateContextComments = true } = useSession();
  const { plants = [], zones = [], markers = [] } = useData();
  const contextCommentsEnabled = publicSettings?.modules?.context_comments_enabled !== false;
  const { isHelpEnabled, hasSeenSection, markSectionSeen, trackPanelOpen, trackPanelDismiss } =
    useHelp({ publicSettings, isTeacher: false });
  const helpPlants = resolveHelpPanelSection('plants', publicSettings);

  const { filteredPlants: filtered, filterPanelProps } = usePlantCatalogFilters(
    plants,
    zones,
    markers,
  );

  const biodivObservationPlantIdsStudent = useMemo(() => {
    const ids = filtered.map((p) => Number(p.id)).filter((n) => Number.isFinite(n) && n > 0);
    ids.sort((a, b) => a - b);
    return ids;
  }, [filtered]);
  // Même hook mutualisé que côté PlantManager (fetch + abonnement + cleanup).
  const { counts: plantObservationCounts, applyAcknowledged: applyObservationAcknowledged } =
    usePlantObservationCounts(biodivObservationPlantIdsStudent, plants.length);

  return (
    <div className="fade-in">
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
      >
        <h2 className="section-title">🌱 Catalogue de biodiversité</h2>
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
        {filtered.length} / {plants.length} êtres vivants à l&apos;écran — affine avec les filtres
      </p>

      <PlantCatalogFilterPanel
        plants={plants}
        showZonePresence
        searchPlaceholder="🔍 Chercher un être vivant..."
        {...filterPanelProps}
      />

      {filtered.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">🌿</div>
          <p>Aucun être vivant ne colle à ta recherche — essaie un autre mot.</p>
        </div>
      ) : (
        <div className="biodiv-grid">
          {filtered.map((p) => (
            <PlantBiodiversityCatalogPreviewCard
              key={p.id}
              plant={p}
              zones={zones}
              markers={markers}
              maps={maps}
              myObservationCount={plantObservationCounts[String(p.id)]?.my_observation_count ?? 0}
              siteObservationCount={
                plantObservationCounts[String(p.id)]?.site_observation_count ?? 0
              }
              onObservationAcknowledged={applyObservationAcknowledged}
              contextCommentsEnabled={contextCommentsEnabled}
              canParticipateContextComments={canParticipateContextComments}
              onForceLogout={onForceLogout}
              showContextComments
              dataBiodivPlantId={null}
              onOpenPlant={onOpenPlant}
              onOpenGlossaryTerm={onOpenGlossaryTerm}
              onNavigateToFoodWeb={onNavigateToFoodWeb}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Ré-exports morts supprimés (Lightbox, MapView, TasksView… n'étaient importés
// par personne et tiraient tasks-views + map-views dans ce chunk lazy).
export { PlantEditForm, PlantManager, ObservationNotebook, PlantViewer, PlantCatalogPreviewModal };
