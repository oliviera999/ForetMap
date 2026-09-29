import { useCallback, useRef } from 'react';
import { withAppBase } from '../appBase.js';
import { compressImageWithPreset, isHeicFile, isLikelyImageFile } from '../platform/image';
import { armNativeFilePickerGuard, disarmNativeFilePickerGuard } from '../platform/overlayHistory';

/** Aligné sur le serveur : lib/userContentImages.js */
export const MAX_ATTACHMENT_IMAGES = 3;

const FORETMAP_ATTACHMENT_IMG_DRAG = 'application/x-foretmap-attachment-img-idx';

/* `.btn*` n'existe que dans ForetMap (index.css, chargé après les contrôles partagés : il
   l'emporte) ; `.shared-btn*` habille les mêmes boutons dans G&L. */
const PICKER_BTN_CLASS = 'btn btn-ghost btn-sm shared-btn shared-btn--ghost shared-btn--sm';

function reorderStringListByDrop(list, fromIdx, toIdx) {
  if (
    fromIdx < 0 ||
    toIdx < 0 ||
    fromIdx === toIdx ||
    fromIdx >= list.length ||
    toIdx >= list.length
  )
    return list;
  const next = [...list];
  const [removed] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, removed);
  return next;
}

function isSupportedInlineImageDataUrl(dataUrl) {
  return /^data:image\/(png|jpe?g|webp);/i.test(String(dataUrl || ''));
}

/**
 * Toute image que le navigateur sait décoder : elle est ré-encodée en JPEG (1600 px) avant
 * l'envoi. Sans cette étape, trois photos d'appareil (~15 Mo chacune) dépassaient la
 * limite du corps JSON (`docs/AUDIT_AFFICHAGE_PHOTOS_2026-09-29.md` PH-M6).
 */
function fileAllowedForAttachment(file) {
  return Boolean(file && file.size && isLikelyImageFile(file));
}

function unreadableMessage(file) {
  const name = file?.name || 'fichier';
  if (isHeicFile(file)) {
    return `Photo HEIC illisible par ce navigateur : ${name}. Sur iPhone, choisissez « Le plus compatible » (Réglages › Appareil photo › Formats) ou exportez-la en JPEG.`;
  }
  return `Format non pris en charge (JPEG, PNG ou WebP) : ${name}`;
}

/**
 * Sélection locale de photos, compressées en data URL JPEG pour l’API JSON.
 * @param {{ value: string[], onChange: (next: string[]) => void, disabled?: boolean, onNotify?: (msg: string) => void, label?: string }} props
 */
export function AttachmentImagesPicker({
  value = [],
  onChange,
  disabled = false,
  onNotify,
  label = 'Photos (optionnel, max 3 ; galerie ou appareil photo)',
}) {
  const galleryInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const list = Array.isArray(value) ? value : [];

  const addFiles = useCallback(
    async (fileList) => {
      const all = Array.from(fileList || []);
      for (const file of all) {
        if (!fileAllowedForAttachment(file)) onNotify?.(unreadableMessage(file));
      }
      const picked = all.filter(fileAllowedForAttachment);
      const next = [...list];
      for (const file of picked) {
        if (next.length >= MAX_ATTACHMENT_IMAGES) {
          onNotify?.(`Maximum ${MAX_ATTACHMENT_IMAGES} photos.`);
          break;
        }
        try {
          const dataUrl = await compressImageWithPreset(file, 'attachment');
          if (!isSupportedInlineImageDataUrl(dataUrl)) {
            onNotify?.(unreadableMessage(file));
            continue;
          }
          next.push(dataUrl);
        } catch (err) {
          const tooHeavy = /trop lourde/i.test(String(err?.message || ''));
          onNotify?.(
            tooHeavy ? `${err.message} : ${file.name || 'fichier'}` : unreadableMessage(file),
          );
        }
      }
      onChange(next.slice(0, MAX_ATTACHMENT_IMAGES));
    },
    [list, onChange, onNotify],
  );

  const removeAt = (idx) => {
    onChange(list.filter((_, i) => i !== idx));
  };

  const openGallery = () => {
    if (galleryInputRef.current) galleryInputRef.current.value = '';
    armNativeFilePickerGuard();
    galleryInputRef.current?.click();
  };

  const openCamera = () => {
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    armNativeFilePickerGuard();
    cameraInputRef.current?.click();
  };

  const atLimit = list.length >= MAX_ATTACHMENT_IMAGES;

  return (
    <div className="attachment-images-picker">
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        disabled={disabled}
        className="attachment-images-picker-input"
        aria-label={`${label} — galerie ou fichiers`}
        onChange={(e) => {
          disarmNativeFilePickerGuard();
          addFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        disabled={disabled}
        className="attachment-images-picker-input"
        aria-label={`${label} — appareil photo`}
        onChange={(e) => {
          disarmNativeFilePickerGuard();
          addFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <div className="attachment-images-picker-row attachment-images-picker-actions">
        <button
          type="button"
          className={`${PICKER_BTN_CLASS} attachment-images-picker-btn`}
          disabled={disabled || atLimit}
          onClick={openGallery}
        >
          Galerie
        </button>
        <button
          type="button"
          className={`${PICKER_BTN_CLASS} attachment-images-picker-btn`}
          disabled={disabled || atLimit}
          onClick={openCamera}
        >
          Appareil photo
        </button>
        <span className="forum-muted attachment-images-picker-hint">{label}</span>
      </div>
      {list.length > 0 && (
        <ul className="attachment-images-preview-list">
          {list.map((url, i) => (
            <li
              key={`${i}-${url.slice(0, 48)}`}
              className={`attachment-images-preview-item${list.length > 1 ? ' attachment-images-preview-item--reorder' : ''}`}
              draggable={!disabled && list.length > 1}
              onDragStart={(e) => {
                if (disabled || list.length < 2) return;
                e.dataTransfer.setData(FORETMAP_ATTACHMENT_IMG_DRAG, String(i));
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                if (disabled || list.length < 2) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(e) => {
                if (disabled || list.length < 2) return;
                e.preventDefault();
                const from = Number(e.dataTransfer.getData(FORETMAP_ATTACHMENT_IMG_DRAG));
                if (!Number.isFinite(from) || from === i) return;
                onChange(reorderStringListByDrop(list, from, i));
              }}
            >
              <img src={url} alt="" className="attachment-images-preview-thumb" />
              <button
                type="button"
                className={`${PICKER_BTN_CLASS} attachment-images-remove`}
                disabled={disabled}
                onMouseDown={(ev) => ev.stopPropagation()}
                onClick={() => removeAt(i)}
                aria-label="Retirer cette photo"
              >
                Retirer
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Affiche les URLs renvoyées par l’API (`/uploads/...`). */
export function UserContentImagesGrid({ urls = [], className = '' }) {
  if (!Array.isArray(urls) || urls.length === 0) return null;
  const wrapClass = `user-content-images-grid${className ? ` ${className}` : ''}`;
  return (
    <div className={wrapClass}>
      {urls.map((u) => (
        <a
          key={u}
          href={withAppBase(u)}
          target="_blank"
          rel="noopener noreferrer"
          className="user-content-images-grid-link"
        >
          <img
            src={withAppBase(u)}
            alt="Pièce jointe (ouvrir en taille réelle)"
            loading="lazy"
            decoding="async"
            className="user-content-images-grid-img"
          />
        </a>
      ))}
    </div>
  );
}
