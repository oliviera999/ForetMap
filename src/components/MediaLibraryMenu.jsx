import React, { useEffect, useMemo, useState } from 'react';

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Lecture du fichier impossible'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

function mediaEmoji(type) {
  if (type === 'audio') return '🎧';
  if (type === 'video') return '🎬';
  return '🖼️';
}

export function MediaLibraryMenu({
  title = 'Bibliothèque média',
  fetchItems,
  uploadDataUrl,
  removeItem,
  onPickUrl,
  canUpload = true,
  canRemove = true,
  manageHint = '',
  defaultOpen = false,
  showToggle = true,
  allowMultiple = false,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const filtered = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((item) => String(item.mediaType || '') === filter);
  }, [filter, items]);

  async function reload() {
    setError('');
    const rows = await fetchItems();
    setItems(Array.isArray(rows) ? rows : []);
  }

  async function ensureOpen() {
    const next = !open;
    setOpen(next);
    if (!next) return;
    setBusy(true);
    try {
      await reload();
    } catch (err) {
      setError(err.message || 'Chargement impossible');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!defaultOpen) return;
    setBusy(true);
    reload()
      .catch((err) => setError(err.message || 'Chargement impossible'))
      .finally(() => setBusy(false));
  }, [defaultOpen]);

  async function onUploadFile(file) {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const dataUrl = await readFileAsDataUrl(file);
      await uploadDataUrl(dataUrl);
      await reload();
    } catch (err) {
      setError(err.message || 'Upload impossible');
    } finally {
      setBusy(false);
    }
  }

  async function onUploadFiles(fileList) {
    const files = Array.from(fileList || []).filter(Boolean);
    if (files.length === 0) return;
    for (const file of files) {
      await onUploadFile(file);
    }
  }

  async function onDelete(item) {
    if (!window.confirm('Supprimer ce média de la bibliothèque ?')) return;
    setBusy(true);
    setError('');
    try {
      await removeItem(item.relativePath);
      await reload();
    } catch (err) {
      setError(err.message || 'Suppression impossible');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="media-library-menu">
      {showToggle ? (
        <button type="button" className="btn btn-secondary btn-sm" onClick={ensureOpen}>
          {open ? 'Fermer bibliothèque média' : 'Ouvrir bibliothèque média'}
        </button>
      ) : null}
      {open ? (
        <div className="media-library-menu__panel">
          <h4 style={{ marginTop: 0 }}>{title}</h4>
          {error ? <p className="gl-error">{error}</p> : null}
          {manageHint ? <p className="gl-hint">{manageHint}</p> : null}
          <div className="media-library-menu__actions">
            {canUpload ? (
              <label className="btn btn-secondary btn-sm">
                📁 Importer
                <input
                  type="file"
                  accept="image/*,audio/*,video/*"
                  multiple={allowMultiple}
                  style={{ display: 'none' }}
                  disabled={busy}
                  onChange={(event) => {
                    const selected = event.target.files;
                    event.target.value = '';
                    if (allowMultiple) {
                      onUploadFiles(selected);
                      return;
                    }
                    onUploadFile(selected?.[0]);
                  }}
                />
              </label>
            ) : (
              <button type="button" className="btn btn-secondary btn-sm" disabled>
                📁 Importer
              </button>
            )}
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={reload}>
              Rafraîchir
            </button>
            <select value={filter} onChange={(event) => setFilter(event.target.value)} disabled={busy}>
              <option value="all">Tous</option>
              <option value="image">Images</option>
              <option value="audio">Audio</option>
              <option value="video">Vidéo</option>
            </select>
          </div>
          {busy ? <p className="gl-hint">Chargement…</p> : null}
          <ul className="media-library-menu__list">
            {filtered.map((item) => (
              <li key={item.relativePath}>
                <button type="button" className="gl-marker-row-btn" onClick={() => onPickUrl?.(item.url)}>
                  {mediaEmoji(item.mediaType)} <strong>{item.filename}</strong>
                  <span className="gl-hint"> — {item.url}</span>
                </button>
                <button type="button" className="gl-danger" onClick={() => onDelete(item)} disabled={busy || !canRemove}>
                  Supprimer
                </button>
              </li>
            ))}
            {filtered.length === 0 && !busy ? <li className="gl-hint">Aucun média dans ce filtre.</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
