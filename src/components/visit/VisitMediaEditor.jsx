import React from 'react';
import { Tooltip } from '../Tooltip';
import { HELP_TOOLTIPS, resolveRoleText } from '../../constants/help';
import { visitMediaImgSrc, reorderVisitMediaRows } from '../../utils/visitMediaGallery.js';
import { VisitEditorialMapPhotoImportList } from '../VisitEditorialPhotoUi.jsx';

const FORETMAP_VISIT_MEDIA_DRAG_MIME = 'application/x-foretmap-visit-media-id';

/**
 * Section « Photos » de l'éditeur de visite (zone / repère), extraite de `VisitEditorPanel` (O6).
 * Présentation pure prop-driven : tout l'état (légende, URL, occupations) reste dans le parent,
 * ce composant n'émet que des intentions via ses callbacks. Les flux upload/POST/PUT/DELETE/reorder
 * sont effectués par le parent (handlers reçus en props).
 *
 * Props :
 * - `sortedVisitMedia` : photos visite déjà triées.
 * - `mapAssociatedPhotos` : photos de carte associables à ce lieu.
 * - `mediaUrl` / `onMediaUrlChange` : champ URL contrôlé.
 * - `mediaCaption` / `onMediaCaptionChange` : champ légende contrôlé.
 * - `mediaSaving` / `mediaUploading` / `mediaReorderBusy` : drapeaux d'occupation.
 * - `mediaFileRef` : ref de l'input file (déclenché par le bouton d'envoi).
 * - `onAddFromFile(e)` : changement de l'input file (envoi de fichiers).
 * - `onAddFromUrl()` : ajout depuis l'URL saisie.
 * - `onAssociateMapPhoto(photo)` : association d'une photo de carte.
 * - `onEditCaption(media)` / `onDeleteMedia(id)` : actions par photo.
 * - `onReorder(nextOrdered)` : persistance d'un nouvel ordre (glisser-déposer).
 */
export function VisitMediaEditor({
  sortedVisitMedia = [],
  mapAssociatedPhotos = [],
  mediaUrl,
  onMediaUrlChange,
  mediaCaption,
  onMediaCaptionChange,
  mediaSaving,
  mediaUploading,
  mediaReorderBusy,
  mediaFileRef,
  onAddFromFile,
  onAddFromUrl,
  onAssociateMapPhoto,
  onEditCaption,
  onDeleteMedia,
  onReorder,
}) {
  const tooltipText = (entry) => resolveRoleText(entry, true);
  return (
    <div className="visit-media-editor">
      <h5>🖼️ Photos</h5>
      <p style={{ fontSize: '.76rem', color: '#64748b', margin: '0 0 10px', lineHeight: 1.45 }}>
        Envoi d’image (comme sur la carte) ou lien URL (ex. Wikimedia, fichier déjà sur le serveur).
        {sortedVisitMedia.length > 1
          ? ' Plusieurs photos : glisser-déposer une ligne pour réordonner.'
          : ''}
      </p>
      <VisitEditorialMapPhotoImportList
        photos={mapAssociatedPhotos}
        heading="Photos déjà associées à ce lieu (carte)"
        onAssociate={onAssociateMapPhoto}
      />
      <div className="field">
        <label>Légende (optionnel)</label>
        <input value={mediaCaption} onChange={(e) => onMediaCaptionChange(e.target.value)} />
      </div>
      <input
        ref={mediaFileRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={onAddFromFile}
      />
      <button
        type="button"
        className="btn btn-secondary btn-sm btn-full"
        style={{ marginBottom: 10 }}
        disabled={mediaUploading}
        onClick={() => mediaFileRef.current?.click()}
      >
        {mediaUploading ? 'Envoi...' : '📷 Ajouter des photos (fichiers, sélection multiple)'}
      </button>
      <div className="field">
        <label>URL image</label>
        <input
          value={mediaUrl}
          onChange={(e) => onMediaUrlChange(e.target.value)}
          placeholder="https://… ou /uploads/…"
        />
      </div>
      <button
        className="btn btn-secondary btn-sm"
        disabled={mediaSaving || !mediaUrl.trim()}
        onClick={onAddFromUrl}
      >
        {mediaSaving ? 'Ajout...' : '+ Ajouter depuis URL'}
      </button>
      <div
        className="visit-media-list"
        style={{
          opacity: mediaReorderBusy ? 0.65 : 1,
          pointerEvents: mediaReorderBusy ? 'none' : undefined,
        }}
      >
        {sortedVisitMedia.map((m) => (
          <div
            key={m.id}
            className={`visit-media-row${sortedVisitMedia.length > 1 ? ' visit-media-row--reorder' : ''}`}
            draggable={sortedVisitMedia.length > 1}
            onDragStart={(e) => {
              if (sortedVisitMedia.length < 2) return;
              e.dataTransfer.setData(FORETMAP_VISIT_MEDIA_DRAG_MIME, String(m.id));
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => {
              if (sortedVisitMedia.length < 2) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(e) => {
              if (sortedVisitMedia.length < 2) return;
              e.preventDefault();
              const dragId = Number(e.dataTransfer.getData(FORETMAP_VISIT_MEDIA_DRAG_MIME));
              if (!Number.isFinite(dragId) || dragId === m.id) return;
              const next = reorderVisitMediaRows(sortedVisitMedia, dragId, m.id);
              void onReorder(next);
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            {m.image_url ? (
              <img
                src={visitMediaImgSrc(m)}
                alt=""
                style={{
                  width: 44,
                  height: 44,
                  objectFit: 'cover',
                  borderRadius: 6,
                  flexShrink: 0,
                }}
              />
            ) : null}
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {m.caption || m.image_url || `#${m.id}`}
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              aria-label="Modifier la légende"
              onMouseDown={(ev) => ev.stopPropagation()}
              onClick={() => onEditCaption(m)}
            >
              ✏️
            </button>
            <Tooltip text={tooltipText(HELP_TOOLTIPS.visit.mediaDelete)}>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                aria-label="Supprimer la photo"
                onMouseDown={(ev) => ev.stopPropagation()}
                onClick={() => onDeleteMedia(m.id)}
              >
                🗑️
              </button>
            </Tooltip>
          </div>
        ))}
      </div>
    </div>
  );
}
