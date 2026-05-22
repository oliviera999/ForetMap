import React, { useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { compressImage, isLikelyImageFile } from '../../utils/image.js';
import { applyMarkdownImage } from '../../utils/markdown.js';
import { MediaLibraryMenu } from '../../components/MediaLibraryMenu.jsx';

/**
 * Import d’image (fichier ou bibliothèque) et insertion Markdown dans un textarea.
 */
export function GLMarkdownImageInsert({
  textareaRef,
  value,
  onChange,
  onStatus,
}) {
  const [uploading, setUploading] = useState(false);

  function applyInsert(url, alt = 'Image') {
    const el = textareaRef?.current;
    const start = el?.selectionStart ?? String(value ?? '').length;
    const end = el?.selectionEnd ?? start;
    const result = applyMarkdownImage(String(value ?? ''), start, end, url, alt);
    onChange({ target: { value: result.value } });
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
    onStatus?.('Image insérée dans le texte.');
  }

  async function uploadAndInsert(file) {
    if (!file || !isLikelyImageFile(file)) {
      onStatus?.('Format d’image non reconnu (JPEG, PNG ou WebP).', true);
      return;
    }
    setUploading(true);
    try {
      const mediaData = await compressImage(file, 2000, 0.85);
      const saved = await apiGL('/api/gl/admin/media-library', 'POST', { media_data: mediaData });
      const url = String(saved?.url || '').trim();
      if (!url) throw new Error('URL média manquante après import');
      const alt = String(file.name || 'Image').replace(/\.[^.]+$/, '') || 'Image';
      applyInsert(url, alt);
    } catch (err) {
      onStatus?.(err.message || 'Import image impossible', true);
    } finally {
      setUploading(false);
    }
  }

  async function fetchMediaLibrary() {
    const data = await apiGL('/api/gl/admin/media-library?limit=400');
    return Array.isArray(data?.items) ? data.items : [];
  }

  async function uploadMediaLibrary(mediaData) {
    await apiGL('/api/gl/admin/media-library', 'POST', { media_data: mediaData });
    onStatus?.('Média ajouté à la bibliothèque');
  }

  async function removeMediaLibrary(relativePath) {
    await apiGL('/api/gl/admin/media-library', 'DELETE', { relative_path: relativePath });
    onStatus?.('Média supprimé de la bibliothèque');
  }

  return (
    <fieldset className="gl-image-source gl-markdown-image-insert">
      <legend>Photos dans le texte</legend>
      <p className="gl-hint gl-image-source__intro">
        Chargez une image depuis votre ordinateur ou smartphone ; elle sera ajoutée au markdown de la page.
      </p>
      <div className="gl-image-source__upload-row">
        <label
          className="gl-btn-secondary gl-image-source__file-btn"
          style={{ cursor: uploading ? 'wait' : 'pointer' }}
        >
          {uploading ? 'Envoi…' : '📁 Galerie / fichier'}
          <input
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              uploadAndInsert(file);
            }}
          />
        </label>
        <label
          className="gl-btn-secondary gl-image-source__file-btn"
          style={{ cursor: uploading ? 'wait' : 'pointer' }}
        >
          {uploading ? 'Envoi…' : '📸 Appareil photo'}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              uploadAndInsert(file);
            }}
          />
        </label>
        <MediaLibraryMenu
          title="Bibliothèque média (images)"
          fetchItems={fetchMediaLibrary}
          uploadDataUrl={uploadMediaLibrary}
          removeItem={removeMediaLibrary}
          onPickUrl={(url) => applyInsert(url, 'Image')}
        />
      </div>
    </fieldset>
  );
}
