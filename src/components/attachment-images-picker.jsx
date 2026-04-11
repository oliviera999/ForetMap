import React, { useCallback, useRef } from 'react';
import { withAppBase } from '../services/api';

/** Aligné sur le serveur : lib/userContentImages.js */
export const MAX_ATTACHMENT_IMAGES = 3;
const MAX_ATTACHMENT_BYTES = Math.floor(1.5 * 1024 * 1024);

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ''));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

/**
 * Sélection locale de photos (JPEG / PNG / WebP) converties en data URL pour l’API JSON.
 * @param {{ value: string[], onChange: (next: string[]) => void, disabled?: boolean, onNotify?: (msg: string) => void, label?: string }} props
 */
export function AttachmentImagesPicker({
  value = [],
  onChange,
  disabled = false,
  onNotify,
  label = 'Photos (optionnel, max 3, JPEG/PNG/WebP, 1,5 Mo chacune)',
}) {
  const inputRef = useRef(null);
  const list = Array.isArray(value) ? value : [];

  const addFiles = useCallback(
    async (fileList) => {
      const picked = Array.from(fileList || []).filter((f) => {
        const t = String(f.type || '').toLowerCase();
        return t === 'image/jpeg' || t === 'image/png' || t === 'image/webp';
      });
      const next = [...list];
      for (const file of picked) {
        if (next.length >= MAX_ATTACHMENT_IMAGES) {
          onNotify?.(`Maximum ${MAX_ATTACHMENT_IMAGES} photos.`);
          break;
        }
        if (file.size > MAX_ATTACHMENT_BYTES) {
          onNotify?.(`Photo trop lourde (max 1,5 Mo) : ${file.name || 'fichier'}`);
          continue;
        }
        try {
          const dataUrl = await readFileAsDataUrl(file);
          next.push(dataUrl);
        } catch {
          onNotify?.(`Lecture impossible : ${file.name || 'fichier'}`);
        }
      }
      onChange(next.slice(0, MAX_ATTACHMENT_IMAGES));
    },
    [list, onChange, onNotify]
  );

  const removeAt = (idx) => {
    onChange(list.filter((_, i) => i !== idx));
  };

  return (
    <div className="attachment-images-picker">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        disabled={disabled}
        className="attachment-images-picker-input"
        aria-label={label}
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <div className="attachment-images-picker-row">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={disabled || list.length >= MAX_ATTACHMENT_IMAGES}
          onClick={() => inputRef.current?.click()}
        >
          Ajouter des photos
        </button>
        <span className="forum-muted attachment-images-picker-hint">{label}</span>
      </div>
      {list.length > 0 && (
        <ul className="attachment-images-preview-list">
          {list.map((url, i) => (
            <li key={`${i}-${url.slice(0, 48)}`} className="attachment-images-preview-item">
              <img src={url} alt="" className="attachment-images-preview-thumb" />
              <button
                type="button"
                className="btn btn-ghost btn-sm attachment-images-remove"
                disabled={disabled}
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
          <img src={withAppBase(u)} alt="Photo jointe" loading="lazy" className="user-content-images-grid-img" />
        </a>
      ))}
    </div>
  );
}
