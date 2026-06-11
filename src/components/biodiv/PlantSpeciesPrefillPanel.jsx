import React, { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../../services/api';
import { prefillPhotoSlotKey } from '../../utils/biodivPlantForm.js';
import { groupPrefillPhotosByField } from '../../utils/plantPrefillHelpers.js';
import { applyPrefillToForm } from '../../utils/plantPrefillApply.js';
import { PHOTO_FIELD_KEYS, PLANT_PHOTO_FIELD_OPTIONS } from '../../constants/plantMetaSections.js';

export const SPECIES_PREFILL_FIELDS = [
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

export const SPECIES_PREFILL_FIELD_LABELS = {
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

/** Sources externes pré-saisie (ids alignés sur `GET /api/plants/autofill?sources=`). */
export const SPECIES_PREFILL_SOURCE_CHECKBOXES = [
  { id: 'wikipedia', label: 'Wikipedia (FR)' },
  { id: 'wikidata', label: 'Wikidata' },
  { id: 'gbif', label: 'GBIF (taxonomie)' },
  { id: 'gbif_traits', label: 'GBIF — descriptions / traits' },
  { id: 'gbif_vernacular', label: 'GBIF — noms vernaculaires' },
  { id: 'inaturalist', label: 'iNaturalist' },
  { id: 'catalogue_of_life', label: 'Catalogue of Life' },
  { id: 'wikipedia_en', label: 'Wikipedia (EN, secours)' },
  { id: 'wikipedia_heuristic', label: 'Heuristiques (extrait FR)' },
  { id: 'trefle', label: 'Trefle' },
  { id: 'openai', label: 'OpenAI' },
];

/**
 * Panneau de pré-saisie « sources externes » du formulaire de fiche plante — extrait de
 * `PlantEditForm` (`foretmap-views.jsx`, O6). Interroge `GET /api/plants/autofill` (sources
 * cochées + indices nom/nom scientifique), affiche les champs proposés (badges de source,
 * sélection par case) et les photos suggérées (aperçu, crédit/licence, champ cible), puis
 * applique la sélection au formulaire via `applyPrefillToForm` (logique pure, testée à part).
 *
 * @param {object} props
 * @param {boolean} [props.saving] enregistrement de la fiche en cours
 * @param {object} props.form formulaire courant (requête + indices + sélection par défaut)
 * @param {(updater: Function) => void} props.setForm setter du formulaire parent
 * @param {(msg: string) => void} [props.onToast] notification utilisateur
 */
export function PlantSpeciesPrefillPanel({ saving = false, form, setForm, onToast }) {
  const formRef = useRef(form);
  formRef.current = form;
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [prefillError, setPrefillError] = useState('');
  const [prefillResult, setPrefillResult] = useState(null);
  const [overwriteFilled, setOverwriteFilled] = useState(false);
  const [selectedFields, setSelectedFields] = useState({});
  /** Par emplacement `field:idx` : case cochée + champ cible au moment d’appliquer la pré-saisie. */
  const [prefillPhotoSelections, setPrefillPhotoSelections] = useState({});
  /** Clés `${field}:${idx}` pour masquer l’aperçu image après erreur de chargement. */
  const [prefillThumbBroken, setPrefillThumbBroken] = useState({});
  const [prefillSources, setPrefillSources] = useState(() =>
    Object.fromEntries(SPECIES_PREFILL_SOURCE_CHECKBOXES.map((o) => [o.id, true])),
  );

  useEffect(() => {
    setPrefillThumbBroken({});
  }, [prefillResult]);

  const markPrefillThumbBroken = (field, idx) => {
    const k = `${field}:${idx}`;
    setPrefillThumbBroken((prev) => (prev[k] ? prev : { ...prev, [k]: true }));
  };

  const groupedPrefillPhotos = useMemo(() => groupPrefillPhotosByField(prefillResult?.photos), [prefillResult]);

  const prefillQuery = (form.scientific_name || form.name || '').trim();

  const requestPrefill = async () => {
    if (!prefillQuery || prefillQuery.length < 2) {
      onToast?.('Indique un nom (ou nom scientifique) avec au moins 2 caractères.');
      return;
    }
    const selectedSourceIds = SPECIES_PREFILL_SOURCE_CHECKBOXES.filter((o) => prefillSources[o.id]).map((o) => o.id);
    if (selectedSourceIds.length === 0) {
      onToast?.('Coche au moins une source pour la pré-saisie.');
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
      if (selectedSourceIds.length < SPECIES_PREFILL_SOURCE_CHECKBOXES.length) {
        hintParams.set('sources', selectedSourceIds.join(','));
      }
      const data = await api(`/api/plants/autofill?${hintParams.toString()}`);
      setPrefillResult(data || null);

      const latest = formRef.current || {};
      const nextFields = {};
      for (const key of SPECIES_PREFILL_FIELDS) {
        const value = String(data?.fields?.[key] || '').trim();
        if (!value) continue;
        const hasCurrentValue = String(latest?.[key] || '').trim().length > 0;
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
          // Propositions visibles par défaut ; l’utilisateur coche pour ajouter sans remplacer les photos déjà présentes.
          nextPhotoSel[slot] = { checked: false, assignTo: defaultTarget };
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

  const prefillSourceBadge = (sourceMeta) => {
    const src = String(sourceMeta?.source || '').trim().toLowerCase();
    if (!src) return null;
    const isOpenAi = src === 'openai' || src === 'openai_gap';
    const label = isOpenAi ? '🧠 OpenAI' : `🔎 ${src}`;
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '1px 6px',
          borderRadius: 999,
          fontSize: '.72rem',
          lineHeight: 1.5,
          fontWeight: 600,
          background: isOpenAi ? '#ede9fe' : '#ecfeff',
          color: isOpenAi ? '#5b21b6' : '#155e75',
          border: `1px solid ${isOpenAi ? '#c4b5fd' : '#a5f3fc'}`,
        }}
        title={isOpenAi
          ? 'Champ proposé par OpenAI à partir du contexte multi-sources'
          : `Champ proposé par la source ${src}`}
      >
        {label}
      </span>
    );
  };

  const applyPrefill = () => {
    if (!prefillResult) return;
    setForm((prev) => applyPrefillToForm(prev, {
      prefillResult,
      selectedFields,
      prefillPhotoSelections,
      groupedPrefillPhotos,
      overwriteFilled,
      speciesPrefillFields: SPECIES_PREFILL_FIELDS,
      photoFieldKeys: PHOTO_FIELD_KEYS,
    }));
    onToast?.('Pré-saisie appliquée au formulaire ✓');
  };

  return (
    <>
      <details className="plant-more" style={{ marginBottom: 8 }}>
        <summary style={{ cursor: 'pointer', fontSize: '.88rem' }}>Sources à interroger</summary>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 6,
            marginTop: 8,
          }}
        >
          {SPECIES_PREFILL_SOURCE_CHECKBOXES.map((row) => (
            <label
              key={row.id}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.8rem', color: '#333' }}
            >
              <input
                type="checkbox"
                checked={!!prefillSources[row.id]}
                onChange={() => setPrefillSources((prev) => ({ ...prev, [row.id]: !prev[row.id] }))}
              />
              <span>{row.label}</span>
              <small style={{ color: '#888' }}>({row.id})</small>
            </label>
          ))}
        </div>
      </details>
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
                      {prefillSourceBadge(sourceMeta)}
                      {sourceMeta?.source && (
                        <small style={{ color: '#666' }}>
                          ({Math.round(Number(sourceMeta.confidence || 0) * 100)}%)
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
                    Cochez les images à ajouter (aucune n’est cochée par défaut). Le menu « Associer au champ » indique la case photo du formulaire cible ; plusieurs URL sur un même champ sont listées ligne à ligne. Les photos déjà présentes (ex. prises pour Pl@ntNet ou importées manuellement) sont conservées : les propositions de pré-saisie s’ajoutent sans les remplacer, sauf si vous cochez « Autoriser l’écrasement des champs déjà remplis ».
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
    </>
  );
}
