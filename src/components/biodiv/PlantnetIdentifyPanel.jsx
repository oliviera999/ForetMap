import React, { useState } from 'react';
import { api } from '../../services/api';
import { compressImageWithPreset } from '../../utils/image';
import { armNativeFilePickerGuard, disarmNativeFilePickerGuard } from '../../utils/overlayHistory';
import {
  buildPlantnetIdentifyImages,
  filterNonEmptyIdentifySlots,
  derivePlantnetNameUpdate,
} from '../../utils/plantnetIdentify.js';
import { mergePlantPhotoFieldValue } from '../../utils/plantFormValues.js';
import { PlantnetPredictionsList } from './PlantnetPredictionsList.jsx';

const PLANTNET_IDENTIFY_ORGAN_OPTIONS = [
  { id: 'auto', label: 'Auto' },
  { id: 'leaf', label: 'Feuille' },
  { id: 'flower', label: 'Fleur' },
  { id: 'fruit', label: 'Fruit' },
  { id: 'bark', label: 'Écorce' },
  { id: 'habit', label: 'Port / habitude' },
  { id: 'branch', label: 'Branche' },
  { id: 'seed', label: 'Graine' },
  { id: 'bud', label: 'Bourgeon' },
  { id: 'scan', label: 'Scan' },
  { id: 'sheet', label: 'Planche' },
  { id: 'other', label: 'Autre' },
  { id: 'drawing', label: 'Dessin' },
  { id: 'anatomy', label: 'Anatomie' },
  { id: 'aerial', label: 'Vue aérienne' },
];

function newPlantnetIdentifySlot() {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    organ: 'auto',
    imageData: '',
    fileName: '',
  };
}

/**
 * Ordre des champs pour les images envoyées à Pl@ntNet : la 1re image = illustration principale (`photo`),
 * les suivantes = autres cases photo du formulaire.
 */
const PLANTNET_IDENTIFY_PHOTO_FIELD_ORDER = [
  'photo',
  'photo_species',
  'photo_leaf',
  'photo_flower',
  'photo_fruit',
  'photo_harvest_part',
];

/**
 * Panneau d'identification Pl@ntNet du formulaire de fiche plante — extrait de `PlantEditForm`
 * (`foretmap-views.jsx`, O6). Gère ses propres slots d'images (1 à 5, organe + upload galerie/
 * appareil photo), lance l'identification serveur, et applique une proposition au formulaire
 * (noms via `setForm` + import des photos via `/api/plants/:id/photo-upload`). La logique pure
 * (mapping images, dérivation des noms) vit dans `utils/plantnetIdentify.js`.
 *
 * @param {object} props
 * @param {boolean} [props.saving] enregistrement de la fiche en cours (désactive les actions)
 * @param {string|number|null} [props.plantId] id de la fiche (pour l'upload des photos)
 * @param {() => Promise<string|number>} [props.onEnsurePlantId] crée la fiche si besoin, renvoie son id
 * @param {(updater: Function) => void} props.setForm setter du formulaire parent
 * @param {(msg: string) => void} [props.onToast] notification utilisateur
 */
export function PlantnetIdentifyPanel({
  saving = false,
  plantId = null,
  onEnsurePlantId = null,
  setForm,
  onToast,
}) {
  const [identifySlots, setIdentifySlots] = useState(() => [newPlantnetIdentifySlot()]);
  const [identifyLoading, setIdentifyLoading] = useState(false);
  const [identifyApplying, setIdentifyApplying] = useState(false);
  const [identifyError, setIdentifyError] = useState('');
  const [identifyPredictions, setIdentifyPredictions] = useState([]);

  const addIdentifySlot = () => {
    setIdentifySlots((prev) => (prev.length >= 5 ? prev : [...prev, newPlantnetIdentifySlot()]));
  };

  const removeIdentifySlot = (key) => {
    setIdentifySlots((prev) => {
      const next = prev.filter((r) => r.key !== key);
      return next.length === 0 ? [newPlantnetIdentifySlot()] : next;
    });
  };

  const setIdentifySlotOrgan = (key, organ) => {
    setIdentifySlots((prev) => prev.map((r) => (r.key === key ? { ...r, organ } : r)));
  };

  const onIdentifyFileChosen = async (key, file) => {
    if (!file) return;
    try {
      const imageData = await compressImageWithPreset(file, 'plant');
      setIdentifySlots((prev) =>
        prev.map((r) => (r.key === key ? { ...r, imageData, fileName: file.name || '' } : r)),
      );
    } catch {
      onToast?.('Impossible de lire cette image.');
    }
  };

  const runPlantnetIdentify = async () => {
    const images = buildPlantnetIdentifyImages(identifySlots);
    if (images.length === 0) {
      onToast?.('Ajoute au moins une photo (1 à 5).');
      return;
    }
    setIdentifyLoading(true);
    setIdentifyError('');
    setIdentifyPredictions([]);
    try {
      const data = await api('/api/plants/plantnet-identify', 'POST', {
        images,
        nbResults: 10,
        lang: 'fr',
      });
      const preds = Array.isArray(data?.predictions) ? data.predictions : [];
      setIdentifyPredictions(preds);
      if (preds.length === 0) {
        onToast?.('Aucune espèce proposée — essaie d’autres photos ou organes.');
      }
    } catch (e) {
      setIdentifyError(e?.message || 'Identification indisponible');
      onToast?.(String(e?.message || 'Identification indisponible'));
    } finally {
      setIdentifyLoading(false);
    }
  };

  const applyIdentifyPrediction = async (pred) => {
    if (!pred || typeof pred !== 'object') return;
    setForm((f) => ({ ...f, ...derivePlantnetNameUpdate(pred, f) }));

    const slots = filterNonEmptyIdentifySlots(identifySlots);
    if (slots.length === 0) {
      onToast?.(
        'Nom mis à jour — ajoute des photos d’identification pour les importer dans la fiche.',
      );
      return;
    }

    let targetId = plantId;
    if (!targetId && typeof onEnsurePlantId === 'function') {
      targetId = await onEnsurePlantId();
    }
    if (!targetId) {
      onToast?.('Enregistre la fiche (nom) pour importer les photos, puis réessaie.');
      return;
    }

    setIdentifyApplying(true);
    try {
      for (let i = 0; i < slots.length; i++) {
        const field = PLANTNET_IDENTIFY_PHOTO_FIELD_ORDER[i];
        if (!field) break;
        const imageData = slots[i].imageData;
        const position = i === 0 ? 'prepend' : 'append';
        const result = await api(`/api/plants/${targetId}/photo-upload`, 'POST', {
          field,
          imageData,
          position,
        });
        const newUrl = result?.url;
        if (!newUrl) continue;
        setForm((prev) => ({
          ...prev,
          [field]:
            result?.value ||
            result?.plant?.[field] ||
            mergePlantPhotoFieldValue(prev[field], newUrl, position),
        }));
      }
      onToast?.('Proposition appliquée : noms et photos d’identification importés ✓');
    } catch (e) {
      onToast?.('Import des photos : ' + (e?.message || 'erreur'));
    } finally {
      setIdentifyApplying(false);
    }
  };

  const identifyBusy = saving || identifyLoading || identifyApplying;

  return (
    <details className="plant-more" style={{ marginBottom: 10 }}>
      <summary style={{ cursor: 'pointer', fontSize: '.88rem' }}>
        Identifier une plante à partir de photos (Pl@ntNet)
      </summary>
      <div style={{ marginTop: 8, display: 'grid', gap: 10, fontSize: '.82rem', color: '#444' }}>
        <p style={{ margin: 0, lineHeight: 1.45 }}>
          Envoie 1 à 5 images de la <strong>même</strong> plante (feuille, fleur, fruit…), depuis la{' '}
          <strong>galerie</strong> ou en <strong>prenant une photo</strong> avec le téléphone
          (bouton « Appareil photo », caméra arrière si disponible). Le serveur appelle Pl@ntNet ;
          choisis une proposition puis « Utiliser pour le formulaire » : les noms sont renseignés et
          les images sont importées (la 1<sup>re</sup> sert de <strong>photo principale</strong>{' '}
          pour illustrer la fiche ; les suivantes remplissent les autres cases photo). Tu peux
          ensuite lancer la pré-saisie ci-dessous. Données soumises aux conditions d’usage{' '}
          <a href="https://my.plantnet.org/" target="_blank" rel="noreferrer">
            my.plantnet.org
          </a>
          .
        </p>
        {identifySlots.map((row) => {
          const safeId = String(row.key).replace(/\W/g, '_');
          const idGal = `plantnet-id-gal-${safeId}`;
          const idCam = `plantnet-id-cam-${safeId}`;
          const onIdentifyPick = (e) => {
            disarmNativeFilePickerGuard();
            const f = e.target.files && e.target.files[0];
            e.target.value = '';
            onIdentifyFileChosen(row.key, f);
          };
          const triggerIdentifyFile = (inputId) => {
            if (identifyBusy) return;
            const el = document.getElementById(inputId);
            if (!el) return;
            el.value = '';
            armNativeFilePickerGuard();
            el.click();
          };
          return (
            <div
              key={row.key}
              style={{
                display: 'grid',
                gap: 6,
                padding: 8,
                border: '1px solid #e2e2e2',
                borderRadius: 8,
                background: '#fafafa',
              }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <label
                  style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '.78rem' }}
                >
                  <span>Organe</span>
                  <select
                    value={row.organ}
                    onChange={(e) => setIdentifySlotOrgan(row.key, e.target.value)}
                    disabled={identifyBusy}
                  >
                    {PLANTNET_IDENTIFY_ORGAN_OPTIONS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    fontSize: '.78rem',
                    flex: '1 1 220px',
                  }}
                >
                  <span>Image</span>
                  <div
                    style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}
                    role="group"
                    aria-label="Image : galerie ou appareil photo"
                  >
                    <input
                      id={idGal}
                      type="file"
                      accept="image/*"
                      disabled={identifyBusy}
                      style={{ display: 'none' }}
                      onChange={onIdentifyPick}
                    />
                    <input
                      id={idCam}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      disabled={identifyBusy}
                      style={{ display: 'none' }}
                      onChange={onIdentifyPick}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={identifyBusy}
                      onClick={() => triggerIdentifyFile(idGal)}
                    >
                      📁 Galerie / fichier
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={identifyBusy}
                      onClick={() => triggerIdentifyFile(idCam)}
                    >
                      📸 Appareil photo
                    </button>
                  </div>
                </div>
                {identifySlots.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={identifyBusy}
                    onClick={() => removeIdentifySlot(row.key)}
                  >
                    Retirer
                  </button>
                )}
              </div>
              {row.fileName && <span style={{ color: '#2a6a2a' }}>Fichier : {row.fileName}</span>}
            </div>
          );
        })}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {identifySlots.length < 5 && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={identifyBusy}
              onClick={addIdentifySlot}
            >
              + Ajouter une image
            </button>
          )}
          <button
            type="button"
            className="btn btn-sm"
            disabled={identifyBusy}
            onClick={runPlantnetIdentify}
          >
            {identifyLoading ? 'Identification…' : 'Lancer l’identification'}
          </button>
        </div>
        {identifyError && <p style={{ margin: 0, color: '#a94442' }}>{identifyError}</p>}
        <PlantnetPredictionsList
          predictions={identifyPredictions}
          applying={identifyApplying}
          disabled={identifyBusy}
          onApply={applyIdentifyPrediction}
        />
      </div>
    </details>
  );
}
