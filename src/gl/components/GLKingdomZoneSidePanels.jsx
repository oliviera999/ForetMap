import React from 'react';
import { MediaLibraryMenu } from '../../components/MediaLibraryMenu.jsx';
import { GLButton } from './ui/GLButton.jsx';
import {
  readZoneMusicUrl,
  readZonePopoverMarkdown,
  readZonePopoverImages,
  zoneHasPopoverDraft,
} from '../hooks/useGLKingdomZoneEditor.js';
import { GLKingdomZoneFeuilletLinker } from './GLKingdomZoneFeuilletLinker.jsx';

/** @typedef {'all' | 'toolbars' | 'panels'} GLKingdomZoneSidePanelsVariant */

export function GLKingdomZoneSidePanels({
  zoneEditor,
  canManage = true,
  zoneMusicEnabled = false,
  onDeleteZone,
  fetchMediaLibrary,
  uploadMediaLibrary,
  removeMediaLibrary,
  variant = 'all',
  showZonesHeading = true,
}) {
  const {
    mode,
    drawPoints,
    setDrawPoints,
    selectedZone,
    draftLabel,
    setDraftLabel,
    draftColor,
    setDraftColor,
    draftMusicUrl,
    setDraftMusicUrl,
    draftMusicVolumePct,
    setDraftMusicVolumePct,
    draftPopoverMarkdown,
    setDraftPopoverMarkdown,
    draftPopoverImages,
    setDraftPopoverImages,
    selectedVertexIndex,
    insertVertexMode,
    setInsertVertexMode,
    shapeSession,
    isEditingShape,
    displayZones,
    selectedZoneId,
    selectZone,
    startShapeEdit,
    cancelShapeEdit,
    saveShapeEdit,
    createZone,
    saveZoneMeta,
    clearZoneMusic,
    previewDraftMusic,
    removeSelectedVertex,
    toggleDrawMode,
  } = zoneEditor;

  const canUseMediaLibrary = typeof fetchMediaLibrary === 'function';
  const showToolbars = variant === 'all' || variant === 'toolbars';
  const showPanels = variant === 'all' || variant === 'panels';

  const toolbars = (
    <>
      {canManage && isEditingShape ? (
        <div className="gl-map-editor-toolbar gl-map-editor-toolbar--shape" role="toolbar" aria-label="Édition du contour">
          <span className="gl-shape-edit-badge">
            Contour — {draftLabel || selectedZone?.label || 'Zone'}
          </span>
          <button
            type="button"
            className="is-active"
            onClick={() => setInsertVertexMode((v) => !v)}
            title="Cliquez sur un bord du polygone (ou sur la carte) pour ajouter un sommet"
          >
            {insertVertexMode ? 'Annuler ajout sommet' : 'Ajouter un sommet'}
          </button>
          <button
            type="button"
            disabled={selectedVertexIndex == null || shapeSession.points.length <= 3}
            onClick={removeSelectedVertex}
          >
            Retirer le sommet
          </button>
          <button
            type="button"
            disabled={!shapeSession.canUndo}
            onClick={shapeSession.undo}
            title="Annuler (Ctrl+Z)"
          >
            Annuler
          </button>
          <GLButton type="button" onClick={saveShapeEdit}>
            Sauver le contour
          </GLButton>
          <GLButton type="button" variant="secondary" onClick={cancelShapeEdit}>
            Abandonner
          </GLButton>
        </div>
      ) : null}

      {canManage && !isEditingShape ? (
        <div className="gl-map-editor-toolbar gl-map-editor-toolbar--zones">
          <button
            type="button"
            className={mode === 'draw' ? 'is-active' : ''}
            onClick={toggleDrawMode}
          >
            {mode === 'draw' ? 'Annuler dessin' : 'Dessiner une zone'}
          </button>
          {mode === 'draw' && drawPoints.length > 0 ? (
            <button type="button" onClick={() => setDrawPoints((prev) => prev.slice(0, -1))}>
              Retirer le dernier point
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );

  const panels = showPanels ? (
    <>
      {isEditingShape ? (
        <p className="gl-hint">
          Glissez un sommet ou le polygone entier. « Ajouter un sommet » puis cliquez sur un bord (ou la carte).
          Raccourci&nbsp;: Ctrl+Z pour annuler. Minimum 3 sommets.
        </p>
      ) : null}

      {showZonesHeading ? <h4 className="gl-chapter-map-studio__subtitle">Zones</h4> : null}
      <ul className="gl-kingdom-map-zones">
        {displayZones.map((zone) => (
          <li key={zone.id} className={Number(selectedZoneId) === Number(zone.id) ? 'is-selected' : ''}>
            <button
              type="button"
              className="gl-marker-row-btn"
              disabled={isEditingShape}
              onClick={() => selectZone(zone.id)}
            >
              <strong>{zone.label}</strong>
              {zoneMusicEnabled && readZoneMusicUrl(zone) ? (
                <span className="gl-zone-music-badge" aria-label="Musique associée" title="Musique associée"> 🎧</span>
              ) : null}
              {zoneHasPopoverDraft(readZonePopoverMarkdown(zone), readZonePopoverImages(zone)) ? (
                <span className="gl-zone-content-badge" aria-label="Contenu popover" title="Contenu popover"> 📄</span>
              ) : null}
            </button>
            {canManage && !isEditingShape ? (
              <GLButton type="button" size="sm" variant="danger" onClick={() => onDeleteZone?.(zone.id)}>
                Supprimer
              </GLButton>
            ) : null}
          </li>
        ))}
        {displayZones.length === 0 ? (
          <li className="gl-empty gl-hint">
            <span className="gl-empty-icon" aria-hidden>🏰</span>
            Aucune zone.
          </li>
        ) : null}
      </ul>

      {canManage && mode === 'draw' ? (
        <form className="gl-form" onSubmit={(event) => { event.preventDefault(); createZone(); }}>
          <label>
            Label
            <input value={draftLabel} onChange={(event) => setDraftLabel(event.target.value)} />
          </label>
          <label>
            Couleur
            <input value={draftColor} onChange={(event) => setDraftColor(event.target.value)} />
          </label>
          <GLButton type="submit" disabled={drawPoints.length < 3}>
            Créer la zone ({drawPoints.length} points)
          </GLButton>
        </form>
      ) : null}

      {canManage && mode === 'edit' && selectedZone && !isEditingShape ? (
        <form className="gl-form gl-zone-music-form" onSubmit={(event) => { event.preventDefault(); saveZoneMeta(); }}>
          <div className="gl-inline-actions gl-zone-edit-actions">
            <GLButton type="button" onClick={startShapeEdit}>
              Modifier le contour
            </GLButton>
          </div>
          <label>
            Label
            <input value={draftLabel} onChange={(event) => setDraftLabel(event.target.value)} />
          </label>
          <label>
            Couleur
            <input value={draftColor} onChange={(event) => setDraftColor(event.target.value)} />
          </label>
          <fieldset className="gl-zone-content-fieldset">
            <legend>Popover (texte et images)</legend>
            <label>
              Texte markdown
              <textarea
                rows={5}
                value={draftPopoverMarkdown}
                onChange={(event) => setDraftPopoverMarkdown(event.target.value)}
                placeholder="Texte affiché quand une équipe entre ou traverse la zone…"
              />
            </label>
            <p className="gl-hint">Markdown accepté (glossaire, images inline via la bibliothèque média).</p>
            <div className="gl-zone-popover-images">
              <div className="gl-inline-actions">
                <strong>Galerie d’images</strong>
                {canUseMediaLibrary ? (
                  <MediaLibraryMenu
                    title="Ajouter une image"
                    fetchItems={fetchMediaLibrary}
                    uploadDataUrl={uploadMediaLibrary}
                    removeItem={removeMediaLibrary}
                    onPickUrl={(url) => {
                      const nextUrl = String(url || '').trim();
                      if (!nextUrl) return;
                      setDraftPopoverImages((prev) => [
                        ...prev,
                        { url: nextUrl, caption: '', sortOrder: prev.length },
                      ]);
                    }}
                    canUpload
                    canRemove
                    manageHint="Choisissez une image de la bibliothèque."
                  />
                ) : null}
              </div>
              {draftPopoverImages.map((img, index) => (
                <div key={`${img.url}-${index}`} className="gl-zone-popover-image-row">
                  <img src={img.url} alt="" className="gl-zone-popover-image-thumb" loading="lazy" />
                  <label>
                    Légende
                    <input
                      value={img.caption || ''}
                      onChange={(event) => {
                        const caption = event.target.value;
                        setDraftPopoverImages((prev) => prev.map((row, rowIndex) => (
                          rowIndex === index ? { ...row, caption } : row
                        )));
                      }}
                    />
                  </label>
                  <GLButton
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setDraftPopoverImages((prev) => prev.filter((_, rowIndex) => rowIndex !== index));
                    }}
                  >
                    Retirer
                  </GLButton>
                </div>
              ))}
            </div>
          </fieldset>
          <GLKingdomZoneFeuilletLinker zoneId={selectedZone?.id} canManage={canManage} />
          {zoneMusicEnabled ? (
            <fieldset className="gl-zone-music-fieldset">
              <legend>Musique d’ambiance</legend>
              <label>
                URL audio
                <input
                  value={draftMusicUrl}
                  onChange={(event) => setDraftMusicUrl(event.target.value)}
                  placeholder="/uploads/media-library/audio/..."
                />
              </label>
              {canUseMediaLibrary ? (
                <MediaLibraryMenu
                  title="Bibliothèque audio"
                  fetchItems={fetchMediaLibrary}
                  uploadDataUrl={uploadMediaLibrary}
                  removeItem={removeMediaLibrary}
                  onPickUrl={(url) => setDraftMusicUrl(String(url || ''))}
                  canUpload
                  canRemove
                  manageHint="Filtrez sur Audio pour choisir une piste."
                />
              ) : null}
              <label>
                Volume ({draftMusicVolumePct} %)
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={draftMusicVolumePct}
                  onChange={(event) => setDraftMusicVolumePct(Number(event.target.value))}
                />
              </label>
              <div className="gl-inline-actions gl-zone-music-actions">
                <GLButton type="button" variant="secondary" onClick={previewDraftMusic} disabled={!draftMusicUrl.trim()}>
                  Écouter
                </GLButton>
                <GLButton type="button" variant="ghost" onClick={clearZoneMusic} disabled={!draftMusicUrl.trim()}>
                  Retirer la musique
                </GLButton>
              </div>
            </fieldset>
          ) : null}
          <GLButton type="submit">Enregistrer la zone</GLButton>
        </form>
      ) : null}
    </>
  ) : null;

  return (
    <>
      {showToolbars ? toolbars : null}
      {panels}
    </>
  );
}
