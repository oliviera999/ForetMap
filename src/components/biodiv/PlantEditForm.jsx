import React, { useState } from 'react';
import { api } from '../../services/api';
import { PLANT_EMOJIS } from '../../constants/emojis';
import { compressImageWithPreset } from '../../utils/image';
import { disarmNativeFilePickerGuard } from '../../utils/overlayHistory';
import { MarkdownTextarea } from '../MarkdownTextarea.jsx';
import { PLANT_PHOTO_FIELD_OPTIONS } from '../../constants/plantMetaSections.js';
import {
  filterNonEmptyFiles,
  planGalleryPhotoSlots,
  galleryUploadToastMessages,
} from '../../utils/plantPhotoGallery.js';
import { PlantnetIdentifyPanel } from './PlantnetIdentifyPanel.jsx';
import { PlantPrefillPanel } from './PlantPrefillPanel.jsx';

/**
 * Formulaire d'édition d'une fiche biodiversité — extrait de `foretmap-views.jsx` (O6).
 * Vit hors de `PlantManager` pour éviter un remontage à chaque frappe. Grille des champs
 * texte/Markdown, sélection d'emoji, panneaux Pl@ntNet et pré-saisie, et uploads photo
 * (un champ ou galerie multi-champs via `utils/plantPhotoGallery.js`).
 *
 * @param {object} props
 * @param {string} props.title titre du formulaire
 * @param {object} props.form valeurs du formulaire (détenues par le parent)
 * @param {(updater: Function) => void} props.setForm setter du formulaire parent
 * @param {() => void} props.onSave sauvegarde de la fiche
 * @param {() => void} props.onCancel abandon de l'édition
 * @param {boolean} props.saving enregistrement en cours (désactive les actions)
 * @param {string|number|null} props.plantId id de la fiche (null en création)
 * @param {(msg: string) => void} [props.onToast] notification utilisateur
 * @param {() => Promise<string|number|null>} [props.onEnsurePlantId] crée la fiche si besoin, renvoie son id
 */
function PlantEditForm({
  title,
  form,
  setForm,
  onSave,
  onCancel,
  saving,
  plantId,
  onToast,
  onEnsurePlantId = null,
}) {
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const [uploadingField, setUploadingField] = useState('');

  const photoFields = PLANT_PHOTO_FIELD_OPTIONS;

  const uploadPhoto = async (field, file) => {
    if (!file) return;
    let targetId = plantId;
    if (!targetId && typeof onEnsurePlantId === 'function') {
      targetId = await onEnsurePlantId();
      if (!targetId) return;
    } else if (!targetId) {
      onToast?.("Crée d'abord la fiche, puis ajoute les photos.");
      return;
    }
    setUploadingField(field);
    try {
      const imageData = await compressImageWithPreset(file, 'plant');
      const position = field === 'photo' ? 'prepend' : 'append';
      const result = await api(`/api/plants/${targetId}/photo-upload`, 'POST', {
        field,
        imageData,
        position,
      });
      setForm((prev) => ({
        ...prev,
        [field]: result?.plant?.[field] || result?.url || prev[field],
      }));
      onToast?.('Photo importée ✓');
    } catch (e) {
      onToast?.('Erreur import photo : ' + e.message);
    } finally {
      setUploadingField('');
    }
  };

  /** Galerie : plusieurs fichiers → champs photo suivants dans l’ordre (photo espèce → … → partie récoltée). */
  const uploadPhotosFromGallery = async (startFieldKey, fileList) => {
    const files = filterNonEmptyFiles(fileList);
    if (!files.length) return;
    const plan = planGalleryPhotoSlots(photoFields, startFieldKey, files.length);
    if (!plan) return;

    let targetId = plantId;
    if (!targetId && typeof onEnsurePlantId === 'function') {
      targetId = await onEnsurePlantId();
      if (!targetId) return;
    } else if (!targetId) {
      onToast?.("Crée d'abord la fiche, puis ajoute les photos.");
      return;
    }

    setUploadingField(startFieldKey);
    let ok = 0;
    try {
      for (const { fileIndex, fieldKey, label } of plan.assignments) {
        try {
          const imageData = await compressImageWithPreset(files[fileIndex], 'plant');
          const result = await api(`/api/plants/${targetId}/photo-upload`, 'POST', {
            field: fieldKey,
            imageData,
            position: 'append',
          });
          setForm((prev) => ({
            ...prev,
            [fieldKey]: result?.plant?.[fieldKey] || result?.url || prev[fieldKey],
          }));
          ok += 1;
        } catch (e) {
          onToast?.(`Erreur import (${label}) : ${e.message}`);
        }
      }
      for (const msg of galleryUploadToastMessages({
        ok,
        skipped: plan.skipped,
        startLabel: plan.startLabel,
      })) {
        onToast?.(msg);
      }
    } finally {
      setUploadingField('');
    }
  };

  return (
    <div className="plant-edit-form fade-in">
      <h4>{title}</h4>
      <div className="field">
        <label>Emoji</label>
        <div className="emoji-row">
          {PLANT_EMOJIS.map((e) => (
            <button
              key={e}
              className={`emoji-btn ${form.emoji === e ? 'sel' : ''}`}
              onClick={() => setForm((f) => ({ ...f, emoji: e }))}
            >
              {e}
            </button>
          ))}
        </div>
        <input
          value={form.emoji}
          onChange={set('emoji')}
          placeholder="ou colle un emoji"
          style={{ marginTop: 6 }}
        />
      </div>
      <div className="field">
        <label>Nom *</label>
        <input value={form.name} onChange={set('name')} placeholder="Ex: Aubergine" />
      </div>
      <PlantnetIdentifyPanel
        saving={saving}
        plantId={plantId}
        onEnsurePlantId={onEnsurePlantId}
        setForm={setForm}
        onToast={onToast}
      />
      <PlantPrefillPanel form={form} setForm={setForm} saving={saving} onToast={onToast} />
      <div className="field">
        <label>Description d'identification</label>
        <MarkdownTextarea
          value={form.description}
          onChange={set('description')}
          rows={3}
          placeholder="Comment reconnaître cet être vivant ? Feuilles, taille, odeur..."
        />
      </div>
      <div className="plant-form-grid">
        <div className="field">
          <label>Nom scientifique</label>
          <input
            value={form.scientific_name}
            onChange={set('scientific_name')}
            placeholder="Ex: Solanum lycopersicum"
          />
        </div>
        <div className="field">
          <label>Deuxième nom</label>
          <input
            value={form.second_name}
            onChange={set('second_name')}
            placeholder="Nom alternatif"
          />
        </div>
        <div className="field">
          <label>Habitat</label>
          <input
            value={form.habitat}
            onChange={set('habitat')}
            placeholder="Aquarium, potager..."
          />
        </div>
        <div className="field">
          <label>Milieu</label>
          <select value={form.habitat_type || ''} onChange={set('habitat_type')}>
            <option value="">—</option>
            <option value="terrestre">Terrestre</option>
            <option value="aquatique">Aquatique</option>
            <option value="les_deux">Terrestre & aquatique</option>
          </select>
        </div>
        <div className="field">
          <label>Rôle trophique</label>
          <select value={form.trophic_role || ''} onChange={set('trophic_role')}>
            <option value="">—</option>
            <option value="producteur">Producteur</option>
            <option value="consommateur">Consommateur</option>
            <option value="decomposeur">Décomposeur</option>
          </select>
        </div>
        <div className="field">
          <label>Comestible</label>
          <select
            value={
              form.is_edible === 1 || form.is_edible === '1'
                ? '1'
                : form.is_edible === 0 || form.is_edible === '0'
                  ? '0'
                  : ''
            }
            onChange={set('is_edible')}
          >
            <option value="">—</option>
            <option value="1">Oui</option>
            <option value="0">Non</option>
          </select>
        </div>
        <div className="field">
          <label>Cycle de vie</label>
          <select value={form.life_cycle || ''} onChange={set('life_cycle')}>
            <option value="">—</option>
            <option value="annuelle">Annuelle</option>
            <option value="bisannuelle">Bisannuelle</option>
            <option value="vivace">Vivace</option>
            <option value="variable">Variable</option>
          </select>
        </div>
        <div className="field">
          <label>Nutrition</label>
          <input
            value={form.nutrition}
            onChange={set('nutrition')}
            placeholder="Autotrophe, omnivore..."
          />
        </div>
        <div className="field">
          <label>Taille</label>
          <input value={form.size} onChange={set('size')} placeholder="Ex: 30-80 cm" />
        </div>
        <div className="field">
          <label>Reproduction</label>
          <input
            value={form.reproduction}
            onChange={set('reproduction')}
            placeholder="Sexuée, bouturage..."
          />
        </div>
        <div className="field">
          <label>Température min (°C)</label>
          <input value={form.temp_min_c} onChange={set('temp_min_c')} placeholder="Ex: 10" />
        </div>
        <div className="field">
          <label>Température max (°C)</label>
          <input value={form.temp_max_c} onChange={set('temp_max_c')} placeholder="Ex: 25" />
        </div>
        <div className="field">
          <label>pH min</label>
          <input value={form.ph_min} onChange={set('ph_min')} placeholder="Ex: 6.0" />
        </div>
        <div className="field">
          <label>pH max</label>
          <input value={form.ph_max} onChange={set('ph_max')} placeholder="Ex: 7.5" />
        </div>
        <div className="field">
          <label>Origine géographique</label>
          <input
            value={form.geographic_origin}
            onChange={set('geographic_origin')}
            placeholder="Ex: Bassin méditerranéen"
          />
        </div>
        <div className="field">
          <label>Partie à récolter</label>
          <input
            value={form.harvest_part}
            onChange={set('harvest_part')}
            placeholder="Feuilles, fruits..."
          />
        </div>
        <div className="field">
          <label>Règne (taxon)</label>
          <input
            value={form.taxon_kingdom}
            onChange={set('taxon_kingdom')}
            placeholder="Animal, Végétal..."
          />
        </div>
        <div className="field">
          <label>Grand groupe</label>
          <input
            value={form.taxon_group}
            onChange={set('taxon_group')}
            placeholder="Angiosperme..."
          />
        </div>
        <div className="field">
          <label>Famille</label>
          <input
            value={form.taxon_family}
            onChange={set('taxon_family')}
            placeholder="Famille..."
          />
        </div>
        <div className="field">
          <label>Genre</label>
          <input value={form.taxon_genus} onChange={set('taxon_genus')} placeholder="Genre..." />
        </div>
        <div className="field">
          <label>Clé GBIF</label>
          <input
            value={form.gbif_key}
            onChange={set('gbif_key')}
            placeholder="Identifiant numérique"
          />
        </div>
      </div>
      <div className="field">
        <label>Rôle dans l'écosystème</label>
        <MarkdownTextarea
          value={form.ecosystem_role}
          onChange={set('ecosystem_role')}
          rows={2}
          placeholder="Fonction écologique principale"
        />
      </div>
      <div className="field">
        <label>Utilité pour l'être humain</label>
        <MarkdownTextarea
          value={form.human_utility}
          onChange={set('human_utility')}
          rows={2}
          placeholder="Usages alimentaires, pédagogiques..."
        />
      </div>
      <div className="field">
        <label>Recommandations de plantation</label>
        <MarkdownTextarea
          value={form.planting_recommendations}
          onChange={set('planting_recommendations')}
          rows={2}
          placeholder="Semis, exposition, espacement..."
        />
      </div>
      <div className="field">
        <label>Nutriments préférés</label>
        <MarkdownTextarea
          value={form.preferred_nutrients}
          onChange={set('preferred_nutrients')}
          rows={2}
          placeholder="Azote, phosphore, potassium..."
        />
      </div>
      <div className="field">
        <label>Sources</label>
        <MarkdownTextarea
          value={form.sources}
          onChange={set('sources')}
          rows={2}
          placeholder="URL ou références, séparées par virgules"
        />
      </div>
      <p className="section-sub" style={{ marginTop: -4, marginBottom: 10 }}>
        Photos : utiliser uniquement des liens directs vers image (`.jpg`, `.png`, `.webp`, etc.) ou
        `.../wiki/Special:FilePath/...`.
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
        <div className="field">
          <label>Remarque 1</label>
          <input value={form.remark_1} onChange={set('remark_1')} placeholder="Optionnel" />
        </div>
        <div className="field">
          <label>Remarque 2</label>
          <input value={form.remark_2} onChange={set('remark_2')} placeholder="Optionnel" />
        </div>
        <div className="field">
          <label>Remarque 3</label>
          <input value={form.remark_3} onChange={set('remark_3')} placeholder="Optionnel" />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary btn-sm" onClick={onSave} disabled={saving}>
          {saving ? '...' : '💾 Sauvegarder'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </div>
  );
}

export { PlantEditForm };
