import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useOverlayHistoryBack } from '../hooks/useOverlayHistoryBack';
import { api, AccountDeletedError } from '../services/api';
import { SPECIAL_EMOJI, SPECIAL_DESC, TREE_LEGEND, TREE_DOTS } from '../constants/garden';
import { PLANT_EMOJIS } from '../constants/emojis';
import { compressImage } from '../utils/image';
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
  group_4: '',
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

const PLANT_META_SECTIONS = [
  {
    title: 'Identité',
    items: [
      { key: 'second_name', label: 'Deuxième nom' },
      { key: 'scientific_name', label: 'Nom scientifique' },
      { key: 'group_1', label: 'Groupe (taxon) 1' },
      { key: 'group_2', label: 'Groupe (taxon) 2' },
      { key: 'group_3', label: 'Groupe (taxon) 3' },
      { key: 'group_4', label: 'Groupe (taxon) 4' },
      { key: 'geographic_origin', label: 'Origine géographique' },
      { key: 'longevity', label: 'Longévité' },
      { key: 'size', label: 'Taille' },
      { key: 'reproduction', label: 'Reproduction' },
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

const SPECIES_PREFILL_FIELDS = [
  'name',
  'scientific_name',
  'second_name',
  'description',
  'group_1',
  'group_2',
  'group_3',
  'group_4',
  'habitat',
  'agroecosystem_category',
  'nutrition',
  'longevity',
  'reproduction',
  'size',
  'ideal_temperature_c',
  'optimal_ph',
  'ecosystem_role',
  'geographic_origin',
  'human_utility',
  'harvest_part',
  'planting_recommendations',
  'preferred_nutrients',
  'sources',
];

const SPECIES_PREFILL_FIELD_LABELS = {
  name: 'Nom',
  scientific_name: 'Nom scientifique',
  second_name: 'Deuxième nom',
  description: "Description d'identification",
  group_1: 'Groupe (taxon) 1',
  group_2: 'Groupe (taxon) 2',
  group_3: 'Groupe (taxon) 3',
  group_4: 'Groupe (taxon) 4',
  habitat: 'Habitat',
  agroecosystem_category: 'Catégorie agrosystème',
  nutrition: 'Nutrition',
  longevity: 'Longévité',
  reproduction: 'Reproduction',
  size: 'Taille',
  ideal_temperature_c: 'Température idéale (°C)',
  optimal_ph: 'pH optimal',
  ecosystem_role: "Rôle dans l'écosystème",
  geographic_origin: 'Origine géographique',
  human_utility: "Utilité pour l'être humain",
  harvest_part: 'Partie à récolter',
  planting_recommendations: 'Recommandations de plantation',
  preferred_nutrients: 'Nutriments préférés',
  sources: 'Sources',
  photo: 'Photo',
  photo_species: 'Photo espèce',
  photo_leaf: 'Photo feuille',
  photo_flower: 'Photo fleur',
  photo_fruit: 'Photo fruit',
  photo_harvest_part: 'Photo partie récoltée',
};

/** Champs photo du formulaire (ordre affichage upload + menu pré-saisie). */
const PLANT_PHOTO_FIELD_OPTIONS = [
  { key: 'photo_species', label: 'Photo espèce' },
  { key: 'photo_leaf', label: 'Photo feuille' },
  { key: 'photo_flower', label: 'Photo fleur' },
  { key: 'photo_fruit', label: 'Photo fruit' },
  { key: 'photo_harvest_part', label: 'Photo partie récoltée' },
  { key: 'photo', label: 'Photo (générale)' },
];

function prefillPhotoSlotKey(field, idx) {
  return `${String(field).trim()}:${Number(idx)}`;
}

/** Champs candidats pour la vignette « photo principale » sous la description (ordre de priorité). */
const BIODIV_HERO_PHOTO_KEYS = ['photo', 'photo_species'];

function findFirstBiodivHeroPhotoCandidate(plant) {
  for (const key of BIODIV_HERO_PHOTO_KEYS) {
    const entries = parseLinkCandidates(plant[key]).filter((e) => isHttpLink(e) || isLocalUploadsPath(e));
    for (const entry of entries) {
      if (isLikelyDirectImageUrl(entry)) return { kind: 'direct', src: entry };
      const fileSrc = commonsFilePageToDisplaySrc(entry);
      if (fileSrc) return { kind: 'direct', src: fileSrc };
      if (parseCommonsCategoryFromUrl(entry)) return { kind: 'category', categoryUrl: entry };
    }
  }
  return null;
}

function normalizedPlantValue(value) {
  if (value == null) return '';
  const s = String(value).trim();
  if (!s || s === '-') return '';
  return s;
}

/** Libellé « Potager » souvent identique sur toutes les fiches — masqué en pastille (pas le lien carte). */
function isGenericPotagerLabel(value) {
  return normalizedPlantValue(value).toLowerCase() === 'potager';
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

/** Page fichier Commons /wiki/File:… → URL affichable en miniature (redirige vers le binaire). */
function parseCommonsFilePageFromUrl(value) {
  if (!isHttpLink(value)) return null;
  try {
    const url = new URL(value);
    if (!/^(?:www\.)?commons\.wikimedia\.org$/i.test(url.hostname)) return null;
    const m = url.pathname.match(/^\/wiki\/File:(.+)$/i);
    if (!m) return null;
    return m[1];
  } catch {
    return null;
  }
}

function commonsFilePageToDisplaySrc(value) {
  const fileTitle = parseCommonsFilePageFromUrl(value);
  if (!fileTitle) return null;
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${fileTitle}`;
}

function parseCommonsCategoryFromUrl(value) {
  if (!isHttpLink(value)) return null;
  try {
    const url = new URL(value);
    if (!/^(?:www\.)?commons\.wikimedia\.org$/i.test(url.hostname)) return null;
    const m = url.pathname.match(/^\/wiki\/(Category:.+)$/i);
    if (!m) return null;
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

async function fetchCommonsCategoryPreview(urlValue) {
  const categoryTitle = parseCommonsCategoryFromUrl(urlValue);
  if (!categoryTitle) return null;
  const endpoint = new URL('https://commons.wikimedia.org/w/api.php');
  endpoint.searchParams.set('action', 'query');
  endpoint.searchParams.set('format', 'json');
  endpoint.searchParams.set('origin', '*');
  endpoint.searchParams.set('generator', 'categorymembers');
  endpoint.searchParams.set('gcmtype', 'file');
  endpoint.searchParams.set('gcmtitle', categoryTitle);
  endpoint.searchParams.set('gcmlimit', '1');
  endpoint.searchParams.set('prop', 'imageinfo');
  endpoint.searchParams.set('iiprop', 'url');
  endpoint.searchParams.set('iiurlwidth', '1200');
  const res = await fetch(endpoint.toString());
  if (!res.ok) return null;
  const data = await res.json();
  const pages = data?.query?.pages ? Object.values(data.query.pages) : [];
  const first = pages[0];
  const info = first?.imageinfo?.[0];
  return info?.thumburl || info?.url || null;
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

/** Groupe (taxon) 1 catalogue type « Végétal (Chlorobiontes) » — nutrition souvent redondante (autotrophe). */
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

/** Photo principale (champ `photo` puis `photo_species`) entre description brève et bloc écologie. */
function PlantBiodivHeroPhoto({ plant }) {
  const [lightbox, setLightbox] = useState(null);
  const candidate = useMemo(() => findFirstBiodivHeroPhotoCandidate(plant), [plant]);
  const [categorySrc, setCategorySrc] = useState(null);

  useEffect(() => {
    setCategorySrc(null);
    if (!candidate || candidate.kind !== 'category') return undefined;
    let cancelled = false;
    (async () => {
      const thumb = await fetchCommonsCategoryPreview(candidate.categoryUrl);
      if (!cancelled) setCategorySrc(thumb);
    })();
    return () => { cancelled = true; };
  }, [candidate]);

  if (!candidate) return null;
  const src = candidate.kind === 'direct' ? candidate.src : categorySrc;
  if (!src) return null;

  const name = normalizedPlantValue(plant.name) || 'Espèce';

  return (
    <>
      {lightbox && (
        <Lightbox
          src={lightbox.src}
          caption={lightbox.caption}
          onClose={() => setLightbox(null)}
        />
      )}
      <button
        type="button"
        className="biodiv-card-hero-photo-wrap"
        onClick={() => setLightbox({ src, caption: `Photo — ${name}` })}
        aria-label={`Agrandir la photo de ${name}`}
      >
        <img src={src} alt="" className="biodiv-card-hero-photo" loading="lazy" />
        <span className="biodiv-card-hero-photo-hint" aria-hidden="true">🔍 Voir</span>
      </button>
    </>
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
  const [commonsPreviewByUrl, setCommonsPreviewByUrl] = useState({});

  const plantPhotoLinks = useMemo(() => {
    const links = [];
    for (const section of PLANT_META_SECTIONS) {
      for (const item of section.items) {
        if (!PHOTO_FIELD_KEYS.has(item.key)) continue;
        const entries = parseLinkCandidates(plant[item.key]).filter(
          (entry) => isHttpLink(entry) || isLocalUploadsPath(entry)
        );
        for (const entry of entries) links.push(entry);
      }
    }
    return Array.from(new Set(links));
  }, [plant]);

  useEffect(() => {
    let cancelled = false;
    const categoryLinks = plantPhotoLinks.filter((entry) => !!parseCommonsCategoryFromUrl(entry));
    const missing = categoryLinks.filter(
      (entry) => !Object.prototype.hasOwnProperty.call(commonsPreviewByUrl, entry)
    );
    if (missing.length === 0) return () => { cancelled = true; };
    (async () => {
      const resolved = {};
      for (const link of missing) {
        try {
          resolved[link] = await fetchCommonsCategoryPreview(link);
        } catch {
          resolved[link] = null;
        }
      }
      if (!cancelled) {
        setCommonsPreviewByUrl((prev) => ({ ...prev, ...resolved }));
      }
    })();
    return () => { cancelled = true; };
  }, [plantPhotoLinks, commonsPreviewByUrl]);

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
                          const directImageEntries = photoEntries
                            .filter(isLikelyDirectImageUrl)
                            .map((entry) => ({ src: entry, source: entry }));
                          const commonsFileEntries = photoEntries
                            .map((entry) => {
                              const src = commonsFilePageToDisplaySrc(entry);
                              return src ? { src, source: entry } : null;
                            })
                            .filter(Boolean);
                          const commonsCategoryImageEntries = photoEntries
                            .filter((entry) => !!parseCommonsCategoryFromUrl(entry))
                            .map((entry) => ({
                              src: commonsPreviewByUrl[entry],
                              source: entry,
                            }))
                            .filter((entry) => !!entry.src);
                          const imageEntries = [
                            ...directImageEntries,
                            ...commonsFileEntries,
                            ...commonsCategoryImageEntries,
                          ];
                          const pageEntries = photoEntries.filter((entry) => {
                            if (isLikelyDirectImageUrl(entry)) return false;
                            if (commonsFilePageToDisplaySrc(entry)) return false;
                            if (parseCommonsCategoryFromUrl(entry) && commonsPreviewByUrl[entry]) return false;
                            return true;
                          });
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
function PlantEditForm({ title, form, setForm, onSave, onCancel, saving, plantId, onToast, onEnsurePlantId = null }) {
  const set = k => e => setForm(f => ({...f, [k]: e.target.value}));
  const [uploadingField, setUploadingField] = useState('');
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [prefillError, setPrefillError] = useState('');
  const [prefillResult, setPrefillResult] = useState(null);
  const [overwriteFilled, setOverwriteFilled] = useState(false);
  const [selectedFields, setSelectedFields] = useState({});
  /** Par emplacement `field:idx` : case cochée + champ cible au moment d’appliquer la pré-saisie. */
  const [prefillPhotoSelections, setPrefillPhotoSelections] = useState({});
  /** Clés `${field}:${idx}` pour masquer l’aperçu image après erreur de chargement. */
  const [prefillThumbBroken, setPrefillThumbBroken] = useState({});

  useEffect(() => {
    setPrefillThumbBroken({});
  }, [prefillResult]);

  const markPrefillThumbBroken = (field, idx) => {
    const k = `${field}:${idx}`;
    setPrefillThumbBroken((prev) => (prev[k] ? prev : { ...prev, [k]: true }));
  };

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
      const imageData = await compressImage(file, 1600, 0.82);
      const result = await api(`/api/plants/${targetId}/photo-upload`, 'POST', { field, imageData });
      setForm((prev) => ({ ...prev, [field]: result?.url || prev[field] }));
      onToast?.('Photo importée ✓');
    } catch (e) {
      onToast?.('Erreur import photo : ' + e.message);
    } finally {
      setUploadingField('');
    }
  };

  const groupedPrefillPhotos = useMemo(() => {
    const groups = {};
    for (const photo of prefillResult?.photos || []) {
      const field = String(photo?.field || '').trim();
      if (!field) continue;
      if (!groups[field]) groups[field] = [];
      groups[field].push(photo);
    }
    return groups;
  }, [prefillResult]);

  const prefillQuery = (form.scientific_name || form.name || '').trim();

  const requestPrefill = async () => {
    if (!prefillQuery || prefillQuery.length < 2) {
      onToast?.('Indique un nom (ou nom scientifique) avec au moins 2 caractères.');
      return;
    }
    setPrefillLoading(true);
    setPrefillError('');
    try {
      const hintParams = new URLSearchParams();
      hintParams.set('q', prefillQuery);
      const sciHint = String(form?.scientific_name || '').trim();
      const nameHint = String(form?.name || '').trim();
      if (sciHint) hintParams.set('hint_scientific', sciHint.slice(0, 120));
      if (nameHint) hintParams.set('hint_name', nameHint.slice(0, 120));
      const data = await api(`/api/plants/autofill?${hintParams.toString()}`);
      setPrefillResult(data || null);

      const nextFields = {};
      for (const key of SPECIES_PREFILL_FIELDS) {
        const value = String(data?.fields?.[key] || '').trim();
        if (!value) continue;
        const hasCurrentValue = String(form?.[key] || '').trim().length > 0;
        nextFields[key] = overwriteFilled ? true : !hasCurrentValue;
      }
      setSelectedFields(nextFields);

      const photosByField = {};
      for (const photo of data?.photos || []) {
        const field = String(photo?.field || '').trim();
        if (!field) continue;
        if (!photosByField[field]) photosByField[field] = [];
        photosByField[field].push(photo);
      }
      const nextPhotoSel = {};
      for (const [field, list] of Object.entries(photosByField)) {
        (list || []).forEach((_, idx) => {
          const slot = prefillPhotoSlotKey(field, idx);
          const defaultTarget = PHOTO_FIELD_KEYS.has(field) ? field : 'photo_species';
          nextPhotoSel[slot] = { checked: idx === 0, assignTo: defaultTarget };
        });
      }
      setPrefillPhotoSelections(nextPhotoSel);
    } catch (e) {
      setPrefillResult(null);
      setPrefillError(e?.message || 'Erreur de pré-saisie');
    } finally {
      setPrefillLoading(false);
    }
  };

  const toggleFieldSelection = (key) => {
    setSelectedFields((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const applyPrefill = () => {
    if (!prefillResult) return;
    setForm((prev) => {
      const next = { ...prev };
      for (const key of SPECIES_PREFILL_FIELDS) {
        if (!selectedFields[key]) continue;
        const value = String(prefillResult?.fields?.[key] || '').trim();
        if (!value) continue;
        const hasCurrentValue = String(prev?.[key] || '').trim().length > 0;
        if (!hasCurrentValue || overwriteFilled) {
          next[key] = value;
        }
      }

      const mergedSources = parseLinkCandidates(next.sources);
      const picked = [];
      for (const [slotKey, sel] of Object.entries(prefillPhotoSelections || {})) {
        if (!sel?.checked) continue;
        const colon = slotKey.lastIndexOf(':');
        if (colon <= 0) continue;
        const sourceField = slotKey.slice(0, colon);
        const idx = Number(slotKey.slice(colon + 1));
        if (!Number.isFinite(idx)) continue;
        const options = groupedPrefillPhotos[sourceField] || [];
        const selected = options[idx];
        if (!selected?.url) continue;
        const assignTo = PHOTO_FIELD_KEYS.has(sel.assignTo) ? sel.assignTo : sourceField;
        picked.push({ assignTo, url: selected.url, source_url: selected.source_url });
      }
      picked.sort((a, b) => a.assignTo.localeCompare(b.assignTo) || String(a.url).localeCompare(String(b.url)));
      const byTarget = new Map();
      for (const row of picked) {
        if (!byTarget.has(row.assignTo)) byTarget.set(row.assignTo, []);
        byTarget.get(row.assignTo).push(row);
      }
      for (const [targetField, rows] of byTarget) {
        const urls = [...new Set(rows.map((r) => r.url).filter(Boolean))];
        if (urls.length === 0) continue;
        const existing = parseLinkCandidates(next[targetField]);
        if (existing.length === 0 || overwriteFilled) {
          next[targetField] = urls.join('\n');
        } else {
          const merged = [...existing];
          for (const u of urls) {
            if (!merged.includes(u)) merged.push(u);
          }
          next[targetField] = merged.join('\n');
        }
        for (const row of rows) {
          if (row.source_url && !mergedSources.includes(row.source_url)) {
            mergedSources.push(row.source_url);
          }
        }
      }
      if (mergedSources.length > 0) {
        next.sources = mergedSources.join('\n');
      }
      return next;
    });
    onToast?.('Pré-saisie appliquée au formulaire ✓');
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
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={requestPrefill}
          disabled={saving || prefillLoading}
        >
          {prefillLoading ? 'Pré-saisie…' : '✨ Pré-saisir depuis sources externes'}
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.8rem', color: '#444' }}>
          <input
            type="checkbox"
            checked={overwriteFilled}
            onChange={(e) => setOverwriteFilled(e.target.checked)}
          />
          Autoriser l'écrasement des champs déjà remplis
        </label>
      </div>
      {prefillError && (
        <p style={{ marginTop: -4, marginBottom: 8, color: '#a94442', fontSize: '.83rem' }}>
          Pré-saisie indisponible: {prefillError}
        </p>
      )}
      {prefillResult && (
        <details className="plant-more" style={{ marginBottom: 10 }} open>
          <summary>
            Pré-saisie proposée — confiance {Math.round(Number(prefillResult?.confidence || 0) * 100)}%
          </summary>
          <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            {Array.isArray(prefillResult?.warnings) && prefillResult.warnings.length > 0 && (
              <div style={{ fontSize: '.8rem', color: '#7a5a13', background: '#fff9e5', borderRadius: 8, padding: '6px 8px' }}>
                {prefillResult.warnings.slice(0, 3).map((w, idx) => (
                  <div key={`prefill-warning-${idx}`}>- {w}</div>
                ))}
              </div>
            )}
            <div style={{ display: 'grid', gap: 6 }}>
              {SPECIES_PREFILL_FIELDS.map((key) => {
                const value = String(prefillResult?.fields?.[key] || '').trim();
                if (!value) return null;
                const sourceMeta = prefillResult?.field_sources?.[key];
                return (
                  <label key={`prefill-field-${key}`} style={{ display: 'grid', gap: 2 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="checkbox"
                        checked={!!selectedFields[key]}
                        onChange={() => toggleFieldSelection(key)}
                      />
                      <strong>{SPECIES_PREFILL_FIELD_LABELS[key] || key}</strong>
                      {sourceMeta?.source && (
                        <small style={{ color: '#666' }}>
                          ({sourceMeta.source}, {Math.round(Number(sourceMeta.confidence || 0) * 100)}%)
                        </small>
                      )}
                    </span>
                    <span style={{ fontSize: '.83rem', color: '#333', paddingLeft: 24 }}>{value}</span>
                  </label>
                );
              })}
            </div>
            {(() => {
              const empty = SPECIES_PREFILL_FIELDS.filter((k) => !String(prefillResult?.fields?.[k] || '').trim());
              if (empty.length === 0) return null;
              const labels = empty.slice(0, 14).map((k) => SPECIES_PREFILL_FIELD_LABELS[k] || k);
              const extra = empty.length > 14 ? ` (+${empty.length - 14} autres)` : '';
              return (
                <p style={{ fontSize: '.76rem', color: '#666', margin: 0, lineHeight: 1.35 }}>
                  Sans proposition automatique pour : {labels.join(', ')}{extra}. Les sources publiques ne couvrent pas toujours ces champs ; complément possible via saisie manuelle ou extensions documentées (voir la doc API).
                </p>
              );
            })()}
            {Object.keys(groupedPrefillPhotos).length > 0 && (
              <div style={{ display: 'grid', gap: 6 }}>
                <div>
                  <strong style={{ fontSize: '.9rem' }}>Photos proposées (aperçu + crédit / licence)</strong>
                  <p style={{ margin: '4px 0 0', fontSize: '.78rem', color: '#555', lineHeight: 1.35 }}>
                    Cochez une ou plusieurs images à importer. Le menu « Associer au champ » indique la case photo du formulaire cible (vous pouvez regrouper plusieurs images sur un même champ : les URL seront listées les unes sous les autres).
                  </p>
                </div>
                {Object.entries(groupedPrefillPhotos).map(([field, photos]) => (
                  <div key={`prefill-photo-${field}`} className="plant-prefill-photo-field">
                    <div className="plant-prefill-photo-field-title">
                      Suggestion source : {SPECIES_PREFILL_FIELD_LABELS[field] || field}
                    </div>
                    <div className="plant-prefill-photo-grid">
                      {photos.map((photo, idx) => {
                        const slotKey = prefillPhotoSlotKey(field, idx);
                        const thumbKey = slotKey;
                        const broken = !!prefillThumbBroken[thumbKey];
                        const slot = prefillPhotoSelections[slotKey] || { checked: false, assignTo: field };
                        const checked = !!slot.checked;
                        const assignTo = PHOTO_FIELD_KEYS.has(slot.assignTo) ? slot.assignTo : field;
                        return (
                          <div
                            key={slotKey}
                            className={`plant-prefill-photo-card${checked ? ' plant-prefill-photo-card--selected' : ''}`}
                          >
                            <div className="plant-prefill-photo-card-row">
                              <input
                                type="checkbox"
                                className="plant-prefill-photo-check"
                                checked={checked}
                                aria-label={`Inclure cette proposition dans la pré-saisie (${SPECIES_PREFILL_FIELD_LABELS[field] || field})`}
                                onChange={(e) => {
                                  const on = e.target.checked;
                                  setPrefillPhotoSelections((prev) => ({
                                    ...prev,
                                    [slotKey]: {
                                      checked: on,
                                      assignTo: PHOTO_FIELD_KEYS.has(prev[slotKey]?.assignTo)
                                        ? prev[slotKey].assignTo
                                        : (PHOTO_FIELD_KEYS.has(field) ? field : 'photo_species'),
                                    },
                                  }));
                                }}
                              />
                              <div className="plant-prefill-photo-body">
                                <div className="plant-prefill-photo-assign-row">
                                  <label className="plant-prefill-photo-assign-label" htmlFor={`prefill-assign-${slotKey}`}>
                                    Associer au champ
                                  </label>
                                  <select
                                    id={`prefill-assign-${slotKey}`}
                                    className="plant-prefill-photo-assign"
                                    value={assignTo}
                                    disabled={!checked}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      setPrefillPhotoSelections((prev) => ({
                                        ...prev,
                                        [slotKey]: {
                                          checked: !!prev[slotKey]?.checked,
                                          assignTo: PHOTO_FIELD_KEYS.has(v) ? v : assignTo,
                                        },
                                      }));
                                    }}
                                  >
                                    {PLANT_PHOTO_FIELD_OPTIONS.map((opt) => (
                                      <option key={opt.key} value={opt.key}>{opt.label}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="plant-prefill-photo-thumb-wrap">
                                  {broken ? (
                                    <div className="plant-prefill-photo-thumb-fallback" role="img" aria-label="Aperçu non chargé">
                                      Aperçu indisponible
                                    </div>
                                  ) : (
                                    <img
                                      src={photo.url}
                                      alt=""
                                      className="plant-prefill-photo-thumb"
                                      loading="lazy"
                                      decoding="async"
                                      referrerPolicy="no-referrer"
                                      onError={() => markPrefillThumbBroken(field, idx)}
                                    />
                                  )}
                                </div>
                                <div className="plant-prefill-photo-meta">
                                  <a
                                    href={photo.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="plant-prefill-photo-url"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    Ouvrir l’image
                                  </a>
                                  {photo.source_url && (
                                    <a
                                      href={photo.source_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="plant-prefill-photo-source"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      Page source
                                    </a>
                                  )}
                                  <div className="plant-prefill-photo-credit">
                                    Crédit : {photo.credit || 'inconnu'} · Licence : {photo.license || 'à vérifier'}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary btn-sm" onClick={applyPrefill}>
                Appliquer la sélection
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPrefillResult(null)}>
                Masquer
              </button>
            </div>
          </div>
        </details>
      )}
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
        <div className="field"><label>Groupe (taxon) 1</label><input value={form.group_1} onChange={set('group_1')} placeholder="Végétal / Animal..."/></div>
        <div className="field"><label>Groupe (taxon) 2</label><input value={form.group_2} onChange={set('group_2')} placeholder="Angiosperme..."/></div>
        <div className="field"><label>Groupe (taxon) 3</label><input value={form.group_3} onChange={set('group_3')} placeholder="Famille..."/></div>
        <div className="field"><label>Groupe (taxon) 4</label><input value={form.group_4} onChange={set('group_4')} placeholder="Famille (végétal) ou genre (animal)"/></div>
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
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
              <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                {uploadingField === field.key ? 'Envoi…' : '📁 Galerie'}
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
              <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                {uploadingField === field.key ? 'Envoi…' : '📸 Appareil photo'}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
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

// ── FILTRES CATALOGUE BIODIVERSITÉ (élève + prof) ─────────────────────────────
function PlantCatalogFilterPanel({
  plants,
  showZonePresence = false,
  searchPlaceholder = '🔍 Rechercher dans la biodiversité...',
  search,
  setSearch,
  group1,
  setGroup1,
  group2,
  setGroup2,
  group3,
  setGroup3,
  habitat,
  setHabitat,
  agro,
  setAgro,
  zonePresence,
  setZonePresence,
}) {
  const subsetAfterG1 = useMemo(
    () => filterPlantsByTaxonomy(plants, { group1 }),
    [plants, group1],
  );
  const subsetAfterG2 = useMemo(
    () => filterPlantsByTaxonomy(plants, { group1, group2 }),
    [plants, group1, group2],
  );
  const subsetTaxonomy = useMemo(
    () => filterPlantsByTaxonomy(plants, { group1, group2, group3 }),
    [plants, group1, group2, group3],
  );

  const group1Options = useMemo(() => distinctPlantFieldValues(plants, 'group_1'), [plants]);
  const group2Options = useMemo(() => distinctPlantFieldValues(subsetAfterG1, 'group_2'), [subsetAfterG1]);
  const group3Options = useMemo(() => distinctPlantFieldValues(subsetAfterG2, 'group_3'), [subsetAfterG2]);
  const habitatOptions = useMemo(() => distinctPlantFieldValues(subsetTaxonomy, 'habitat'), [subsetTaxonomy]);
  const agroOptions = useMemo(
    () => distinctPlantFieldValues(subsetTaxonomy, 'agroecosystem_category'),
    [subsetTaxonomy],
  );

  useEffect(() => {
    if (habitat && !habitatOptions.includes(habitat)) setHabitat('');
  }, [habitat, habitatOptions, setHabitat]);

  useEffect(() => {
    if (agro && !agroOptions.includes(agro)) setAgro('');
  }, [agro, agroOptions, setAgro]);

  const resetAllFilters = () => {
    setGroup1('');
    setGroup2('');
    setGroup3('');
    setHabitat('');
    setAgro('');
    setSearch('');
    if (showZonePresence && setZonePresence) setZonePresence(ZONE_PRESENCE_FILTER.ALL);
  };

  const selectStyle = { background: 'white' };

  return (
    <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
      <div className="field" style={{ marginBottom: 0 }}>
        <label>Groupe (taxon) 1</label>
        <select
          value={group1}
          onChange={(e) => {
            setGroup1(e.target.value);
            setGroup2('');
            setGroup3('');
          }}
          style={selectStyle}
        >
          <option value="">Tous les groupes</option>
          {group1Options.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={searchPlaceholder}
          style={selectStyle}
        />
      </div>

      <details className="plant-more">
        <summary>Filtres avancés</summary>
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          <div className="plant-form-grid">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Groupe (taxon) 2</label>
              <select
                value={group2}
                onChange={(e) => {
                  setGroup2(e.target.value);
                  setGroup3('');
                }}
                style={selectStyle}
              >
                <option value="">Tous</option>
                {group2Options.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Groupe (taxon) 3</label>
              <select value={group3} onChange={(e) => setGroup3(e.target.value)} style={selectStyle}>
                <option value="">Tous</option>
                {group3Options.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Habitat</label>
              <select value={habitat} onChange={(e) => setHabitat(e.target.value)} style={selectStyle}>
                <option value="">Tous</option>
                {habitatOptions.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Catégorie d&apos;agrosystème</label>
              <select value={agro} onChange={(e) => setAgro(e.target.value)} style={selectStyle}>
                <option value="">Toutes</option>
                {agroOptions.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            {showZonePresence && setZonePresence && (
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Présence sur la carte</label>
                <select
                  value={zonePresence}
                  onChange={(e) => setZonePresence(e.target.value)}
                  style={selectStyle}
                >
                  <option value={ZONE_PRESENCE_FILTER.ALL}>Toutes les fiches</option>
                  <option value={ZONE_PRESENCE_FILTER.IN_MAP}>Lié à au moins une zone ou un repère</option>
                  <option value={ZONE_PRESENCE_FILTER.NOT_IN_MAP}>Sans lieu sur la carte</option>
                </select>
              </div>
            )}
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={resetAllFilters}>
            Réinitialiser les filtres
          </button>
        </div>
      </details>
    </div>
  );
}

// ── PLANT MANAGER (teacher) ───────────────────────────────────────────────────
function PlantManager({
  plants,
  onRefresh,
  publicSettings = null,
  zones = [],
  markers = [],
  maps = [],
  canParticipateContextComments = true,
  onForceLogout = null,
}) {
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
                  <p className="plant-row-desc">{p.description || <em style={{color:'#bbb'}}>Pas de description</em>}</p>
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
  const galleryFileRef = useRef(null);
  const cameraFileRef = useRef(null);

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
              <div className="img-upload-area img-upload-area--split" role="group" aria-label="Photo d'observation : galerie ou appareil photo">
                <div style={{fontSize:'1.5rem', marginBottom:4}}>📷</div>
                <div style={{fontSize:'.82rem', color:'#888', marginBottom: 10}}>Galerie ou appareil photo</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      if (galleryFileRef.current) galleryFileRef.current.value = '';
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
                      cameraFileRef.current?.click();
                    }}
                  >
                    📸 Prendre une photo
                  </button>
                </div>
                <input ref={galleryFileRef} type="file" accept="image/*" onChange={handleFile} />
                <input ref={cameraFileRef} type="file" accept="image/*" capture="environment" onChange={handleFile} />
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

// ── Mini-cartes emplacement (zones / repères) sur les fiches biodiversité ─────
function parseZonePointsJson(raw) {
  try {
    const points = JSON.parse(raw || '[]');
    if (!Array.isArray(points)) return [];
    return points
      .map((p) => ({ xp: Number(p?.xp), yp: Number(p?.yp) }))
      .filter((p) => Number.isFinite(p.xp) && Number.isFinite(p.yp));
  } catch (_) {
    return [];
  }
}

function computeBiodivMapFitRect(nw, nh, cw, ch) {
  const boxW = Math.max(1, cw);
  const boxH = Math.max(1, ch);
  if (!nw || !nh) {
    return { offsetX: 0, offsetY: 0, width: boxW, height: boxH };
  }
  const scale = Math.min(boxW / nw, boxH / nh);
  const width = nw * scale;
  const height = nh * scale;
  const offsetX = (boxW - width) / 2;
  const offsetY = (boxH - height) / 2;
  return { offsetX, offsetY, width, height };
}

function groupPlantLocationsByMap(zoneList, markerList) {
  const map = new Map();
  const ensure = (mapId) => {
    const id = mapId && String(mapId).trim() ? String(mapId).trim() : 'foret';
    if (!map.has(id)) map.set(id, { zones: [], markers: [] });
    return id;
  };
  for (const z of zoneList || []) {
    const id = ensure(z.map_id);
    map.get(id).zones.push(z);
  }
  for (const m of markerList || []) {
    const id = ensure(m.map_id);
    map.get(id).markers.push(m);
  }
  return map;
}

function BiodivLocationMapBlock({ mapId, maps, zones, markers }) {
  const activeMap = maps.find((m) => m.id === mapId);
  const candidates = useMemo(() => {
    const base =
      mapId === 'n3'
        ? ['/maps/plan%20n3.jpg', '/maps/map-n3.svg', '/map.png']
        : ['/map.png', '/maps/map-foret.svg'];
    const first = activeMap?.map_image_url ? [activeMap.map_image_url] : [];
    return [...new Set([...first, ...base])];
  }, [activeMap?.map_image_url, mapId]);

  const [ci, setCi] = useState(0);
  useEffect(() => {
    setCi(0);
  }, [mapId, activeMap?.map_image_url]);

  const drawableZones = useMemo(
    () => (zones || []).filter((z) => parseZonePointsJson(z.points).length >= 3),
    [zones],
  );
  const drawableMarkers = useMemo(
    () =>
      (markers || []).filter((mk) => {
        const x = Number(mk.x_pct);
        const y = Number(mk.y_pct);
        return Number.isFinite(x) && Number.isFinite(y);
      }),
    [markers],
  );

  if (drawableZones.length === 0 && drawableMarkers.length === 0) return null;

  const src = candidates[Math.min(ci, candidates.length - 1)];

  const onImgError = useCallback(() => {
    setCi((c) => (c < candidates.length - 1 ? c + 1 : c));
  }, [candidates.length]);

  const [imgNatural, setImgNatural] = useState({ w: 0, h: 0 });
  const stageRef = useRef(null);
  const [stageBox, setStageBox] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setStageBox({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = useMemo(
    () => computeBiodivMapFitRect(imgNatural.w, imgNatural.h, stageBox.w, stageBox.h),
    [imgNatural.w, imgNatural.h, stageBox.w, stageBox.h],
  );

  const label = activeMap?.label || mapId;

  return (
    <div className="biodiv-location-map-wrap">
      <div className="biodiv-location-map-label">{label}</div>
      <div
        ref={stageRef}
        className="biodiv-location-map-stage"
        role="img"
        aria-label={`Aperçu des emplacements sur le plan ${label}`}
      >
        <div
          className="biodiv-location-map-fit-layer"
          style={
            fit.width > 0 && fit.height > 0
              ? { left: fit.offsetX, top: fit.offsetY, width: fit.width, height: fit.height }
              : { left: 0, top: 0, width: '100%', height: '100%' }
          }
        >
          <img
            src={src}
            alt=""
            className="biodiv-location-map-img"
            onLoad={(e) => {
              const el = e.currentTarget;
              setImgNatural({ w: el.naturalWidth || 0, h: el.naturalHeight || 0 });
            }}
            onError={onImgError}
          />
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="biodiv-location-map-svg" aria-hidden="true">
            {drawableZones.map((z) => {
              const pts = parseZonePointsJson(z.points);
              const p = pts.map((pt) => `${pt.xp},${pt.yp}`).join(' ');
              return (
                <polygon
                  key={z.id}
                  points={p}
                  fill="rgba(99,102,241,0.22)"
                  stroke="#6366f1"
                  strokeWidth="0.45"
                />
              );
            })}
            {drawableMarkers.map((m) => (
              <circle
                key={m.id}
                className="biodiv-location-marker-dot"
                cx={Number(m.x_pct)}
                cy={Number(m.y_pct)}
                r={2.4}
              />
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
}

function PlantLocationPreviewMaps({ maps, zones, markers }) {
  const groups = useMemo(() => [...groupPlantLocationsByMap(zones, markers).entries()], [zones, markers]);
  if (groups.length === 0) return null;
  return (
    <div className="biodiv-location-maps">
      {groups.map(([mid, data]) => (
        <BiodivLocationMapBlock
          key={mid}
          mapId={mid}
          maps={maps}
          zones={data.zones}
          markers={data.markers}
        />
      ))}
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
        <p className="plant-row-desc">{plant.description || <em style={{ color: '#bbb' }}>Pas de description</em>}</p>
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
  zones = [],
  markers = [],
  maps = [],
  publicSettings = null,
  canParticipateContextComments = true,
  onClose,
  onForceLogout = null,
}) {
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
  const overlay = (
    <div className="modal-overlay modal-overlay--tuto-preview" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="log-modal tuto-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="plant-catalog-preview-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
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
      </div>
    </div>
  );
  if (typeof document === 'undefined' || !document.body) return null;
  return createPortal(overlay, document.body);
}

// ── PLANT VIEWER (student read-only) ──────────────────────────────────────────
function PlantViewer({
  plants,
  zones,
  markers = [],
  maps = [],
  publicSettings = null,
  canParticipateContextComments = true,
  onForceLogout = null,
}) {
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
  PlantCatalogPreviewModal,
};
