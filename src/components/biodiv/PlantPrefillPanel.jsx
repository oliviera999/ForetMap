import React, { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../../services/api';
import { prefillPhotoSlotKey } from '../../utils/biodivPlantForm.js';
import {
  groupPrefillPhotosByField,
  buildPrefillFieldSelection,
  buildInitialPrefillPhotoSelections,
} from '../../utils/plantPrefillHelpers.js';
import { applyPrefillToForm } from '../../utils/plantPrefillApply.js';
import { PHOTO_FIELD_KEYS, PLANT_PHOTO_FIELD_OPTIONS } from '../../constants/plantMetaSections.js';
import {
  PrefillSourcesSelector,
  SPECIES_PREFILL_SOURCE_CHECKBOXES,
} from './PrefillSourcesSelector.jsx';
import { PrefillPhotoCard } from './PrefillPhotoCard.jsx';
import { PrefillSourceBadge } from './PrefillSourceBadge.jsx';

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

/**
 * Panneau de pré-saisie depuis les sources externes (`GET /api/plants/autofill`) — extrait de
 * `PlantEditForm` (`foretmap-views.jsx`, O6). Gère le choix des sources interrogées, la requête
 * de pré-saisie, la sélection des champs texte et des photos proposées (case + champ cible),
 * puis l'application au formulaire parent via `setForm` (logique pure dans
 * `utils/plantPrefillHelpers.js` et `utils/plantPrefillApply.js`).
 *
 * @param {object} props
 * @param {object} props.form formulaire courant (requête + état « déjà rempli » des champs)
 * @param {(updater: Function) => void} props.setForm setter du formulaire parent
 * @param {boolean} [props.saving] enregistrement de la fiche en cours (désactive les actions)
 * @param {(msg: string) => void} [props.onToast] notification utilisateur
 */
export function PlantPrefillPanel({ form, setForm, saving = false, onToast }) {
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

  const groupedPrefillPhotos = useMemo(
    () => groupPrefillPhotosByField(prefillResult?.photos),
    [prefillResult],
  );

  const prefillQuery = (form.scientific_name || form.name || '').trim();

  const requestPrefill = async () => {
    if (!prefillQuery || prefillQuery.length < 2) {
      onToast?.('Indique un nom (ou nom scientifique) avec au moins 2 caractères.');
      return;
    }
    const selectedSourceIds = SPECIES_PREFILL_SOURCE_CHECKBOXES.filter(
      (o) => prefillSources[o.id],
    ).map((o) => o.id);
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
      setSelectedFields(
        buildPrefillFieldSelection(data, formRef.current || {}, {
          overwriteFilled,
          speciesPrefillFields: SPECIES_PREFILL_FIELDS,
        }),
      );
      setPrefillPhotoSelections(buildInitialPrefillPhotoSelections(data?.photos, PHOTO_FIELD_KEYS));
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
    setForm((prev) =>
      applyPrefillToForm(prev, {
        prefillResult,
        selectedFields,
        prefillPhotoSelections,
        groupedPrefillPhotos,
        overwriteFilled,
        speciesPrefillFields: SPECIES_PREFILL_FIELDS,
        photoFieldKeys: PHOTO_FIELD_KEYS,
      }),
    );
    onToast?.('Pré-saisie appliquée au formulaire ✓');
  };

  return (
    <>
      <PrefillSourcesSelector
        sources={prefillSources}
        onToggle={(id) => setPrefillSources((prev) => ({ ...prev, [id]: !prev[id] }))}
      />
      <div
        style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}
      >
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={requestPrefill}
          disabled={saving || prefillLoading}
        >
          {prefillLoading ? 'Pré-saisie…' : '✨ Pré-saisir depuis sources externes'}
        </button>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: '.8rem',
            color: '#444',
          }}
        >
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
            Pré-saisie proposée — confiance{' '}
            {Math.round(Number(prefillResult?.confidence || 0) * 100)}%
          </summary>
          <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            {Array.isArray(prefillResult?.warnings) && prefillResult.warnings.length > 0 && (
              <div
                style={{
                  fontSize: '.8rem',
                  color: '#7a5a13',
                  background: '#fff9e5',
                  borderRadius: 8,
                  padding: '6px 8px',
                }}
              >
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
                      <PrefillSourceBadge sourceMeta={sourceMeta} />
                      {sourceMeta?.source && (
                        <small style={{ color: '#666' }}>
                          ({Math.round(Number(sourceMeta.confidence || 0) * 100)}%)
                        </small>
                      )}
                    </span>
                    <span style={{ fontSize: '.83rem', color: '#333', paddingLeft: 24 }}>
                      {value}
                    </span>
                  </label>
                );
              })}
            </div>
            {(() => {
              const empty = SPECIES_PREFILL_FIELDS.filter(
                (k) => !String(prefillResult?.fields?.[k] || '').trim(),
              );
              if (empty.length === 0) return null;
              const labels = empty.slice(0, 14).map((k) => SPECIES_PREFILL_FIELD_LABELS[k] || k);
              const extra = empty.length > 14 ? ` (+${empty.length - 14} autres)` : '';
              return (
                <p style={{ fontSize: '.76rem', color: '#666', margin: 0, lineHeight: 1.35 }}>
                  Sans proposition automatique pour : {labels.join(', ')}
                  {extra}. Les sources publiques ne couvrent pas toujours ces champs ; complément
                  possible via saisie manuelle ou extensions documentées (voir la doc API).
                </p>
              );
            })()}
            {Object.keys(groupedPrefillPhotos).length > 0 && (
              <div style={{ display: 'grid', gap: 6 }}>
                <div>
                  <strong style={{ fontSize: '.9rem' }}>
                    Photos proposées (aperçu + crédit / licence)
                  </strong>
                  <p
                    style={{
                      margin: '4px 0 0',
                      fontSize: '.78rem',
                      color: '#555',
                      lineHeight: 1.35,
                    }}
                  >
                    Cochez les images à ajouter (aucune n’est cochée par défaut). Le menu « Associer
                    au champ » indique la case photo du formulaire cible ; plusieurs URL sur un même
                    champ sont listées ligne à ligne. Les photos déjà présentes (ex. prises pour
                    Pl@ntNet ou importées manuellement) sont conservées : les propositions de
                    pré-saisie s’ajoutent sans les remplacer, sauf si vous cochez « Autoriser
                    l’écrasement des champs déjà remplis ».
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
                        const slot = prefillPhotoSelections[slotKey] || {
                          checked: false,
                          assignTo: field,
                        };
                        const checked = !!slot.checked;
                        const assignTo = PHOTO_FIELD_KEYS.has(slot.assignTo)
                          ? slot.assignTo
                          : field;
                        return (
                          <PrefillPhotoCard
                            key={slotKey}
                            photo={photo}
                            slotKey={slotKey}
                            fieldLabel={SPECIES_PREFILL_FIELD_LABELS[field] || field}
                            checked={checked}
                            assignTo={assignTo}
                            broken={broken}
                            fieldOptions={PLANT_PHOTO_FIELD_OPTIONS}
                            onToggleChecked={(on) => {
                              setPrefillPhotoSelections((prev) => ({
                                ...prev,
                                [slotKey]: {
                                  checked: on,
                                  assignTo: PHOTO_FIELD_KEYS.has(prev[slotKey]?.assignTo)
                                    ? prev[slotKey].assignTo
                                    : PHOTO_FIELD_KEYS.has(field)
                                      ? field
                                      : 'photo_species',
                                },
                              }));
                            }}
                            onAssignChange={(v) => {
                              setPrefillPhotoSelections((prev) => ({
                                ...prev,
                                [slotKey]: {
                                  checked: !!prev[slotKey]?.checked,
                                  assignTo: PHOTO_FIELD_KEYS.has(v) ? v : assignTo,
                                },
                              }));
                            }}
                            onThumbError={() => markPrefillThumbBroken(field, idx)}
                          />
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
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setPrefillResult(null)}
              >
                Masquer
              </button>
            </div>
          </div>
        </details>
      )}
    </>
  );
}
