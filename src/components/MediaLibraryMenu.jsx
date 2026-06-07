import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MEDIA_LIBRARY_SORT_OPTIONS,
  MEDIA_LIBRARY_TYPE_FILTERS,
  filterAndSortMediaLibraryItems,
  formatMediaLibrarySize,
} from '../utils/mediaLibraryView.js';

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Lecture fichier impossible'));
    reader.readAsDataURL(file);
  });
}

function mediaTypeLabel(mediaType) {
  if (mediaType === 'audio') return 'Audio';
  if (mediaType === 'video') return 'Vidéo';
  return 'Image';
}

function mediaTypeIcon(mediaType) {
  if (mediaType === 'audio') return '🎵';
  if (mediaType === 'video') return '🎬';
  return '🖼️';
}

export function MediaLibraryMenu({
  title = 'Médiathèque',
  layout = 'gallery',
  defaultOpen = false,
  showToggle = true,
  fetchItems,
  uploadDataUrl,
  removeItem,
  onPickUrl,
  canUpload = false,
  canRemove = false,
  manageHint = '',
  accept = 'image/*,audio/*,video/*',
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('updated_desc');
  const fileInputRef = useRef(null);

  const reload = useCallback(async () => {
    if (typeof fetchItems !== 'function') return;
    setLoading(true);
    setError('');
    try {
      const rows = await fetchItems();
      setItems(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setError(err.message || 'Chargement médiathèque impossible');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [fetchItems]);

  useEffect(() => {
    if (open) reload();
  }, [open, reload]);

  const visibleItems = useMemo(
    () => filterAndSortMediaLibraryItems(items, { query, filter, sort }),
    [items, query, filter, sort],
  );

  async function handleUploadChange(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || typeof uploadDataUrl !== 'function') return;
    setError('');
    try {
      const dataUrl = await readFileAsDataUrl(file);
      await uploadDataUrl(dataUrl, { originalName: file.name });
      await reload();
    } catch (err) {
      setError(err.message || 'Upload impossible');
    }
  }

  async function handleRemove(relativePath) {
    if (!canRemove || typeof removeItem !== 'function') return;
    setError('');
    try {
      await removeItem(relativePath);
      await reload();
    } catch (err) {
      setError(err.message || 'Suppression impossible');
    }
  }

  const panel = (
    <div className={`media-library-menu__panel${layout === 'gallery' ? ' media-library-menu__panel--gallery' : ''}`}>
      {canUpload ? (
        <div className="media-library-menu__actions">
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            Importer un média
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            hidden
            onChange={handleUploadChange}
          />
        </div>
      ) : null}
      {manageHint ? <p className="gl-hint">{manageHint}</p> : null}
      {error ? <p className="gl-error">{error}</p> : null}
      <div className="media-library-menu__toolbar">
        <div className="media-library-menu__filters">
          <label className="media-library-menu__search">
            <span className="media-library-menu__filter-label">Recherche</span>
            <input
              type="search"
              placeholder="Nom de fichier…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label className="media-library-menu__filter">
            <span className="media-library-menu__filter-label">Type</span>
            <select value={filter} onChange={(event) => setFilter(event.target.value)}>
              {MEDIA_LIBRARY_TYPE_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="media-library-menu__filter">
            <span className="media-library-menu__filter-label">Tri</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              {MEDIA_LIBRARY_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <p className="media-library-menu__count">
        {visibleItems.length === items.length
          ? `${items.length} média${items.length > 1 ? 's' : ''}`
          : `${visibleItems.length} / ${items.length} médias`}
      </p>
      {loading ? <p className="gl-hint">Chargement…</p> : null}
      {layout === 'gallery' ? (
        <ul className="media-library-menu__gallery">
          {visibleItems.length === 0 && !loading ? (
            <li className="media-library-menu__gallery-empty"><p className="gl-hint">Aucun média.</p></li>
          ) : null}
          {visibleItems.map((item) => {
            const label = item.label || item.filename || item.relativePath;
            const pickLabel = `Copier l’URL — ${label}`;
            return (
              <li key={item.relativePath} className="media-library-menu__gallery-item">
                <button
                  type="button"
                  className="media-library-menu__gallery-tile"
                  aria-label={pickLabel}
                  onClick={() => onPickUrl?.(item.url)}
                >
                  <span className="media-library-menu__gallery-preview">
                    {item.mediaType === 'image' ? (
                      <img src={item.url} alt="" loading="lazy" />
                    ) : (
                      <span className="media-library-menu__gallery-icon" aria-hidden>{mediaTypeIcon(item.mediaType)}</span>
                    )}
                    <span className="media-library-menu__gallery-type">{mediaTypeLabel(item.mediaType)}</span>
                  </span>
                  <span className="media-library-menu__gallery-caption">{label}</span>
                  <span className="media-library-menu__gallery-meta">{formatMediaLibrarySize(item.size)}</span>
                </button>
                {canRemove ? (
                  <button
                    type="button"
                    className="media-library-menu__gallery-remove"
                    aria-label={`Supprimer ${label}`}
                    onClick={() => handleRemove(item.relativePath)}
                  >
                    ×
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="media-library-menu__list">
          {visibleItems.map((item) => (
            <li key={item.relativePath}>
              <button type="button" onClick={() => onPickUrl?.(item.url)}>
                {item.label || item.filename}
              </button>
              {canRemove ? (
                <button type="button" onClick={() => handleRemove(item.relativePath)}>Supprimer</button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="media-library-menu">
      {showToggle ? (
        <button type="button" onClick={() => setOpen((value) => !value)}>
          {open ? 'Masquer' : 'Afficher'} {title}
        </button>
      ) : null}
      {open || !showToggle ? panel : null}
    </div>
  );
}
