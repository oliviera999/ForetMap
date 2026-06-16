import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { withAppBase } from '../services/api';
import { useDialogA11y } from '../hooks/useDialogA11y';
import { lockBodyScroll } from '../utils/body-scroll-lock';

/** Vignette (préfère thumb_url). */
export function editorialPhotoThumbSrc(photo) {
  const u = photo?.thumb_url || photo?.image_url;
  return u ? withAppBase(u) : '';
}

/** Plein écran (résolution principale). */
export function editorialPhotoFullSrc(photo) {
  const u = photo?.image_url || photo?.thumb_url;
  return u ? withAppBase(u) : '';
}

function editorialPhotoLabel(photo) {
  const cap = String(photo?.caption || '').trim();
  if (cap) return cap;
  const id = photo?.id;
  if (id != null && Number.isFinite(Number(id))) return `Photo #${id}`;
  return 'Photo';
}

function EditorialPhotoLightbox({ src, caption, onClose }) {
  const el = useMemo(() => document.createElement('div'), []);
  const dialogRef = useDialogA11y(onClose);
  useEffect(() => {
    const releaseBodyScroll = lockBodyScroll();
    document.body.appendChild(el);
    return () => {
      try {
        if (document.body.contains(el)) document.body.removeChild(el);
      } finally {
        releaseBodyScroll();
      }
    };
  }, [el]);

  const content = (
    <div className="editorial-photo-lightbox" onClick={onClose} role="presentation">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Aperçu image"
        tabIndex={-1}
        className="editorial-photo-lightbox__dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <img src={src} alt={caption || ''} decoding="async" onClick={(e) => e.stopPropagation()} />
        {caption ? <p className="editorial-photo-lightbox__caption">{caption}</p> : null}
        <button
          type="button"
          className="editorial-photo-lightbox__close"
          aria-label="Fermer l'aperçu"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
    </div>
  );

  return createPortal(content, el);
}

/** Miniature cliquable : aperçu plein écran, ou sélection (mode picker). */
export function VisitEditorialPhotoThumb({
  photo,
  mode = 'preview',
  selected = false,
  onToggle,
  className = '',
}) {
  const thumbSrc = editorialPhotoThumbSrc(photo);
  const fullSrc = editorialPhotoFullSrc(photo);
  const [previewOpen, setPreviewOpen] = useState(false);
  const label = editorialPhotoLabel(photo);

  if (!thumbSrc || !fullSrc) {
    return (
      <div
        className={`visit-editorial-photo-thumb visit-editorial-photo-thumb--empty ${className}`.trim()}
        aria-hidden
      >
        🌿
      </div>
    );
  }

  const openPreview = () => setPreviewOpen(true);

  const handleClick = () => {
    if (mode === 'picker' && onToggle) {
      onToggle();
      return;
    }
    openPreview();
  };

  const handleDoubleClick = (e) => {
    if (mode !== 'picker') return;
    e.preventDefault();
    openPreview();
  };

  const cap = String(photo?.caption || '').trim();
  const aria =
    mode === 'picker'
      ? selected
        ? `Retirer ${label} du bloc`
        : `Ajouter ${label} au bloc`
      : cap
        ? `Agrandir : ${cap}`
        : 'Agrandir la photo';

  return (
    <>
      {previewOpen ? (
        <EditorialPhotoLightbox src={fullSrc} caption={cap} onClose={() => setPreviewOpen(false)} />
      ) : null}
      <button
        type="button"
        className={`visit-editorial-photo-thumb ${selected ? 'visit-editorial-photo-thumb--selected' : ''} ${className}`.trim()}
        aria-pressed={mode === 'picker' ? !!selected : undefined}
        aria-label={aria}
        title={mode === 'picker' ? `${aria} · double-clic : aperçu` : aria}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      >
        <img src={thumbSrc} alt="" loading="lazy" decoding="async" />
        {cap ? <span className="visit-editorial-photo-thumb__cap">{cap}</span> : null}
      </button>
    </>
  );
}

/** Photos carte → association visite (miniatures + action). */
export function VisitEditorialMapPhotoImportList({
  photos,
  onAssociate,
  associateLabel = 'Associer à la visite',
  heading = null,
}) {
  const list = Array.isArray(photos) ? photos.filter((p) => p?.image_url) : [];
  if (!list.length) return null;

  return (
    <div className="visit-media-import-from-map">
      {heading ? <h6>{heading}</h6> : null}
      <div className="visit-media-import-from-map__list visit-media-import-from-map__list--thumbs">
        {list.map((ph) => (
          <div
            key={String(ph.id)}
            className="visit-media-import-from-map__item visit-media-import-from-map__item--thumb"
          >
            <VisitEditorialPhotoThumb photo={ph} mode="preview" />
            <div className="visit-media-import-from-map__item-meta">
              <span className="visit-media-import-from-map__item-label">
                {editorialPhotoLabel(ph)}
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => onAssociate?.(ph)}
              >
                {associateLabel}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Sélection 1–2 médias visite pour un bloc image éditorial. */
export function VisitEditorialMediaIdPicker({
  mediaList,
  selectedIds = [],
  onChange,
  maxCount = 2,
  emptyHint = 'Aucune photo visite — ajoute-en dans l’onglet Photos ou associe une photo carte ci-dessus.',
}) {
  const media = Array.isArray(mediaList)
    ? mediaList.filter((m) => m?.image_url || m?.thumb_url)
    : [];
  const selectedSet = useMemo(
    () => new Set((selectedIds || []).map((x) => Number(x)).filter((n) => Number.isFinite(n))),
    [selectedIds],
  );

  const toggle = (id) => {
    const n = Number(id);
    if (!Number.isFinite(n)) return;
    const next = new Set(selectedSet);
    if (next.has(n)) next.delete(n);
    else {
      if (next.size >= maxCount) return;
      next.add(n);
    }
    onChange?.([...next]);
  };

  if (!media.length) {
    return <p className="visit-editorial-media-picker__empty">{emptyHint}</p>;
  }

  return (
    <div className="visit-editorial-media-picker">
      <p className="visit-editorial-media-picker__hint">
        {maxCount > 1
          ? `Clique pour choisir jusqu’à ${maxCount} photos (double-clic : aperçu).`
          : 'Clique pour choisir la photo (double-clic : aperçu).'}
      </p>
      <div className="visit-editorial-media-picker__grid">
        {media.map((m) => (
          <VisitEditorialPhotoThumb
            key={m.id}
            photo={m}
            mode="picker"
            selected={selectedSet.has(Number(m.id))}
            onToggle={() => toggle(m.id)}
          />
        ))}
      </div>
    </div>
  );
}
