import React, { useState, useEffect, useMemo, useRef } from 'react';
import { api, AccountDeletedError } from '../services/api';
import { SPECIAL_EMOJI, SPECIAL_DESC, TREE_LEGEND, TREE_DOTS } from '../constants/garden';
import { PLANT_EMOJIS } from '../constants/emojis';
import { compressImage } from '../utils/image';
import { useHelp } from '../hooks/useHelp';
import { TaskFormModal, TasksView, LogModal, TaskLogsViewer } from './tasks-views';
import { Lightbox, PhotoGallery, ZoneInfoModal, ZoneDrawModal, MarkerModal, MapView } from './map-views';
import { Tooltip } from './Tooltip';
import { HelpPanel } from './HelpPanel';
import { HELP_PANELS, HELP_TOOLTIPS, resolveRoleText } from '../constants/help';

// ── TOAST ──────────────────────────────────────────────────────────────────
function Toast({ msg, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2400); return () => clearTimeout(t); }, []);
  return <div className="toast" role="status" aria-live="polite" aria-atomic="true">{msg}</div>;
}

// ── INTERACTIVE MAP ──────────────────────────────────────────────────────────


const EMPTY_PLANT_FORM = {
  name: '',
  emoji: '🌱',
  description: '',
  second_name: '',
  scientific_name: '',
  group_1: '',
  group_2: '',
  group_3: '',
  habitat: '',
  photo: '',
  nutrition: '',
  agroecosystem_category: '',
  longevity: '',
  remark_1: '',
  remark_2: '',
  remark_3: '',
  reproduction: '',
  size: '',
  sources: '',
  ideal_temperature_c: '',
  optimal_ph: '',
  ecosystem_role: '',
  geographic_origin: '',
  human_utility: '',
  harvest_part: '',
  planting_recommendations: '',
  preferred_nutrients: '',
  photo_species: '',
  photo_leaf: '',
  photo_flower: '',
  photo_fruit: '',
  photo_harvest_part: '',
};
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

const PLANT_META_SECTIONS = [
  {
    title: 'Identité',
    items: [
      { key: 'second_name', label: 'Deuxième nom' },
      { key: 'scientific_name', label: 'Nom scientifique' },
      { key: 'group_1', label: 'Groupe 1' },
      { key: 'group_2', label: 'Groupe 2' },
      { key: 'group_3', label: 'Groupe 3' },
      { key: 'geographic_origin', label: 'Origine géographique' },
      { key: 'longevity', label: 'Longévité' },
      { key: 'size', label: 'Taille' },
      { key: 'reproduction', label: 'Reproduction' },
      { key: 'remark_1', label: 'Remarque 1' },
      { key: 'remark_2', label: 'Remarque 2' },
      { key: 'remark_3', label: 'Remarque 3' },
    ],
  },
  {
    title: 'Écologie et usages',
    items: [
      { key: 'habitat', label: 'Habitat' },
      { key: 'agroecosystem_category', label: "Catégorie de l'agrosystème" },
      { key: 'harvest_part', label: 'Partie à récolter' },
      { key: 'planting_recommendations', label: 'Recommandations de plantation' },
      { key: 'preferred_nutrients', label: 'Nutriments préférés' },
      { key: 'nutrition', label: 'Nutrition' },
      { key: 'ideal_temperature_c', label: 'Température idéale (°C)' },
      { key: 'optimal_ph', label: 'pH optimal' },
    ],
  },
  {
    title: 'Ressources',
    items: [
      { key: 'sources', label: 'Sources', links: true },
      { key: 'photo', label: 'Photo', links: true },
      { key: 'photo_species', label: 'Photo espèce', links: true },
      { key: 'photo_leaf', label: 'Photo feuille', links: true },
      { key: 'photo_flower', label: 'Photo fleur', links: true },
      { key: 'photo_fruit', label: 'Photo fruit', links: true },
      { key: 'photo_harvest_part', label: 'Photo partie à récolter', links: true },
    ],
  },
];

const PHOTO_FIELD_KEYS = new Set([
  'photo',
  'photo_species',
  'photo_leaf',
  'photo_flower',
  'photo_fruit',
  'photo_harvest_part',
]);

function normalizedPlantValue(value) {
  if (value == null) return '';
  const s = String(value).trim();
  if (!s || s === '-') return '';
  return s;
}

function extractPlantForm(plant = {}) {
  const form = { ...EMPTY_PLANT_FORM };
  Object.keys(form).forEach((k) => {
    form[k] = normalizedPlantValue(plant[k]);
  });
  if (!form.emoji) form.emoji = '🌱';
  return form;
}

function parseLinkCandidates(value) {
  return normalizedPlantValue(value)
    .split(/\n|,\s*/)
    .map(s => s.trim())
    .filter(Boolean);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Lecture du fichier impossible'));
    reader.readAsDataURL(file);
  });
}

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

function isHttpLink(value) {
  return /^https?:\/\//i.test(value);
}

function isLocalUploadsPath(value) {
  return /^\/uploads\/[^?#\s]+/i.test(value);
}

function isLikelyDirectImageUrl(value) {
  if (isLocalUploadsPath(value)) {
    return /\.(avif|bmp|gif|jpe?g|png|svg|webp)(?:$|\?)/i.test(value);
  }
  if (!isHttpLink(value)) return false;
  try {
    const url = new URL(value);
    const path = url.pathname.toLowerCase();
    // Accepte les URLs pointant vers un fichier image direct
    // ou les liens Wikimedia FilePath (binaire direct).
    if (/\.(avif|bmp|gif|jpe?g|png|svg|webp)$/.test(path)) return true;
    if (/\/wiki\/special:filepath\//.test(path)) return true;
    return false;
  } catch {
    return false;
  }
}

function getSourceLabel(value) {
  if (isLocalUploadsPath(value)) return 'fichier local';
  try {
    const url = new URL(value);
    return url.hostname.replace(/^www\./i, '');
  } catch {
    return value;
  }
}

/** Grand groupe catalogue type « Végétal (Chlorobiontes) » — nutrition souvent redondante (autotrophe). */
function isVegetalCatalogEntry(plant) {
  const g1 = (normalizedPlantValue(plant.group_1) || '').toLowerCase();
  return g1.includes('végétal');
}

function PlantSummaryBadges({ plant }) {
  const chips = [];
  const nutrition = normalizedPlantValue(plant.nutrition);
  const preferredNutrients = normalizedPlantValue(plant.preferred_nutrients);
  const temp = normalizedPlantValue(plant.ideal_temperature_c);
  const ph = normalizedPlantValue(plant.optimal_ph);
  if (isVegetalCatalogEntry(plant)) {
    if (preferredNutrients) chips.push(`🍽️ ${preferredNutrients}`);
  } else if (nutrition) {
    chips.push(`🍽️ ${nutrition}`);
  }
  if (temp) chips.push(`🌡️ ${temp}°C`);
  if (ph) chips.push(`🧪 pH ${ph}`);
  if (chips.length === 0) return null;
  return (
    <div className="plant-badges">
      {chips.slice(0, 3).map(chip => (
        <span key={chip} className="plant-badge">{chip}</span>
      ))}
    </div>
  );
}

/** Rôle écologique et utilité humaine, affichés à la suite de la description (hors blocs repliables). */
function PlantEcosystemHumanLead({ plant }) {
  const role = normalizedPlantValue(plant.ecosystem_role);
  const utility = normalizedPlantValue(plant.human_utility);
  if (!role && !utility) return null;
  return (
    <div className="plant-ecology-lead">
      {role && (
        <div className="plant-meta-item">
          <div className="plant-meta-label">Rôle dans l'écosystème</div>
          <div className="plant-meta-value">{role}</div>
        </div>
      )}
      {utility && (
        <div className="plant-meta-item">
          <div className="plant-meta-label">Utilité pour l'être humain</div>
          <div className="plant-meta-value">{utility}</div>
        </div>
      )}
    </div>
  );
}

function PlantMetaSections({ plant }) {
  const [bigPhoto, setBigPhoto] = useState(null);

  const renderPhotoLinks = (item, entries) => (
    <div className="plant-photo-grid">
      {entries.map((entry, idx) => (
        <button
          key={`${item.key}-${idx}`}
          type="button"
          className="plant-photo-thumb"
          onClick={() => setBigPhoto({ src: entry.src, caption: item.label })}>
          <img src={entry.src} alt={item.label} loading="lazy" />
          <span className="plant-photo-overlay">🔍 Voir</span>
        </button>
      ))}
    </div>
  );

  return (
    <>
      {bigPhoto && <Lightbox src={bigPhoto.src} caption={bigPhoto.caption} onClose={() => setBigPhoto(null)} />}
      {PLANT_META_SECTIONS.map(section => {
        const values = section.items
          .map(item => ({ ...item, value: normalizedPlantValue(plant[item.key]) }))
          .filter(item => !!item.value);
        if (values.length === 0) return null;
        return (
          <details key={section.title} className="plant-more">
            <summary>{section.title}</summary>
            <div className="plant-meta-grid">
              {values.map(item => (
                <div key={item.key} className="plant-meta-item">
                  <div className="plant-meta-label">{item.label}</div>
                  {item.links ? (
                    <div className="plant-links">
                      {(() => {
                        const entries = parseLinkCandidates(item.value);
                        const photoEntries = entries.filter((entry) => isHttpLink(entry) || isLocalUploadsPath(entry));

                        if (PHOTO_FIELD_KEYS.has(item.key) && photoEntries.length > 0) {
                          const imageEntries = photoEntries
                            .filter(isLikelyDirectImageUrl)
                            .map((entry) => ({ src: entry, source: entry }));
                          const pageEntries = photoEntries.filter((entry) => !isLikelyDirectImageUrl(entry));
                          return (
                            <>
                              {imageEntries.length > 0 && renderPhotoLinks(item, imageEntries)}
                              {pageEntries.map((entry, idx) => (
                                <a
                                  key={`${item.key}-page-${idx}`}
                                  href={entry}
                                  target="_blank"
                                  rel="noreferrer"
                                  title={entry}>
                                  {getSourceLabel(entry)}
                                </a>
                              ))}
                            </>
                          );
                        }

                        return entries.map((entry, idx) => (
                          isHttpLink(entry)
                            ? (
                              <a
                                key={`${item.key}-${idx}`}
                                href={entry}
                                target="_blank"
                                rel="noreferrer"
                                className={item.key === 'sources' ? 'plant-source-link' : undefined}
                                title={entry}>
                                {item.key === 'sources' ? getSourceLabel(entry) : entry}
                              </a>
                            )
                            : <span key={`${item.key}-${idx}`}>{entry}</span>
                        ));
                      })()}
                    </div>
                  ) : (
                    <div className="plant-meta-value">{item.value}</div>
                  )}
                </div>
              ))}
            </div>
          </details>
        );
      })}
    </>
  );
}

// ── PLANT EDIT FORM (outside PlantManager to avoid remount on every keystroke) ──
function PlantEditForm({ title, form, setForm, onSave, onCancel, saving, plantId, onToast }) {
  const set = k => e => setForm(f => ({...f, [k]: e.target.value}));
  const [uploadingField, setUploadingField] = useState('');

  const photoFields = [
    { key: 'photo_species', label: 'Photo espèce' },
    { key: 'photo_leaf', label: 'Photo feuille' },
    { key: 'photo_flower', label: 'Photo fleur' },
    { key: 'photo_fruit', label: 'Photo fruit' },
    { key: 'photo_harvest_part', label: 'Photo partie récoltée' },
    { key: 'photo', label: 'Photo' },
  ];

  const uploadPhoto = async (field, file) => {
    if (!file) return;
    if (!plantId) {
      onToast?.('Crée d\'abord la fiche, puis ajoute les photos.');
      return;
    }
    setUploadingField(field);
    try {
      const imageData = await compressImage(file, 1600, 0.82);
      const result = await api(`/api/plants/${plantId}/photo-upload`, 'POST', { field, imageData });
      setForm((prev) => ({ ...prev, [field]: result?.url || prev[field] }));
      onToast?.('Photo importée ✓');
    } catch (e) {
      onToast?.('Erreur import photo : ' + e.message);
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
      <div className="field"><label>Description d'identification</label>
        <textarea value={form.description} onChange={set('description')} rows={3}
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
        <div className="field"><label>Groupe 1</label><input value={form.group_1} onChange={set('group_1')} placeholder="Végétal / Animal..."/></div>
        <div className="field"><label>Groupe 2</label><input value={form.group_2} onChange={set('group_2')} placeholder="Angiosperme..."/></div>
        <div className="field"><label>Groupe 3</label><input value={form.group_3} onChange={set('group_3')} placeholder="Famille..."/></div>
      </div>
      <div className="field"><label>Rôle dans l'écosystème</label><textarea value={form.ecosystem_role} onChange={set('ecosystem_role')} rows={2} placeholder="Fonction écologique principale"/></div>
      <div className="field"><label>Utilité pour l'être humain</label><textarea value={form.human_utility} onChange={set('human_utility')} rows={2} placeholder="Usages alimentaires, pédagogiques..."/></div>
      <div className="field"><label>Recommandations de plantation</label><textarea value={form.planting_recommendations} onChange={set('planting_recommendations')} rows={2} placeholder="Semis, exposition, espacement..."/></div>
      <div className="field"><label>Nutriments préférés</label><textarea value={form.preferred_nutrients} onChange={set('preferred_nutrients')} rows={2} placeholder="Azote, phosphore, potassium..."/></div>
      <div className="field"><label>Sources</label><textarea value={form.sources} onChange={set('sources')} rows={2} placeholder="URL ou références, séparées par virgules"/></div>
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
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                {uploadingField === field.key ? 'Upload...' : '📤 Charger un fichier'}
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  disabled={saving || uploadingField === field.key}
                  onChange={(e) => {
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

// ── PLANT MANAGER (teacher) ───────────────────────────────────────────────────
function PlantManager({ plants, onRefresh, publicSettings = null }) {
  const [editId,  setEditId]  = useState(null);
  const [form,    setForm]    = useState({ ...EMPTY_PLANT_FORM });
  const [showAdd, setShowAdd] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [toast,   setToast]   = useState(null);
  const [search,  setSearch]  = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [importSource, setImportSource] = useState('file');
  const [importStrategy, setImportStrategy] = useState('upsert_name');
  const [importFile, setImportFile] = useState(null);
  const [gsheetUrl, setGsheetUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [confirmReplaceAll, setConfirmReplaceAll] = useState(false);
  const [importReport, setImportReport] = useState(null);
  const { isHelpEnabled, hasSeenSection, markSectionSeen, trackPanelOpen, trackPanelDismiss } = useHelp({ publicSettings, isTeacher: true });
  const tooltipText = (entry) => resolveRoleText(entry, true);

  const groupOptions = [...new Set(
    plants
      .map(p => normalizedPlantValue(p.group_1))
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));

  const filteredPlants = plants.filter((p) => {
    const matchesGroup = !groupFilter || normalizedPlantValue(p.group_1) === groupFilter;
    if (!matchesGroup) return false;

    const query = search.trim().toLowerCase();
    if (!query) return true;

    return (
      normalizedPlantValue(p.name).toLowerCase().includes(query) ||
      normalizedPlantValue(p.description).toLowerCase().includes(query) ||
      normalizedPlantValue(p.scientific_name).toLowerCase().includes(query) ||
      normalizedPlantValue(p.group_1).toLowerCase().includes(query) ||
      normalizedPlantValue(p.group_2).toLowerCase().includes(query) ||
      normalizedPlantValue(p.group_3).toLowerCase().includes(query)
    );
  });

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
      {toast && <Toast msg={toast} onDone={() => setToast(null)}/>}
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

      <div style={{display:'grid', gap:8, marginBottom:12}}>
        <div className="field" style={{marginBottom:0}}>
          <label>Grand groupe</label>
          <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)} style={{background:'white'}}>
            <option value="">Tous les groupes</option>
            {groupOptions.map(group => <option key={group} value={group}>{group}</option>)}
          </select>
        </div>
        <div className="field" style={{marginBottom:0}}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Rechercher dans la biodiversité..."
            style={{background:'white'}}
          />
        </div>
      </div>

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
        />
      )}

      <div className="biodiv-grid">
        {filteredPlants.map(p => (
          <div key={p.id}>
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
                  {normalizedPlantValue(p.group_1) && (
                    <span className="task-chip">{p.group_1}</span>
                  )}
                </div>

                <div className="biodiv-card-body">
                  <p className="plant-row-desc">{p.description || <em style={{color:'#bbb'}}>Pas de description</em>}</p>
                  <PlantEcosystemHumanLead plant={p} />
                  <div className="task-meta">
                    {normalizedPlantValue(p.habitat) && <span className="task-chip">🏡 {p.habitat}</span>}
                    {normalizedPlantValue(p.agroecosystem_category) && <span className="task-chip">🌍 {p.agroecosystem_category}</span>}
                  </div>
                  <PlantSummaryBadges plant={p}/>
                  <PlantMetaSections plant={p}/>
                </div>

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
        ))}
      </div>
    </div>
  );
}

// ── OBSERVATION NOTEBOOK (student) ────────────────────────────────────────────
function ObservationNotebook({ student, zones, onForceLogout = null }) {
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
  const fileRef = useRef();

  const load = async () => {
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
    setLoading(false);
  };

  useEffect(() => { load(); }, [student.id]);

  const handleFile = e => {
    const file = e.target.files[0];
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
      {toast && <Toast msg={toast} onDone={() => setToast(null)}/>}
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
            <textarea value={content} onChange={e => setContent(e.target.value)} rows={3}
              placeholder="Qu'as-tu observé ? Croissance, insectes, couleur des feuilles..." autoFocus/>
          </div>
          <div className="field"><label>Photo (optionnel)</label>
            {!preview ? (
              <div className="img-upload-area" onClick={() => fileRef.current.click()}>
                <div style={{fontSize:'1.5rem', marginBottom:4}}>📷</div>
                <div style={{fontSize:'.82rem', color:'#888'}}>Ajouter une photo</div>
                <input ref={fileRef} type="file" accept="image/*" onChange={handleFile}/>
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
              <div className="obs-content">{e.content}</div>
              {e.zone_name && <div className="obs-zone">📍 {e.zone_name}</div>}
              {e.image_url && <img src={e.image_url} alt="observation" style={{width:'100%',borderRadius:8,marginTop:8,maxHeight:200,objectFit:'cover'}}/>}
            </div>
          ))
      }
    </div>
  );
}

// ── PLANT VIEWER (student read-only) ──────────────────────────────────────────
function PlantViewer({ plants, zones, publicSettings = null }) {
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const { isHelpEnabled, hasSeenSection, markSectionSeen, trackPanelOpen, trackPanelDismiss } = useHelp({ publicSettings, isTeacher: false });

  const groupOptions = [...new Set(
    plants
      .map(p => normalizedPlantValue(p.group_1))
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));

  const filtered = plants.filter(p => {
    const matchesGroup = !groupFilter || normalizedPlantValue(p.group_1) === groupFilter;
    if (!matchesGroup) return false;

    const query = search.trim().toLowerCase();
    if (!query) return true;

    return (
      normalizedPlantValue(p.name).toLowerCase().includes(query) ||
      normalizedPlantValue(p.description).toLowerCase().includes(query) ||
      normalizedPlantValue(p.scientific_name).toLowerCase().includes(query) ||
      normalizedPlantValue(p.habitat).toLowerCase().includes(query) ||
      normalizedPlantValue(p.group_1).toLowerCase().includes(query) ||
      normalizedPlantValue(p.group_2).toLowerCase().includes(query) ||
      normalizedPlantValue(p.group_3).toLowerCase().includes(query)
    );
  });

  const zonesForPlant = p => zones.filter(z => z.current_plant === p.name);

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
      <p className="section-sub">{plants.length} espèces dans la forêt</p>

      <div style={{display:'grid', gap:8, marginBottom:12}}>
        <div className="field" style={{marginBottom:0}}>
          <label>Grand groupe</label>
          <select value={groupFilter} onChange={e => setGroupFilter(e.target.value)} style={{background:'white'}}>
            <option value="">Tous les groupes</option>
            {groupOptions.map(group => <option key={group} value={group}>{group}</option>)}
          </select>
        </div>
        <div className="field" style={{marginBottom:0}}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Chercher un être vivant..." style={{background:'white'}}/>
        </div>
      </div>

      {filtered.length === 0
        ? <div className="empty"><div className="empty-icon">🌿</div><p>Aucun être vivant ne colle à ta recherche — essaie un autre mot.</p></div>
        : <div className="biodiv-grid">
          {filtered.map(p => {
            const pZones = zonesForPlant(p);
            return (
              <article key={p.id} className="biodiv-card fade-in">
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
                  {normalizedPlantValue(p.group_1) && (
                    <span className="task-chip">{p.group_1}</span>
                  )}
                </div>

                <div className="biodiv-card-body">
                  <p className="plant-row-desc">{p.description || <em style={{ color: '#bbb' }}>Pas de description</em>}</p>
                  <PlantEcosystemHumanLead plant={p} />
                  <div className="task-meta">
                    {normalizedPlantValue(p.habitat) && <span className="task-chip">🏡 {p.habitat}</span>}
                    {normalizedPlantValue(p.agroecosystem_category) && <span className="task-chip">🌍 {p.agroecosystem_category}</span>}
                  </div>
                  <PlantSummaryBadges plant={p} />
                  <PlantMetaSections plant={p} />
                  {pZones.length > 0 ? (
                    <div>
                      <div style={{ fontSize: '.74rem', fontWeight: 700, color: '#aaa', textTransform: 'uppercase', marginBottom: 4 }}>Zones associées</div>
                      <div className="plant-zones">
                        {pZones.map(z => <span key={z.id} className="plant-zone-chip">📍 {z.name}</span>)}
                      </div>
                    </div>
                  ) : (
                    <p style={{ fontSize: '.82rem', color: '#bbb', fontStyle: 'italic' }}>Pas encore associé à une zone</p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      }
    </div>
  );
}

export {
  Toast,
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
};
