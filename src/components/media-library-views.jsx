import React, { useState } from 'react';
import { api } from '../services/api';
import { MediaLibraryMenu } from './MediaLibraryMenu.jsx';

function canUseClipboard() {
  return typeof navigator !== 'undefined' && !!navigator.clipboard?.writeText;
}

function MediaLibraryView({ canManage = false }) {
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const fetchMediaLibrary = async () => {
    const data = await api('/api/media-library?limit=400');
    return Array.isArray(data?.items) ? data.items : [];
  };

  const uploadMediaLibrary = async (mediaData, options = {}) => {
    setErr('');
    await api('/api/media-library', 'POST', {
      media_data: mediaData,
      original_name: options.originalName || null,
    });
    setMsg('Média ajouté à la bibliothèque');
  };

  const deleteMediaLibrary = async (relativePath) => {
    setErr('');
    await api('/api/media-library', 'DELETE', { relative_path: relativePath });
    setMsg('Média supprimé de la bibliothèque');
  };

  const copyUrl = async (url) => {
    const mediaUrl = String(url || '').trim();
    if (!mediaUrl) return;
    setErr('');
    if (!canUseClipboard()) {
      setMsg(`URL du média : ${mediaUrl}`);
      return;
    }
    try {
      await navigator.clipboard.writeText(mediaUrl);
      setMsg('URL du média copiée');
    } catch (e) {
      setErr(e.message || 'Copie impossible');
    }
  };

  const manageHint = canManage
    ? 'Clique sur un média pour copier son URL, ou importe images, audio et vidéos.'
    : 'Lecture seule : active les droits étendus pour importer ou supprimer des médias.';

  return (
    <div className="fade-in settings-admin">
      <h2 className="section-title">🗂️ Médiathèque ForetMap</h2>
      <p className="section-sub">
        Bibliothèque des médias ForetMap (images, audio, vidéos). Cloisonnée : séparée de la médiathèque Gnomes & Licornes.
      </p>
      {err && <div className="auth-error">⚠️ {err}</div>}
      {msg && <div className="auth-success">{msg}</div>}
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
        <MediaLibraryMenu
          title="Médiathèque ForetMap (images, audio, vidéo)"
          fetchItems={fetchMediaLibrary}
          uploadDataUrl={uploadMediaLibrary}
          removeItem={deleteMediaLibrary}
          onPickUrl={copyUrl}
          canUpload={canManage}
          canRemove={canManage}
          manageHint={manageHint}
        />
      </div>
    </div>
  );
}

export { MediaLibraryView };
