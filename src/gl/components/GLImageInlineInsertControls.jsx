import React, { useState } from 'react';
import { apiGL } from '../services/apiGL.js';
import { compressImage, isLikelyImageFile } from '../../utils/image.js';
import { MediaLibraryMenu } from '../../components/MediaLibraryMenu.jsx';
import { GLImageFrameEditor } from './GLImageFrameEditor.jsx';
import { normalizeGlImageFrame } from '../../utils/glImageFrame.js';

export function GLImageInlineInsertControls({
  onInsert,
  onStatus,
  legend = 'Photos dans le texte',
  intro = 'Chargez une image depuis votre ordinateur ou smartphone ; elle sera ajoutée au texte.',
}) {
  const [uploading, setUploading] = useState(false);
  const [pendingInsert, setPendingInsert] = useState(null);

  async function uploadAndSelect(file) {
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
      setPendingInsert({
        url,
        alt,
        frame: normalizeGlImageFrame(null, 'markdown'),
      });
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
      <legend>{legend}</legend>
      <p className="gl-hint gl-image-source__intro">{intro}</p>
      <div className="gl-image-source__upload-row">
        <label
          className="gl-btn gl-btn--secondary gl-image-source__file-btn"
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
              uploadAndSelect(file);
            }}
          />
        </label>
        <label
          className="gl-btn gl-btn--secondary gl-image-source__file-btn"
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
              uploadAndSelect(file);
            }}
          />
        </label>
        <MediaLibraryMenu
          title="Bibliothèque média (images)"
          fetchItems={fetchMediaLibrary}
          uploadDataUrl={uploadMediaLibrary}
          removeItem={removeMediaLibrary}
          onPickUrl={(url) => setPendingInsert({ url, alt: 'Image', frame: normalizeGlImageFrame(null, 'markdown') })}
        />
      </div>

      <GLImageFrameEditor
        open={Boolean(pendingInsert?.url)}
        title="Cadre image markdown"
        context="markdown"
        imageUrl={String(pendingInsert?.url || '')}
        initialFrame={pendingInsert?.frame || null}
        onApply={({ frame }) => {
          onInsert?.({
            url: String(pendingInsert?.url || ''),
            alt: String(pendingInsert?.alt || 'Image'),
            frame,
          });
          onStatus?.('Image insérée dans le texte.');
          setPendingInsert(null);
        }}
        onClose={() => setPendingInsert(null)}
      />
    </fieldset>
  );
}
