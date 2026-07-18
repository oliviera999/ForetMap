import React from 'react';
import { AutoSaveStatus } from '../../shared/components/AutoSaveStatus.jsx';
import { GLButton } from './ui/GLButton.jsx';
import { GLMarkerEventEditor } from './GLMarkerEventEditor.jsx';
import { GLMarkerAppearanceEditor } from './GLMarkerAppearanceEditor.jsx';

// Formulaire d'édition d'un repère (panneau périphérique, piloté par props).
// Aucune logique de gestes / coordonnées : les champs x/y sont de simples
// entrées liées à `markerForm` ; toute persistance reste dans le parent.
export function GLChapterMarkerForm({
  markerForm,
  onFieldChange,
  isAddMode,
  chapterBiomes = [],
  selectedMarker,
  onSubmit,
  onEventDraftChange,
  effectsDraft,
  onEffectsDraftChange,
  appearanceForm,
  onAppearanceFormChange,
  eventDraft,
  fetchMediaLibrary,
  uploadMediaLibrary,
  removeMediaLibrary,
  markerSaveError,
  markerSaveStatus,
  onDuplicateMarker,
  onDeleteMarker,
  zoneEditActive,
  saving,
}) {
  return (
    <form className="gl-form" onSubmit={onSubmit}>
      <label>
        Label
        <input
          value={markerForm.label}
          onChange={(event) => onFieldChange('label', event.target.value)}
          required
        />
      </label>
      <label>
        x (%)
        <input
          type="number"
          min="0"
          max="100"
          step="0.1"
          value={markerForm.xPct}
          onChange={(event) => onFieldChange('xPct', event.target.value)}
          readOnly={isAddMode}
        />
      </label>
      <label>
        y (%)
        <input
          type="number"
          min="0"
          max="100"
          step="0.1"
          value={markerForm.yPct}
          onChange={(event) => onFieldChange('yPct', event.target.value)}
          readOnly={isAddMode}
        />
      </label>
      <label>
        Description
        <input
          value={markerForm.description}
          onChange={(event) => onFieldChange('description', event.target.value)}
        />
      </label>
      <label>
        Sous-biome (slug catalogue)
        <input
          list="gl-chapter-biome-slugs"
          value={markerForm.sousBiomeSlug}
          onChange={(event) => onFieldChange('sousBiomeSlug', event.target.value)}
          placeholder="jungle_afc, savane…"
        />
        <datalist id="gl-chapter-biome-slugs">
          {(chapterBiomes || []).map((b) => (
            <option key={b.slug} value={b.slug}>
              {b.nom || b.slug}
            </option>
          ))}
        </datalist>
      </label>
      <label>
        Effet mécanique (résumé)
        <input
          value={markerForm.effetMecanique}
          onChange={(event) => onFieldChange('effetMecanique', event.target.value)}
          placeholder="Avance de 2 cases, +1 gemme…"
        />
      </label>

      <GLMarkerEventEditor
        marker={selectedMarker}
        chapterBiomes={chapterBiomes}
        onChange={onEventDraftChange}
        effectsDraft={effectsDraft}
        onEffectsDraftChange={onEffectsDraftChange}
      />

      <GLMarkerAppearanceEditor
        value={appearanceForm}
        onChange={onAppearanceFormChange}
        eventType={eventDraft?.eventType}
        fetchMediaLibrary={fetchMediaLibrary}
        uploadMediaLibrary={uploadMediaLibrary}
        removeMediaLibrary={removeMediaLibrary}
      />

      <label>
        Ordre
        <input
          type="number"
          value={markerForm.orderIndex}
          onChange={(event) => onFieldChange('orderIndex', event.target.value)}
        />
      </label>
      <div className="gl-inline-actions">
        {markerSaveError ? <p className="gl-error">{markerSaveError}</p> : null}
        <AutoSaveStatus status={markerSaveStatus} className="gl-hint" />
        {selectedMarker ? (
          <>
            <GLButton
              type="button"
              variant="secondary"
              onClick={() => onDuplicateMarker(selectedMarker)}
              disabled={zoneEditActive || saving}
              loading={saving}
            >
              Dupliquer
            </GLButton>
            <GLButton
              type="button"
              variant="danger"
              onClick={onDeleteMarker}
              disabled={zoneEditActive}
            >
              Supprimer
            </GLButton>
          </>
        ) : null}
      </div>
    </form>
  );
}
