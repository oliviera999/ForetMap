import React, { useState } from 'react';
import { api } from '../../services/api';
import { compressImageWithPreset } from '../../utils/image';
import { disarmNativeFilePickerGuard } from '../../utils/overlayHistory';
import { PLANT_PHOTO_FIELD_OPTIONS } from '../../constants/plantMetaSections.js';

/**
 * Grille d'upload des photos de fiche plante — extraite de `PlantEditForm`
 * (`foretmap-views.jsx`, O6). Un bloc par champ photo (URL directe + boutons Galerie /
 * Appareil photo) ; la galerie multi-fichiers répartit les images sur les champs photo
 * suivants dans l'ordre. Upload via `/api/plants/:id/photo-upload` (création de la fiche
 * au besoin via `onEnsurePlantId`).
 *
 * @param {object} props
 * @param {boolean} [props.saving] enregistrement de la fiche en cours
 * @param {string|number|null} [props.plantId] id de la fiche (upload)
 * @param {() => Promise<string|number>} [props.onEnsurePlantId] crée la fiche si besoin
 * @param {object} props.form formulaire courant (valeurs des champs URL)
 * @param {(updater: Function) => void} props.setForm setter du formulaire parent
 * @param {(msg: string) => void} [props.onToast] notification utilisateur
 */
export function PlantPhotoUploadGrid({ saving = false, plantId = null, onEnsurePlantId = null, form, setForm, onToast }) {
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
  );
}
