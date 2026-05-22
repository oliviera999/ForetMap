import React, { useId } from 'react';

/**
 * Saisie d’image par URL et/ou fichier local (galerie ou appareil photo).
 * Utilisé dans l’admin GL (chapitres, etc.).
 */
export function GLImageSourceField({
  label = 'Image',
  url = '',
  onUrlChange,
  onPickFile,
  uploading = false,
  filePickDisabled = false,
  filePickHint = '',
  urlPlaceholder = 'https://… ou /uploads/…',
}) {
  const baseId = useId().replace(/:/g, '');
  const galleryId = `${baseId}-gallery`;
  const cameraId = `${baseId}-camera`;

  return (
    <fieldset className="gl-image-source">
      <legend>{label}</legend>
      <p className="gl-hint gl-image-source__intro">
        Collez une URL ou chargez une photo depuis votre ordinateur ou smartphone (galerie ou appareil photo).
      </p>
      <label htmlFor={`${baseId}-url`}>
        URL (optionnel si vous importez un fichier)
        <input
          id={`${baseId}-url`}
          type="url"
          value={url}
          placeholder={urlPlaceholder}
          onChange={(event) => onUrlChange?.(event.target.value)}
        />
      </label>
      <div className="gl-image-source__upload-row">
        <label
          htmlFor={galleryId}
          className="gl-btn-secondary gl-image-source__file-btn"
          style={{ cursor: uploading || filePickDisabled ? 'not-allowed' : 'pointer' }}
        >
          {uploading ? 'Envoi…' : '📁 Galerie / fichier'}
          <input
            id={galleryId}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            disabled={uploading || filePickDisabled}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) onPickFile?.(file);
            }}
          />
        </label>
        <label
          htmlFor={cameraId}
          className="gl-btn-secondary gl-image-source__file-btn"
          style={{ cursor: uploading || filePickDisabled ? 'not-allowed' : 'pointer' }}
        >
          {uploading ? 'Envoi…' : '📸 Appareil photo'}
          <input
            id={cameraId}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            disabled={uploading || filePickDisabled}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) onPickFile?.(file);
            }}
          />
        </label>
      </div>
      {filePickHint ? <p className="gl-hint">{filePickHint}</p> : null}
    </fieldset>
  );
}
