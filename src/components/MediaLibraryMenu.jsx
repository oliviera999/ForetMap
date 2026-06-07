import React, { useEffect, useMemo, useState } from 'react';
import { withAppBase } from '../services/api.js';
import {
  filterAndSortMediaLibraryItems,
  formatMediaLibrarySize,
  MEDIA_LIBRARY_SORT_OPTIONS,
  MEDIA_LIBRARY_TYPE_FILTERS,
  pruneMediaLibrarySelection,
} from '../utils/mediaLibraryView.js';

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

function resolveMediaUrl(url) {
  return withAppBase(String(url || ''));
}

function MediaLibraryGalleryTile({
  item,
  onPickUrl,
  showMeta = false,
  selected = false,
  showSelect = false,
  onToggleSelect,
}) {
  const mediaType = String(item.mediaType || 'image');
  const mediaUrl = resolveMediaUrl(item.url);

  return (
    <div className={`media-library-menu__gallery-card${selected ? ' is-selected' : ''}`}>
      {showSelect ? (
        <label className="media-library-menu__gallery-select">
          <input
            type="checkbox"
            checked={selected}
            aria-label={`Sélectionner ${item.filename}`}
            onChange={(event) => onToggleSelect?.(event.target.checked)}
          />
        </label>
      ) : null}
      <button
        type="button"
        className="media-library-menu__gallery-tile"
        title={`Copier l’URL — ${item.filename}`}
        aria-label={`Copier l’URL — ${item.filename}`}
        onClick={() => onPickUrl?.(item.url)}
      >
        <span className="media-library-menu__gallery-preview">
          {mediaType === 'image' ? (
            <img src={mediaUrl} alt="" loading="lazy" decoding="async" />
          ) : mediaType === 'video' ? (
            <>
              <video src={mediaUrl} preload="metadata" muted playsInline aria-hidden="true" />
              <span className="media-library-menu__gallery-type">Vidéo</span>
            </>
          ) : (
            <>
              <span className="media-library-menu__gallery-icon" aria-hidden="true">🎧</span>
              <span className="media-library-menu__gallery-type">Audio</span>
            </>
          )}
        </span>
        <span className="media-library-menu__gallery-caption">{item.filename}</span>
        {showMeta ? (
          <span className="media-library-menu__gallery-meta">
            {formatMediaLibrarySize(item.size)}
          </span>
        ) : null}
      </button>
    </div>
  );
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
  layout = 'list',
  showGalleryMeta = true,
  enableGalleryBulkActions = false,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [items, setItems] = useState([]);
  const [typeFilter, setTypeFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('updated_desc');
  const [selectedPaths, setSelectedPaths] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const galleryBulkEnabled = enableGalleryBulkActions && canRemove && layout === 'gallery';

  const visibleItems = useMemo(
    () => filterAndSortMediaLibraryItems(items, {
      filter: typeFilter,
      query: searchQuery,
      sort: sortBy,
    }),
    [items, typeFilter, searchQuery, sortBy]
  );

  const selectedCount = selectedPaths.size;

  async function reload() {
    setError('');
    const rows = await fetchItems();
    const nextItems = Array.isArray(rows) ? rows : [];
    setItems(nextItems);
    setSelectedPaths((prev) => pruneMediaLibrarySelection(prev, nextItems));
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
    setNotice('');
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
    setNotice('');
    try {
      await removeItem(item.relativePath);
      await reload();
      setNotice('Média supprimé.');
    } catch (err) {
      setError(err.message || 'Suppression impossible');
    } finally {
      setBusy(false);
    }
  }

  function toggleSelection(relativePath, checked) {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (checked) next.add(relativePath);
      else next.delete(relativePath);
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedPaths(new Set(visibleItems.map((item) => item.relativePath)));
  }

  function deselectAll() {
    setSelectedPaths(new Set());
  }

  async function deletePaths(paths, confirmMessage) {
    const list = [...paths].filter(Boolean);
    if (list.length === 0) return;
    if (!window.confirm(confirmMessage)) return;

    setBusy(true);
    setError('');
    setNotice('');
    let deleted = 0;
    const failures = [];

    for (const relativePath of list) {
      try {
        await removeItem(relativePath);
        deleted += 1;
      } catch (err) {
        failures.push(err.message || relativePath);
      }
    }

    try {
      await reload();
    } catch (err) {
      setError(err.message || 'Rechargement impossible');
    } finally {
      setBusy(false);
    }

    if (failures.length > 0) {
      setError(`${deleted} supprimé(s), ${failures.length} échec(s).`);
    } else {
      setNotice(`${deleted} média${deleted > 1 ? 's' : ''} supprimé${deleted > 1 ? 's' : ''}.`);
    }
  }

  async function deleteSelected() {
    await deletePaths(
      selectedPaths,
      `Supprimer ${selectedCount} média${selectedCount > 1 ? 's' : ''} sélectionné${selectedCount > 1 ? 's' : ''} ?`
    );
  }

  async function clearLibrary() {
    if (items.length === 0) return;
    await deletePaths(
      items.map((item) => item.relativePath),
      `Vider toute la bibliothèque (${items.length} média${items.length > 1 ? 's' : ''}) ? Cette action est irréversible.`
    );
  }

  const panelClassName = layout === 'gallery'
    ? 'media-library-menu__panel media-library-menu__panel--gallery'
    : 'media-library-menu__panel';

  const countLabel = visibleItems.length === items.length
    ? `${visibleItems.length} média${visibleItems.length > 1 ? 's' : ''}`
    : `${visibleItems.length} / ${items.length} média${items.length > 1 ? 's' : ''}`;

  return (
    <div className={`media-library-menu${layout === 'gallery' ? ' media-library-menu--gallery' : ''}`}>
      {showToggle ? (
        <button type="button" className="btn btn-secondary btn-sm" onClick={ensureOpen}>
          {open ? 'Fermer bibliothèque média' : 'Ouvrir bibliothèque média'}
        </button>
      ) : null}
      {open ? (
        <div className={panelClassName}>
          <h4 style={{ marginTop: 0 }}>{title}</h4>
          {error ? <p className="gl-error">{error}</p> : null}
          {notice ? <p className="gl-success">{notice}</p> : null}
          {manageHint ? <p className="gl-hint">{manageHint}</p> : null}
          <div className="media-library-menu__toolbar">
            <div className="media-library-menu__filters">
              <label className="media-library-menu__search">
                <span className="media-library-menu__filter-label">Rechercher</span>
                <input
                  type="search"
                  value={searchQuery}
                  placeholder="Nom de fichier…"
                  disabled={busy}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </label>
              <label className="media-library-menu__filter">
                <span className="media-library-menu__filter-label">Type</span>
                <select value={typeFilter} disabled={busy} onChange={(event) => setTypeFilter(event.target.value)}>
                  {MEDIA_LIBRARY_TYPE_FILTERS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="media-library-menu__filter">
                <span className="media-library-menu__filter-label">Tri</span>
                <select value={sortBy} disabled={busy} onChange={(event) => setSortBy(event.target.value)}>
                  {MEDIA_LIBRARY_SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>
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
            </div>
          </div>
          {galleryBulkEnabled ? (
            <div className="media-library-menu__bulk">
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy || visibleItems.length === 0} onClick={selectAllVisible}>
                Tout sélectionner
              </button>
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy || selectedCount === 0} onClick={deselectAll}>
                Tout désélectionner
              </button>
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy || selectedCount === 0} onClick={deleteSelected}>
                Supprimer la sélection{selectedCount > 0 ? ` (${selectedCount})` : ''}
              </button>
              <button type="button" className="btn btn-secondary btn-sm gl-danger" disabled={busy || items.length === 0} onClick={clearLibrary}>
                Vider la bibliothèque
              </button>
            </div>
          ) : null}
          <p className="media-library-menu__count gl-hint">
            {countLabel}
            {galleryBulkEnabled && selectedCount > 0 ? ` · ${selectedCount} sélectionné${selectedCount > 1 ? 's' : ''}` : ''}
          </p>
          {busy ? <p className="gl-hint">Chargement…</p> : null}
          {layout === 'gallery' ? (
            <ul className="media-library-menu__gallery">
              {visibleItems.map((item) => (
                <li key={item.relativePath} className="media-library-menu__gallery-item">
                  <MediaLibraryGalleryTile
                    item={item}
                    onPickUrl={onPickUrl}
                    showMeta={showGalleryMeta}
                    showSelect={galleryBulkEnabled}
                    selected={selectedPaths.has(item.relativePath)}
                    onToggleSelect={(checked) => toggleSelection(item.relativePath, checked)}
                  />
                  {canRemove && !galleryBulkEnabled ? (
                    <button
                      type="button"
                      className="media-library-menu__gallery-remove"
                      title="Supprimer"
                      aria-label={`Supprimer ${item.filename}`}
                      disabled={busy}
                      onClick={() => onDelete(item)}
                    >
                      ×
                    </button>
                  ) : null}
                </li>
              ))}
              {visibleItems.length === 0 && !busy ? (
                <li className="media-library-menu__gallery-empty gl-hint">Aucun média ne correspond aux filtres.</li>
              ) : null}
            </ul>
          ) : (
            <ul className="media-library-menu__list">
              {visibleItems.map((item) => (
                <li key={item.relativePath}>
                  <button type="button" className="gl-marker-row-btn" onClick={() => onPickUrl?.(item.url)}>
                    {mediaEmoji(item.mediaType)} <strong>{item.filename}</strong>
                    <span className="gl-hint"> — {item.url}</span>
                    {item.size ? <span className="gl-hint"> ({formatMediaLibrarySize(item.size)})</span> : null}
                  </button>
                  <button type="button" className="gl-danger" onClick={() => onDelete(item)} disabled={busy || !canRemove}>
                    Supprimer
                  </button>
                </li>
              ))}
              {visibleItems.length === 0 && !busy ? <li className="gl-hint">Aucun média ne correspond aux filtres.</li> : null}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
