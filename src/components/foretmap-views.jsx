import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useOverlayHistoryBack } from '../hooks/useOverlayHistoryBack';
import { api, AccountDeletedError } from '../services/api';
import { SPECIAL_EMOJI, SPECIAL_DESC, TREE_LEGEND, TREE_DOTS } from '../constants/garden';
import { PLANT_EMOJIS } from '../constants/emojis';
import { compressImage, compressImageWithPreset } from '../utils/image';
import { useHelp } from '../hooks/useHelp';
import { TaskFormModal, TasksView, LogModal, TaskLogsViewer } from './tasks-views';
import {
  Lightbox,
  PhotoGallery,
  ZoneInfoModal,
  ZoneDrawModal,
  MarkerModal,
  MapView,
  CatalogRemarksSection,
} from './map-views';
import { Tooltip } from './Tooltip';
import { HelpPanel } from './HelpPanel';
import { ContextComments } from './context-comments';
import {
  PlantSpeciesDiscoveryAcknowledgeButton,
  fetchPlantObservationCounts,
} from './PlantSpeciesDiscoveryAcknowledge';
import { HELP_PANELS, HELP_TOOLTIPS, resolveRoleText } from '../constants/help';
import {
  ZONE_PRESENCE_FILTER,
  distinctPlantFieldValues,
  filterPlantsByTaxonomy,
  plantMatchesAllFilters,
  plantLinkedToMapMarker,
  plantLinkedToMapZone,
} from '../utils/plantFilters';
import { armNativeFilePickerGuard, disarmNativeFilePickerGuard } from '../utils/overlayHistory';
import { DialogShell } from './DialogShell';
import { MarkdownContent } from './MarkdownContent.jsx';
import { MarkdownTextarea } from './MarkdownTextarea.jsx';
import { TimedToast } from '../shared/components/TimedToast.jsx';
import { usePublicSettings } from '../contexts/PublicSettingsContext.jsx';
import { useSession } from '../contexts/SessionContext.jsx';
import { useData } from '../contexts/DataContext.jsx';
import { fileToDataUrl } from '../utils/fileToDataUrl.js';
import {
  normalizedPlantValue,
  isGenericPotagerLabel,
  EMPTY_PLANT_FORM,
  extractPlantForm,
} from '../utils/plantFormValues.js';
import { PlantnetIdentifyPanel } from './biodiv/PlantnetIdentifyPanel.jsx';
import { PlantPrefillPanel } from './biodiv/PlantPrefillPanel.jsx';
import { PlantSummaryBadges, PlantEcosystemHumanLead } from './biodiv/PlantSummaryBlocks.jsx';
import { PlantBiodivHeroPhoto, PlantMetaSections } from './biodiv/PlantMetaSections.jsx';
import { PlantCatalogFilterPanel } from './biodiv/PlantCatalogFilterPanel.jsx';
import { PLANT_PHOTO_FIELD_OPTIONS } from '../constants/plantMetaSections.js';
import { PlantLocationPreviewMaps } from './biodiv/BiodivLocationMaps.jsx';

// ── INTERACTIVE MAP ──────────────────────────────────────────────────────────


const PLANTS_IMPORT_TEMPLATE_HEADERS = [
  'name',
  'emoji',
  'description',
  'scientific_name',
  'group_1',
  'sources',
  'photo',
];
const PLANTS_IMPORT_TEMPLATE_HEADERS_FULL = [
  'name',
  'emoji',
  'description',
  'second_name',
  'scientific_name',
  'group_1',
  'group_2',
  'group_3',
  'group_4',
  'habitat',
  'photo',
  'nutrition',
  'agroecosystem_category',
  'longevity',
  'remark_1',
  'remark_2',
  'remark_3',
  'reproduction',
  'size',
  'sources',
  'ideal_temperature_c',
  'optimal_ph',
  'ecosystem_role',
  'geographic_origin',
  'human_utility',
  'harvest_part',
  'planting_recommendations',
  'preferred_nutrients',
  'photo_species',
  'photo_leaf',
  'photo_flower',
  'photo_fruit',
  'photo_harvest_part',
];

function downloadCsvTemplate(headers, filename) {
  const csv = `${headers.join(',')}\n`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}


// ── PLANT EDIT FORM (outside PlantManager to avoid remount on every keystroke) ──
function PlantEditForm({ title, form, setForm, onSave, onCancel, saving, plantId, onToast, onEnsurePlantId = null }) {
  const set = k => e => setForm(f => ({...f, [k]: e.target.value}));
  const [uploadingField, setUploadingField] = useState('');

  const photoFields = PLANT_PHOTO_FIELD_OPTIONS;

  const uploadPhoto = async (field, file) => {
    if (!file) return;
    let targetId = plantId;
    if (!targetId && typeof onEnsurePlantId === 'function') {
      targetId = await onEnsurePlantId();
      if (!targetId) return;
    } else if (!targetId) {
      onToast?.('Crée d\'abord la fiche, puis ajoute les photos.');
      return;
    }
    setUploadingField(field);
    try {
      const imageData = await compressImageWithPreset(file, 'plant');
      const position = field === 'photo' ? 'prepend' : 'append';
      const result = await api(`/api/plants/${targetId}/photo-upload`, 'POST', { field, imageData, position });
      setForm((prev) => ({ ...prev, [field]: result?.plant?.[field] || result?.url || prev[field] }));
      onToast?.('Photo importée ✓');
    } catch (e) {
      onToast?.('Erreur import photo : ' + e.message);
    } finally {
      setUploadingField('');
    }
  };

  /** Galerie : plusieurs fichiers → champs photo suivants dans l’ordre (photo espèce → … → partie récoltée). */
  const uploadPhotosFromGallery = async (startFieldKey, fileList) => {
    const files = Array.from(fileList || []).filter((f) => f?.size);
    if (!files.length) return;
    const startIdx = photoFields.findIndex((f) => f.key === startFieldKey);
    if (startIdx < 0) return;

    let targetId = plantId;
    if (!targetId && typeof onEnsurePlantId === 'function') {
      targetId = await onEnsurePlantId();
      if (!targetId) return;
    } else if (!targetId) {
      onToast?.('Crée d\'abord la fiche, puis ajoute les photos.');
      return;
    }

    setUploadingField(startFieldKey);
    let ok = 0;
    let skipped = 0;
    try {
      for (let i = 0; i < files.length; i++) {
        const slotIdx = startIdx + i;
        if (slotIdx >= photoFields.length) {
          skipped = files.length - i;
          break;
        }
        const fld = photoFields[slotIdx].key;
        try {
          const imageData = await compressImageWithPreset(files[i], 'plant');
          const result = await api(`/api/plants/${targetId}/photo-upload`, 'POST', { field: fld, imageData, position: 'append' });
          setForm((prev) => ({ ...prev, [fld]: result?.plant?.[fld] || result?.url || prev[fld] }));
          ok += 1;
        } catch (e) {
          onToast?.(`Erreur import (${photoFields[slotIdx].label}) : ${e.message}`);
        }
      }
      if (skipped > 0) {
        onToast?.(`${skipped} photo(s) non importée(s) — plus de champ disponible après « ${photoFields[startIdx].label} ».`);
      }
      if (ok === 1 && skipped === 0) {
        onToast?.('Photo importée ✓');
      } else if (ok > 1) {
        onToast?.(`${ok} photos importées ✓`);
      }
    } finally {
      setUploadingField('');
    }
  };

  return (
    <div className="plant-edit-form fade-in">
      <h4>{title}</h4>
      <div className="field"><label>Emoji</label>
        <div className="emoji-row">
          {PLANT_EMOJIS.map(e => (
            <button key={e} className={`emoji-btn ${form.emoji === e ? 'sel' : ''}`}
              onClick={() => setForm(f => ({...f, emoji: e}))}>{e}</button>
          ))}
        </div>
        <input value={form.emoji} onChange={set('emoji')} placeholder="ou colle un emoji" style={{marginTop:6}}/>
      </div>
      <div className="field"><label>Nom *</label>
        <input value={form.name} onChange={set('name')} placeholder="Ex: Aubergine"/>
      </div>
      <PlantnetIdentifyPanel
        saving={saving}
        plantId={plantId}
        onEnsurePlantId={onEnsurePlantId}
        setForm={setForm}
        onToast={onToast}
      />
      <PlantPrefillPanel form={form} setForm={setForm} saving={saving} onToast={onToast} />
      <div className="field"><label>Description d'identification</label>
        <MarkdownTextarea value={form.description} onChange={set('description')} rows={3}
          placeholder="Comment reconnaître cet être vivant ? Feuilles, taille, odeur..."/>
      </div>
      <div className="plant-form-grid">
        <div className="field"><label>Nom scientifique</label><input value={form.scientific_name} onChange={set('scientific_name')} placeholder="Ex: Solanum lycopersicum"/></div>
        <div className="field"><label>Deuxième nom</label><input value={form.second_name} onChange={set('second_name')} placeholder="Nom alternatif"/></div>
        <div className="field"><label>Habitat</label><input value={form.habitat} onChange={set('habitat')} placeholder="Aquarium, potager..."/></div>
        <div className="field"><label>Catégorie agrosystème</label><input value={form.agroecosystem_category} onChange={set('agroecosystem_category')} placeholder="Producteur primaire..."/></div>
        <div className="field"><label>Nutrition</label><input value={form.nutrition} onChange={set('nutrition')} placeholder="Autotrophe, omnivore..."/></div>
        <div className="field"><label>Longévité</label><input value={form.longevity} onChange={set('longevity')} placeholder="Annuelle, vivace..."/></div>
        <div className="field"><label>Taille</label><input value={form.size} onChange={set('size')} placeholder="Ex: 30-80 cm"/></div>
        <div className="field"><label>Reproduction</label><input value={form.reproduction} onChange={set('reproduction')} placeholder="Sexuée, bouturage..."/></div>
        <div className="field"><label>Température idéale (°C)</label><input value={form.ideal_temperature_c} onChange={set('ideal_temperature_c')} placeholder="Ex: 18-24"/></div>
        <div className="field"><label>pH optimal</label><input value={form.optimal_ph} onChange={set('optimal_ph')} placeholder="Ex: 6,0-7,0"/></div>
        <div className="field"><label>Origine géographique</label><input value={form.geographic_origin} onChange={set('geographic_origin')} placeholder="Ex: Bassin méditerranéen"/></div>
        <div className="field"><label>Partie à récolter</label><input value={form.harvest_part} onChange={set('harvest_part')} placeholder="Feuilles, fruits..."/></div>
        <div className="field"><label>Groupe (taxon) 1</label><input value={form.group_1} onChange={set('group_1')} placeholder="Végétal / Animal..."/></div>
        <div className="field"><label>Groupe (taxon) 2</label><input value={form.group_2} onChange={set('group_2')} placeholder="Angiosperme..."/></div>
        <div className="field"><label>Groupe (taxon) 3</label><input value={form.group_3} onChange={set('group_3')} placeholder="Famille..."/></div>
        <div className="field"><label>Groupe (taxon) 4</label><input value={form.group_4} onChange={set('group_4')} placeholder="Famille (végétal) ou genre (animal)"/></div>
      </div>
      <div className="field"><label>Rôle dans l'écosystème</label><MarkdownTextarea value={form.ecosystem_role} onChange={set('ecosystem_role')} rows={2} placeholder="Fonction écologique principale"/></div>
      <div className="field"><label>Utilité pour l'être humain</label><MarkdownTextarea value={form.human_utility} onChange={set('human_utility')} rows={2} placeholder="Usages alimentaires, pédagogiques..."/></div>
      <div className="field"><label>Recommandations de plantation</label><MarkdownTextarea value={form.planting_recommendations} onChange={set('planting_recommendations')} rows={2} placeholder="Semis, exposition, espacement..."/></div>
      <div className="field"><label>Nutriments préférés</label><MarkdownTextarea value={form.preferred_nutrients} onChange={set('preferred_nutrients')} rows={2} placeholder="Azote, phosphore, potassium..."/></div>
      <div className="field"><label>Sources</label><MarkdownTextarea value={form.sources} onChange={set('sources')} rows={2} placeholder="URL ou références, séparées par virgules"/></div>
      <p className="section-sub" style={{ marginTop: -4, marginBottom: 10 }}>
        Photos : utiliser uniquement des liens directs vers image (`.jpg`, `.png`, `.webp`, etc.) ou `.../wiki/Special:FilePath/...`.
      </p>
      <div className="plant-form-grid">
        {photoFields.map((field) => (
          <div className="field" key={field.key}>
            <label>{field.label} (URL directe)</label>
            <input
              value={form[field.key]}
              onChange={set(field.key)}
              placeholder="https://.../image.jpg ou /uploads/..."
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
              <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                {uploadingField === field.key ? 'Envoi…' : '📁 Galerie'}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: 'none' }}
                  disabled={saving || uploadingField === field.key}
                  onChange={(e) => {
                    disarmNativeFilePickerGuard();
                    const list = e.target.files;
                    e.target.value = '';
                    void uploadPhotosFromGallery(field.key, list);
                  }}
                />
              </label>
              <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                {uploadingField === field.key ? 'Envoi…' : '📸 Appareil photo'}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: 'none' }}
                  disabled={saving || uploadingField === field.key}
                  onChange={(e) => {
                    disarmNativeFilePickerGuard();
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    uploadPhoto(field.key, file);
                  }}
                />
              </label>
            </div>
          </div>
        ))}
      </div>
      <div className="plant-form-grid">
        <div className="field"><label>Remarque 1</label><input value={form.remark_1} onChange={set('remark_1')} placeholder="Optionnel"/></div>
        <div className="field"><label>Remarque 2</label><input value={form.remark_2} onChange={set('remark_2')} placeholder="Optionnel"/></div>
        <div className="field"><label>Remarque 3</label><input value={form.remark_3} onChange={set('remark_3')} placeholder="Optionnel"/></div>
      </div>
      <div style={{display:'flex',gap:8}}>
        <button className="btn btn-primary btn-sm" onClick={onSave} disabled={saving}>{saving ? '...' : '💾 Sauvegarder'}</button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Annuler</button>
      </div>
    </div>
  );
}

// ── FILTRES CATALOGUE BIODIVERSITÉ (élève + prof) ─────────────────────────────
// ── PLANT MANAGER (teacher) ───────────────────────────────────────────────────
function PlantManager({
  onRefresh,
  maps = [],
  onForceLogout = null,
}) {
  const publicSettings = usePublicSettings();
  const { canParticipateContextComments = true } = useSession();
  const { plants = [], zones = [], markers = [] } = useData();
  const contextCommentsEnabled = publicSettings?.modules?.context_comments_enabled !== false;
  const [editId,  setEditId]  = useState(null);
  const [form,    setForm]    = useState({ ...EMPTY_PLANT_FORM });
  const [showAdd, setShowAdd] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [toast,   setToast]   = useState(null);
  const [search, setSearch] = useState('');
  const [group1, setGroup1] = useState('');
  const [group2, setGroup2] = useState('');
  const [group3, setGroup3] = useState('');
  const [habitatFilter, setHabitatFilter] = useState('');
  const [agroFilter, setAgroFilter] = useState('');
  const [importSource, setImportSource] = useState('file');
  const [importStrategy, setImportStrategy] = useState('upsert_name');
  const [importFile, setImportFile] = useState(null);
  const [gsheetUrl, setGsheetUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [confirmReplaceAll, setConfirmReplaceAll] = useState(false);
  const [importReport, setImportReport] = useState(null);
  const [plantObservationCounts, setPlantObservationCounts] = useState(() => ({}));
  const { isHelpEnabled, hasSeenSection, markSectionSeen, trackPanelOpen, trackPanelDismiss } = useHelp({ publicSettings, isTeacher: true });
  const tooltipText = (entry) => resolveRoleText(entry, true);

  const structured = useMemo(
    () => ({
      group1,
      group2,
      group3,
      habitat: habitatFilter,
      agroecosystemCategory: agroFilter,
    }),
    [group1, group2, group3, habitatFilter, agroFilter],
  );

  const queryTrimmedLower = search.trim().toLowerCase();

  const filteredPlants = useMemo(
    () =>
      plants.filter((p) =>
        plantMatchesAllFilters(
          p,
          { structured, queryTrimmedLower, zonePresence: ZONE_PRESENCE_FILTER.ALL },
          zones,
          markers,
        ),
      ),
    [plants, structured, queryTrimmedLower, zones, markers],
  );

  const biodivObservationPlantIds = useMemo(() => {
    const ids = filteredPlants.map((p) => Number(p.id)).filter((n) => Number.isFinite(n) && n > 0);
    ids.sort((a, b) => a - b);
    return ids;
  }, [filteredPlants]);
  const biodivObservationIdsKey = biodivObservationPlantIds.join(',');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (biodivObservationPlantIds.length === 0) {
        if (!cancelled) setPlantObservationCounts({});
        return;
      }
      const counts = await fetchPlantObservationCounts(biodivObservationPlantIds);
      if (!cancelled) setPlantObservationCounts(counts);
    };
    load();
    if (typeof window !== 'undefined') {
      window.addEventListener('foretmap_session_changed', load);
      return () => {
        cancelled = true;
        window.removeEventListener('foretmap_session_changed', load);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [biodivObservationIdsKey, plants.length]);

  const zonesForPlant = (p) => zones.filter((z) => plantLinkedToMapZone(p, z));
  const markersForPlant = (p) => markers.filter((m) => plantLinkedToMapMarker(p, m));

  const startEdit = p => {
    setEditId(p.id);
    setForm(extractPlantForm(p));
    setShowAdd(false);
  };

  const cancelEdit = () => { setEditId(null); setShowAdd(false); };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editId) await api(`/api/plants/${editId}`, 'PUT', form);
      else        await api('/api/plants', 'POST', form);
      await onRefresh();
      setEditId(null);
      setShowAdd(false);
      setForm({ ...EMPTY_PLANT_FORM });
      setToast(editId ? 'Entrée biodiversité modifiée ✓' : 'Entrée biodiversité ajoutée ✓');
    } catch(e) { setToast('Erreur : ' + e.message); }
    setSaving(false);
  };

  const del = async p => {
    if (!confirm(`Supprimer "${p.name}" ?`)) return;
    try {
      await api(`/api/plants/${p.id}`, 'DELETE');
      await onRefresh();
      setToast('Entrée biodiversité supprimée');
    } catch(e) { setToast('Erreur : ' + e.message); }
  };

  const runImport = async ({ dryRun }) => {
    if (importSource === 'file' && !importFile) {
      setToast('Choisis un fichier CSV/XLSX.');
      return;
    }
    if (importSource === 'gsheet' && !gsheetUrl.trim()) {
      setToast('Saisis une URL Google Sheet.');
      return;
    }
    if (!dryRun && importStrategy === 'replace_all' && !confirmReplaceAll) {
      setToast('Confirme le remplacement complet avant import.');
      return;
    }

    setImporting(true);
    try {
      const payload = {
        sourceType: importSource,
        strategy: importStrategy,
        dryRun,
      };
      if (importSource === 'file') {
        payload.fileName = importFile.name;
        payload.fileDataBase64 = await fileToDataUrl(importFile);
      } else {
        payload.gsheetUrl = gsheetUrl.trim();
      }
      const data = await api('/api/plants/import', 'POST', payload);
      setImportReport(data?.report || null);
      if (!dryRun) {
        await onRefresh();
        setToast('Import biodiversité terminé ✓');
      }
    } catch (e) {
      setToast('Erreur import : ' + e.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      {toast && <TimedToast msg={toast} onDone={() => setToast(null)} />}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
        <h2 className="section-title">🌱 Base biodiversité</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isHelpEnabled && (
            <HelpPanel
              sectionId="plants"
              title={HELP_PANELS.plants.title}
              entries={HELP_PANELS.plants.items}
              isTeacher
              isPulsing={!hasSeenSection('plants')}
              onMarkSeen={markSectionSeen}
              onOpen={trackPanelOpen}
              onDismiss={trackPanelDismiss}
            />
          )}
          {!showAdd && !editId && (
            <button className="btn btn-primary btn-sm" onClick={() => { setShowAdd(true); setForm({ ...EMPTY_PLANT_FORM }); }}>
              + Ajouter
            </button>
          )}
        </div>
      </div>
      <p className="section-sub">
        {filteredPlants.length} / {plants.length} êtres vivants à l’écran — fouille la biodiversité !
      </p>

      <PlantCatalogFilterPanel
        plants={plants}
        search={search}
        setSearch={setSearch}
        group1={group1}
        setGroup1={setGroup1}
        group2={group2}
        setGroup2={setGroup2}
        group3={group3}
        setGroup3={setGroup3}
        habitat={habitatFilter}
        setHabitat={setHabitatFilter}
        agro={agroFilter}
        setAgro={setAgroFilter}
      />

      <details className="plant-more" style={{ marginBottom: 10 }}>
        <summary>Import biodiversité (CSV, Excel, Google Sheet)</summary>
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          <div className="plant-form-grid">
            <div className="field">
              <label>Source</label>
              <select value={importSource} onChange={(e) => setImportSource(e.target.value)} style={{ background: 'white' }}>
                <option value="file">Fichier CSV/XLSX</option>
                <option value="gsheet">URL Google Sheet</option>
              </select>
            </div>
            <div className="field">
              <label>Stratégie d'import</label>
              <select value={importStrategy} onChange={(e) => setImportStrategy(e.target.value)} style={{ background: 'white' }}>
                <option value="upsert_name">Mettre à jour si même nom, sinon créer</option>
                <option value="insert_only">Créer uniquement, ignorer les doublons</option>
                <option value="replace_all">Remplacer entièrement le catalogue</option>
              </select>
            </div>
          </div>

          {importSource === 'file' ? (
            <div className="field">
              <label>Fichier d'import</label>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
              />
              {importFile && <small style={{ color: '#666' }}>{importFile.name}</small>}
            </div>
          ) : (
            <div className="field">
              <label>URL Google Sheet</label>
              <input
                value={gsheetUrl}
                onChange={(e) => setGsheetUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/.../edit#gid=0"
              />
            </div>
          )}

          {importStrategy === 'replace_all' && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '.85rem', color: '#7a3a3a' }}>
              <input
                type="checkbox"
                checked={confirmReplaceAll}
                onChange={(e) => setConfirmReplaceAll(e.target.checked)}
              />
              Je confirme le remplacement complet de la base biodiversité.
            </label>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => downloadCsvTemplate(PLANTS_IMPORT_TEMPLATE_HEADERS, 'plants-import-template-vierge.csv')}
              disabled={importing}>
              Télécharger template vierge
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => downloadCsvTemplate(PLANTS_IMPORT_TEMPLATE_HEADERS_FULL, 'plants-import-template-complet.csv')}
              disabled={importing}>
              Télécharger template complet
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => runImport({ dryRun: true })} disabled={importing}>
              {importing ? 'Analyse...' : 'Analyser (prévisualisation)'}
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => runImport({ dryRun: false })} disabled={importing}>
              {importing ? 'Import...' : 'Lancer l\'import'}
            </button>
          </div>

          {importReport && (
            <div style={{ background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 10, padding: 10 }}>
              <div style={{ fontWeight: 700, color: 'var(--forest)', marginBottom: 6 }}>Rapport d'import</div>
              <div style={{ fontSize: '.85rem', color: '#444', lineHeight: 1.6 }}>
                Reçues: {importReport?.totals?.received ?? 0} · Valides: {importReport?.totals?.valid ?? 0} ·
                Créées: {importReport?.totals?.created ?? 0} · Mises à jour: {importReport?.totals?.updated ?? 0} ·
                Ignorées (doublon): {importReport?.totals?.skipped_existing ?? 0} ·
                Ignorées (invalides): {importReport?.totals?.skipped_invalid ?? 0}
              </div>
              {Array.isArray(importReport?.errors) && importReport.errors.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: '.8rem', fontWeight: 700, color: '#a94442' }}>Erreurs (max 10 affichées)</div>
                  <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                    {importReport.errors.slice(0, 10).map((err, idx) => (
                      <li key={`import-err-${idx}`} style={{ fontSize: '.8rem', color: '#a94442' }}>
                        Ligne {err.row} · {err.field}: {err.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </details>

      {showAdd && (
        <PlantEditForm
          title="Nouvel être vivant"
          form={form} setForm={setForm}
          onSave={save} onCancel={cancelEdit} saving={saving}
          plantId={null}
          onToast={setToast}
          onEnsurePlantId={async () => {
            if (!form.name.trim()) {
              setToast('Indique un nom pour la fiche avant d\'importer une photo.');
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
        {filteredPlants.map(p => {
          const pZones = zonesForPlant(p);
          const pMarkers = markersForPlant(p);
          const hasMapLink = pZones.length > 0 || pMarkers.length > 0;
          return (
          <div key={p.id} data-biodiv-plant-id={p.id}>
            {editId === p.id ? (
              <div className="biodiv-card biodiv-card-edit fade-in">
                <PlantEditForm
                  title={`Modifier — ${p.name}`}
                  form={form} setForm={setForm}
                  onSave={save} onCancel={cancelEdit} saving={saving}
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
                        {normalizedPlantValue(p.scientific_name) || 'Nom scientifique non renseigne'}
                      </p>
                    </div>
                  </div>
                  {normalizedPlantValue(p.group_2) && (
                    <span className="task-chip">{p.group_2}</span>
                  )}
                </div>

                <div className="biodiv-card-body">
                  {p.description ? (
                    <MarkdownContent className="plant-row-desc">{p.description}</MarkdownContent>
                  ) : (
                    <p className="plant-row-desc"><em style={{color:'#bbb'}}>Pas de description</em></p>
                  )}
                  <PlantBiodivHeroPhoto plant={p} />
                  <PlantEcosystemHumanLead plant={p} />
                  <CatalogRemarksSection plant={p} />
                  <div className="task-meta">
                    {normalizedPlantValue(p.habitat) && !isGenericPotagerLabel(p.habitat) && (
                      <span className="task-chip">🏡 {p.habitat}</span>
                    )}
                    {normalizedPlantValue(p.agroecosystem_category) && !isGenericPotagerLabel(p.agroecosystem_category) && (
                      <span className="task-chip">🌍 {p.agroecosystem_category}</span>
                    )}
                  </div>
                  <PlantSummaryBadges plant={p}/>
                  <PlantMetaSections plant={p}/>
                  {hasMapLink ? (
                    <div>
                      <div style={{ fontSize: '.74rem', fontWeight: 700, color: '#aaa', textTransform: 'uppercase', marginBottom: 4 }}>Sur la carte</div>
                      <PlantLocationPreviewMaps maps={maps} zones={pZones} markers={pMarkers} />
                      <div style={{ fontSize: '.74rem', fontWeight: 700, color: '#aaa', textTransform: 'uppercase', margin: '10px 0 4px' }}>Zones et repères</div>
                      <div className="plant-zones">
                        {pZones.map((z) => (
                          <span key={`zone-${z.id}`} className="plant-zone-chip">📍 {z.name}</span>
                        ))}
                        {pMarkers.map((m) => (
                          <span key={`marker-${m.id}`} className="plant-zone-chip">📌 {m.label?.trim() ? m.label : 'Repère'}</span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p style={{ fontSize: '.82rem', color: '#bbb', fontStyle: 'italic' }}>Pas encore associé à une zone ni à un repère sur la carte</p>
                  )}
                  <div className="plant-discovery-ack-row" style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    <PlantSpeciesDiscoveryAcknowledgeButton
                      plantId={p.id}
                      speciesName={p.name}
                      myObservationCount={plantObservationCounts[String(p.id)]?.my_observation_count ?? 0}
                      siteObservationCount={plantObservationCounts[String(p.id)]?.site_observation_count ?? 0}
                      offerPlantCommentAfterObservation={contextCommentsEnabled && canParticipateContextComments}
                      onAcknowledged={(id, next) => {
                        setPlantObservationCounts((prev) => ({
                          ...prev,
                          [String(id)]: {
                            my_observation_count: next.my_observation_count,
                            site_observation_count: next.site_observation_count,
                          },
                        }));
                      }}
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
                  <Tooltip text={tooltipText(HELP_TOOLTIPS.plants.edit)}>
                    <button className="btn btn-ghost btn-sm" aria-label="Modifier la fiche biodiversité" onClick={() => startEdit(p)}>✏️</button>
                  </Tooltip>
                  <Tooltip text={tooltipText(HELP_TOOLTIPS.plants.delete)}>
                    <button className="btn btn-danger btn-sm" aria-label="Supprimer la fiche biodiversité" onClick={() => del(p)}>🗑️</button>
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

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const data = await api(`/api/observations/student/${student.id}?studentId=${encodeURIComponent(student.id)}`);
      setEntries(data);
    } catch (e) {
      if (e instanceof AccountDeletedError) {
        onForceLogout?.();
        return;
      }
      console.error('[ForetMap] observations', e);
      setEntries([]);
      setLoadError(e?.message || 'Impossible de charger ton carnet.');
    }
  }, [student.id, onForceLogout]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    (async () => {
      try {
        const data = await api(`/api/observations/student/${student.id}?studentId=${encodeURIComponent(student.id)}`);
        if (cancelled) return;
        setEntries(data);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof AccountDeletedError) {
          onForceLogout?.();
          return;
        }
        console.error('[ForetMap] observations', e);
        setEntries([]);
        setLoadError(e?.message || 'Impossible de charger ton carnet.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [student.id, onForceLogout]);

  const handleFile = e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    compressImage(file).then(d => { setImageData(d); setPreview(d); }).catch(() => {});
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
      setContent(''); setZoneId(''); setImageData(null); setPreview(null);
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
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4}}>
        <h2 className="section-title">📓 Mon carnet</h2>
        {!showForm && <button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>+ Observation</button>}
      </div>
      <p className="section-sub">Tes observations sur la forêt comestible</p>

      {showForm && (
        <div className="plant-edit-form fade-in" style={{marginBottom:16}}>
          <h4>Nouvelle observation</h4>
          <div className="field"><label>Zone (optionnel)</label>
            <select value={zoneId} onChange={e => setZoneId(e.target.value)}>
              <option value="">— Aucune zone —</option>
              {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </div>
          <div className="field"><label>Observation *</label>
            <MarkdownTextarea value={content} onChange={e => setContent(e.target.value)} rows={3}
              placeholder="Qu'as-tu observé ? Croissance, insectes, couleur des feuilles..." autoFocus/>
          </div>
          <div className="field"><label>Photo (optionnel)</label>
            {!preview ? (
              <div className="img-upload-area img-upload-area--split" role="group" aria-label="Photo d'observation : galerie ou appareil photo">
                <div style={{fontSize:'1.5rem', marginBottom:4}}>📷</div>
                <div style={{fontSize:'.82rem', color:'#888', marginBottom: 10}}>Galerie ou appareil photo</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      if (galleryFileRef.current) galleryFileRef.current.value = '';
                      armNativeFilePickerGuard();
                      galleryFileRef.current?.click();
                    }}
                  >
                    📁 Choisir une photo
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      if (cameraFileRef.current) cameraFileRef.current.value = '';
                      armNativeFilePickerGuard();
                      cameraFileRef.current?.click();
                    }}
                  >
                    📸 Prendre une photo
                  </button>
                </div>
                <input
                  ref={galleryFileRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    disarmNativeFilePickerGuard();
                    handleFile(e);
                  }}
                />
                <input
                  ref={cameraFileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => {
                    disarmNativeFilePickerGuard();
                    handleFile(e);
                  }}
                />
              </div>
            ) : (
              <div className="img-preview-wrap">
                <img src={preview} className="img-preview" alt="preview"/>
                <button className="img-remove" onClick={() => { setImageData(null); setPreview(null); }}>✕</button>
              </div>
            )}
          </div>
          <div style={{display:'flex', gap:8}}>
            <button className="btn btn-primary btn-sm" onClick={submit} disabled={saving || !content.trim()}>
              {saving ? '...' : '💾 Enregistrer'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setShowForm(false); setContent(''); setImageData(null); setPreview(null); }}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {loading
        ? <div className="loader" style={{height:'40vh'}}><div className="loader-leaf">🌿</div><p>Chargement...</p></div>
        : loadError
          ? (
            <div className="empty">
              <div className="empty-icon">⚠️</div>
              <p>{loadError}</p>
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={load}>
                Réessayer
              </button>
            </div>
          )
          : entries.length === 0
          ? <div className="empty"><div className="empty-icon">📓</div><p>Ton carnet est vide. Ajoute ta première observation !</p></div>
          : entries.map(e => (
            <div key={e.id} className="obs-card fade-in">
              <div className="obs-header">
                <span className="obs-date">{new Date(e.created_at).toLocaleDateString('fr-FR', {day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</span>
                <button className="btn btn-ghost btn-sm" style={{padding:'2px 6px', minHeight:'auto', fontSize:'.7rem'}}
                  onClick={() => { if (confirm('Supprimer cette observation ?')) deleteObs(e.id); }}>🗑️</button>
              </div>
              <MarkdownContent className="obs-content">{e.content}</MarkdownContent>
              {e.zone_name && <div className="obs-zone">📍 {e.zone_name}</div>}
              {e.image_url && <img src={e.image_url} alt="observation" style={{width:'100%',borderRadius:8,marginTop:8,maxHeight:200,objectFit:'cover'}}/>}
            </div>
          ))
      }
    </div>
  );
}

/**
 * Carte fiche biodiversité (lecture seule), même contenu que le catalogue élève — réutilisée dans le viewer et la modale d’aperçu (comme les tutoriels).
 */
function PlantBiodiversityCatalogPreviewCard({
  plant,
  zones = [],
  markers = [],
  maps = [],
  myObservationCount = 0,
  siteObservationCount = 0,
  onObservationAcknowledged = null,
  contextCommentsEnabled = true,
  canParticipateContextComments = true,
  onForceLogout = null,
  showContextComments = true,
  dataBiodivPlantId = null,
}) {
  if (!plant) return null;
  const pZones = zones.filter((z) => plantLinkedToMapZone(plant, z));
  const pMarkers = markers.filter((m) => plantLinkedToMapMarker(plant, m));
  const hasMapLink = pZones.length > 0 || pMarkers.length > 0;
  const dataAttr = dataBiodivPlantId != null && dataBiodivPlantId !== ''
    ? { 'data-biodiv-plant-id': dataBiodivPlantId }
    : {};
  return (
    <article className="biodiv-card fade-in" {...dataAttr}>
      <div className="biodiv-card-head">
        <div className="biodiv-card-title-wrap">
          <span className="biodiv-emoji">{plant.emoji}</span>
          <div className="biodiv-card-title-content">
            <h3>{plant.name}</h3>
            <p className="plant-scientific">
              {normalizedPlantValue(plant.scientific_name) || 'Nom scientifique non renseigne'}
            </p>
          </div>
        </div>
        {normalizedPlantValue(plant.group_2) && (
          <span className="task-chip">{plant.group_2}</span>
        )}
      </div>

      <div className="biodiv-card-body">
        {plant.description ? (
          <MarkdownContent className="plant-row-desc">{plant.description}</MarkdownContent>
        ) : (
          <p className="plant-row-desc"><em style={{ color: '#bbb' }}>Pas de description</em></p>
        )}
        <PlantBiodivHeroPhoto plant={plant} />
        <PlantEcosystemHumanLead plant={plant} />
        <CatalogRemarksSection plant={plant} />
        <div className="task-meta">
          {normalizedPlantValue(plant.habitat) && !isGenericPotagerLabel(plant.habitat) && (
            <span className="task-chip">🏡 {plant.habitat}</span>
          )}
          {normalizedPlantValue(plant.agroecosystem_category) && !isGenericPotagerLabel(plant.agroecosystem_category) && (
            <span className="task-chip">🌍 {plant.agroecosystem_category}</span>
          )}
        </div>
        <PlantSummaryBadges plant={plant} />
        <PlantMetaSections plant={plant} />
        {hasMapLink ? (
          <div>
            <div style={{ fontSize: '.74rem', fontWeight: 700, color: '#aaa', textTransform: 'uppercase', marginBottom: 4 }}>Sur la carte</div>
            <PlantLocationPreviewMaps maps={maps} zones={pZones} markers={pMarkers} />
            <div style={{ fontSize: '.74rem', fontWeight: 700, color: '#aaa', textTransform: 'uppercase', margin: '10px 0 4px' }}>Zones et repères</div>
            <div className="plant-zones">
              {pZones.map((z) => (
                <span key={`zone-${z.id}`} className="plant-zone-chip">📍 {z.name}</span>
              ))}
              {pMarkers.map((m) => (
                <span key={`marker-${m.id}`} className="plant-zone-chip">📌 {m.label?.trim() ? m.label : 'Repère'}</span>
              ))}
            </div>
          </div>
        ) : (
          <p style={{ fontSize: '.82rem', color: '#bbb', fontStyle: 'italic' }}>Pas encore associé à une zone ni à un repère sur la carte</p>
        )}
        <div className="plant-discovery-ack-row" style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <PlantSpeciesDiscoveryAcknowledgeButton
            plantId={plant.id}
            speciesName={plant.name}
            myObservationCount={myObservationCount}
            siteObservationCount={siteObservationCount}
            offerPlantCommentAfterObservation={contextCommentsEnabled && canParticipateContextComments}
            onAcknowledged={(id, next) => {
              onObservationAcknowledged?.(id, next);
            }}
            onForceLogout={onForceLogout}
          />
        </div>
        {showContextComments && contextCommentsEnabled && (
          <ContextComments
            contextType="plant"
            contextId={String(plant.id)}
            title="Commentaires sur cette fiche"
            placeholder="Remarque ou question sur cet être vivant…"
            canParticipateContextComments={canParticipateContextComments}
          />
        )}
      </div>
    </article>
  );
}

/** Aperçu plein écran (portal) d’une fiche catalogue — même principe que `TutorialPreviewModal`. */
function PlantCatalogPreviewModal({
  plant,
  maps = [],
  onClose,
  onForceLogout = null,
}) {
  const publicSettings = usePublicSettings();
  const { canParticipateContextComments = true } = useSession();
  const { zones = [], markers = [] } = useData();
  useOverlayHistoryBack(!!plant, onClose);
  const contextCommentsEnabled = publicSettings?.modules?.context_comments_enabled !== false;
  const [obs, setObs] = useState({ my: 0, site: 0 });

  useEffect(() => {
    if (!plant?.id) {
      setObs({ my: 0, site: 0 });
      return undefined;
    }
    let cancelled = false;
    (async () => {
      const map = await fetchPlantObservationCounts([plant.id]);
      const row = map[String(plant.id)] || map[plant.id];
      if (cancelled || !row) return;
      setObs({
        my: Number(row.my_observation_count) || 0,
        site: Number(row.site_observation_count) || 0,
      });
    })();
    return () => { cancelled = true; };
  }, [plant?.id]);

  if (!plant) return null;
  return (
    <DialogShell
      open={!!plant}
      onClose={onClose}
      overlayClassName="modal-overlay modal-overlay--tuto-preview"
      dialogClassName="log-modal tuto-preview-modal"
      ariaLabelledBy="plant-catalog-preview-title"
      closeOnOverlay
    >
      <div className="tuto-preview-modal__head">
        <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer l’aperçu">✕</button>
        <h3 id="plant-catalog-preview-title">🌱 {plant.name}</h3>
      </div>
      <div className="tuto-preview-modal__body tuto-preview-modal__body--biodiv-scroll">
        <PlantBiodiversityCatalogPreviewCard
          plant={plant}
          zones={zones}
          markers={markers}
          maps={maps}
          myObservationCount={obs.my}
          siteObservationCount={obs.site}
          onObservationAcknowledged={(_id, next) => {
            setObs({
              my: Number(next.my_observation_count) || 0,
              site: Number(next.site_observation_count) || 0,
            });
          }}
          contextCommentsEnabled={contextCommentsEnabled}
          canParticipateContextComments={canParticipateContextComments}
          onForceLogout={onForceLogout}
          showContextComments
          dataBiodivPlantId={null}
        />
      </div>
    </DialogShell>
  );
}

// ── PLANT VIEWER (student read-only) ──────────────────────────────────────────
function PlantViewer({
  maps = [],
  onForceLogout = null,
}) {
  const publicSettings = usePublicSettings();
  const { canParticipateContextComments = true } = useSession();
  const { plants = [], zones = [], markers = [] } = useData();
  const contextCommentsEnabled = publicSettings?.modules?.context_comments_enabled !== false;
  const [search, setSearch] = useState('');
  const [group1, setGroup1] = useState('');
  const [group2, setGroup2] = useState('');
  const [group3, setGroup3] = useState('');
  const [habitatFilter, setHabitatFilter] = useState('');
  const [agroFilter, setAgroFilter] = useState('');
  const [zonePresence, setZonePresence] = useState(ZONE_PRESENCE_FILTER.ALL);
  const [plantObservationCounts, setPlantObservationCounts] = useState(() => ({}));
  const { isHelpEnabled, hasSeenSection, markSectionSeen, trackPanelOpen, trackPanelDismiss } = useHelp({ publicSettings, isTeacher: false });

  const structured = useMemo(
    () => ({
      group1,
      group2,
      group3,
      habitat: habitatFilter,
      agroecosystemCategory: agroFilter,
    }),
    [group1, group2, group3, habitatFilter, agroFilter],
  );

  const queryTrimmedLower = search.trim().toLowerCase();

  const filtered = useMemo(
    () =>
      plants.filter((p) =>
        plantMatchesAllFilters(p, { structured, queryTrimmedLower, zonePresence }, zones, markers),
      ),
    [plants, structured, queryTrimmedLower, zonePresence, zones, markers],
  );

  const biodivObservationPlantIdsStudent = useMemo(() => {
    const ids = filtered.map((p) => Number(p.id)).filter((n) => Number.isFinite(n) && n > 0);
    ids.sort((a, b) => a - b);
    return ids;
  }, [filtered]);
  const biodivObservationIdsKeyStudent = biodivObservationPlantIdsStudent.join(',');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (biodivObservationPlantIdsStudent.length === 0) {
        if (!cancelled) setPlantObservationCounts({});
        return;
      }
      const counts = await fetchPlantObservationCounts(biodivObservationPlantIdsStudent);
      if (!cancelled) setPlantObservationCounts(counts);
    };
    load();
    if (typeof window !== 'undefined') {
      window.addEventListener('foretmap_session_changed', load);
      return () => {
        cancelled = true;
        window.removeEventListener('foretmap_session_changed', load);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [biodivObservationIdsKeyStudent, plants.length]);

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <h2 className="section-title">🌱 Catalogue de biodiversité</h2>
        {isHelpEnabled && (
          <HelpPanel
            sectionId="plants"
            title={HELP_PANELS.plants.title}
            entries={HELP_PANELS.plants.items}
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
        search={search}
        setSearch={setSearch}
        group1={group1}
        setGroup1={setGroup1}
        group2={group2}
        setGroup2={setGroup2}
        group3={group3}
        setGroup3={setGroup3}
        habitat={habitatFilter}
        setHabitat={setHabitatFilter}
        agro={agroFilter}
        setAgro={setAgroFilter}
        zonePresence={zonePresence}
        setZonePresence={setZonePresence}
      />

      {filtered.length === 0
        ? <div className="empty"><div className="empty-icon">🌿</div><p>Aucun être vivant ne colle à ta recherche — essaie un autre mot.</p></div>
        : <div className="biodiv-grid">
          {filtered.map((p) => (
            <PlantBiodiversityCatalogPreviewCard
              key={p.id}
              plant={p}
              zones={zones}
              markers={markers}
              maps={maps}
              myObservationCount={plantObservationCounts[String(p.id)]?.my_observation_count ?? 0}
              siteObservationCount={plantObservationCounts[String(p.id)]?.site_observation_count ?? 0}
              onObservationAcknowledged={(id, next) => {
                setPlantObservationCounts((prev) => ({
                  ...prev,
                  [String(id)]: {
                    my_observation_count: next.my_observation_count,
                    site_observation_count: next.site_observation_count,
                  },
                }));
              }}
              contextCommentsEnabled={contextCommentsEnabled}
              canParticipateContextComments={canParticipateContextComments}
              onForceLogout={onForceLogout}
              showContextComments
              dataBiodivPlantId={null}
            />
          ))}
        </div>
      }
    </div>
  );
}

export {
  TimedToast as Toast,
  Lightbox,
  PhotoGallery,
  ZoneInfoModal,
  ZoneDrawModal,
  MarkerModal,
  MapView,
  TaskFormModal,
  TasksView,
  LogModal,
  TaskLogsViewer,
  PlantEditForm,
  PlantManager,
  ObservationNotebook,
  PlantViewer,
  PlantCatalogPreviewModal,
};
