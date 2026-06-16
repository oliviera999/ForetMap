import React from 'react';
import { armNativeFilePickerGuard } from '../../utils/overlayHistory';

/**
 * Champ « Photo illustrative » du formulaire de tâche (feuille prop-driven).
 *
 * Extrait de `TaskFormModal` (O6) : présentation pure. L'état image
 * (data/preview/removed/busy), les refs d'input et les handlers
 * (`onFile`/`onClear`) restent détenus par le parent — comportement inchangé.
 */
export function TaskFormImageField({
  preview,
  busy,
  galleryInputRef,
  cameraInputRef,
  onFile,
  onClear,
}) {
  return (
    <div className="field">
      <label>Photo illustrative (optionnel)</label>
      <p style={{ fontSize: '.8rem', color: '#555', margin: '0 0 8px', lineHeight: 1.45 }}>
        Depuis la galerie ou l’appareil photo : lieu, outil, plante… (JPEG/PNG/WebP, compressée à
        l’envoi)
      </p>
      {!preview ? (
        <div
          className={`img-upload-area img-upload-area--split${busy ? ' is-busy' : ''}`}
          role="group"
          aria-label="Photo illustrative : galerie ou appareil photo"
          style={busy ? { opacity: 0.7, pointerEvents: 'none' } : undefined}
        >
          <div style={{ fontSize: '2rem', marginBottom: 6 }}>📷</div>
          <div style={{ fontSize: '.85rem', color: '#888', marginBottom: 10 }}>
            {busy ? 'Traitement…' : 'Galerie ou appareil photo'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy}
              onClick={() => {
                if (busy) return;
                if (galleryInputRef.current) galleryInputRef.current.value = '';
                armNativeFilePickerGuard();
                galleryInputRef.current?.click();
              }}
            >
              📁 Choisir une photo
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy}
              onClick={() => {
                if (busy) return;
                if (cameraInputRef.current) cameraInputRef.current.value = '';
                armNativeFilePickerGuard();
                cameraInputRef.current?.click();
              }}
            >
              📸 Prendre une photo
            </button>
          </div>
          <input ref={galleryInputRef} type="file" accept="image/*" onChange={onFile} />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onFile}
          />
        </div>
      ) : (
        <div className="img-preview-wrap">
          <img src={preview} className="img-preview" alt="Aperçu photo tâche" />
          <button
            type="button"
            className="img-remove"
            onClick={onClear}
            aria-label="Retirer la photo"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
