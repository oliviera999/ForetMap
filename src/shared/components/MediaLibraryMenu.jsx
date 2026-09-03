import { useEffect, useMemo, useRef, useState } from 'react';
import { MediaUsageInfo } from '../media/MediaUsageInfo.jsx';
import { MediaLibraryGalleryTile } from '../media/MediaLibraryGalleryTile.jsx';
import { MediaLibraryBulkActions } from '../media/MediaLibraryBulkActions.jsx';
import {
  filterAndSortMediaLibraryItems,
  formatMediaLibrarySize,
  MEDIA_LIBRARY_SORT_OPTIONS,
  MEDIA_LIBRARY_TYPE_FILTERS,
  pruneMediaLibrarySelection,
  resolveMediaLibraryLayout,
} from '../media/mediaLibraryView.js';
import { prepareMediaImport } from '../media/mediaImport.js';
import {
  armNativeFilePickerGuard,
  disarmNativeFilePickerGuard,
} from '../platform/overlayHistory.js';
import { useAppDialogs } from './AppDialogsProvider.jsx';
import { IconAudio, IconCamera, IconClose, IconFolder, IconImage, IconVideo } from '../icons.jsx';

/** Icône chrome du type de média (lucide, aria-hidden). */
function MediaTypeIcon({ type }) {
  if (type === 'audio') return <IconAudio size={14} />;
  if (type === 'video') return <IconVideo size={14} />;
  return <IconImage size={14} />;
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
  fetchUsage = null,
}) {
  const { confirm } = useAppDialogs();
  const effectiveLayout = resolveMediaLibraryLayout({ layout, onPickUrl });
  const [open, setOpen] = useState(defaultOpen);
  const [items, setItems] = useState([]);
  const [typeFilter, setTypeFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('updated_desc');
  const [selectedPaths, setSelectedPaths] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [usageByPath, setUsageByPath] = useState({});
  const [usageReady, setUsageReady] = useState(false);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const showUsage = typeof fetchUsage === 'function';

  const galleryBulkEnabled = enableGalleryBulkActions && canRemove && effectiveLayout === 'gallery';

  const visibleItems = useMemo(
    () =>
      filterAndSortMediaLibraryItems(items, {
        filter: typeFilter,
        query: searchQuery,
        sort: sortBy,
      }),
    [items, typeFilter, searchQuery, sortBy],
  );

  const selectedCount = selectedPaths.size;

  async function reloadUsage() {
    if (!showUsage) return;
    setUsageReady(false);
    try {
      const usage = await fetchUsage();
      setUsageByPath(usage && typeof usage === 'object' ? usage : {});
    } catch (_) {
      setUsageByPath({});
    } finally {
      setUsageReady(true);
    }
  }

  async function reload() {
    setError('');
    const rows = await fetchItems();
    const nextItems = Array.isArray(rows) ? rows : [];
    setItems(nextItems);
    setSelectedPaths((prev) => pruneMediaLibrarySelection(prev, nextItems));
    await reloadUsage();
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

  /**
   * Envoie un lot de fichiers : préparation (type MIME normalisé, allègement des photos
   * lourdes) puis upload, fichier par fichier. Les échecs n'interrompent pas le lot et
   * sont restitués nommément — sur mobile, une seule photo du lot est souvent en cause.
   */
  async function onUploadFiles(fileList) {
    const files = Array.from(fileList || []).filter(Boolean);
    if (files.length === 0) return;

    setBusy(true);
    setError('');
    setNotice('');
    let uploaded = 0;
    const failures = [];

    for (const file of files) {
      try {
        const prepared = await prepareMediaImport(file);
        await uploadDataUrl(prepared.dataUrl, { originalName: prepared.originalName });
        uploaded += 1;
      } catch (err) {
        failures.push(err?.message || `« ${file.name || 'fichier'} » : import impossible`);
      }
    }

    try {
      if (uploaded > 0) await reload();
    } catch (err) {
      failures.push(err?.message || 'Rechargement impossible');
    } finally {
      setBusy(false);
    }

    if (failures.length > 0) setError(failures.join(' · '));
    if (uploaded > 0) {
      setNotice(`${uploaded} média${uploaded > 1 ? 's' : ''} importé${uploaded > 1 ? 's' : ''}.`);
    }
  }

  /**
   * Ouverture du sélecteur natif. Le clic programmatique sur un `input` masqué
   * (plutôt qu'un `<label>` englobant) est le seul geste fiable sur les WebView
   * Android, et la garde `popstate` empêche la modale hôte de se fermer au retour
   * du sélecteur — avant l'événement `change`, l'import était alors perdu.
   */
  function openPicker(ref) {
    if (busy || !ref.current) return;
    ref.current.value = '';
    armNativeFilePickerGuard();
    ref.current.click();
  }

  function onPickerChange(event) {
    disarmNativeFilePickerGuard();
    const input = event.target;
    // La liste doit être copiée AVANT la remise à zéro de l'input (qui vide `files`).
    const selected = Array.from(input.files || []);
    input.value = '';
    if (selected.length === 0) return;
    onUploadFiles(allowMultiple ? selected : selected.slice(0, 1));
  }

  async function onDelete(item) {
    if (!(await confirm({ message: 'Supprimer ce média de la bibliothèque ?', danger: true })))
      return;
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
    if (!(await confirm({ message: confirmMessage, danger: true }))) return;

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
      `Supprimer ${selectedCount} média${selectedCount > 1 ? 's' : ''} sélectionné${selectedCount > 1 ? 's' : ''} ?`,
    );
  }

  async function clearLibrary() {
    if (items.length === 0) return;
    await deletePaths(
      items.map((item) => item.relativePath),
      `Vider toute la bibliothèque (${items.length} média${items.length > 1 ? 's' : ''}) ? Cette action est irréversible.`,
    );
  }

  const panelClassName =
    effectiveLayout === 'gallery'
      ? 'media-library-menu__panel media-library-menu__panel--gallery'
      : 'media-library-menu__panel';

  const countLabel =
    visibleItems.length === items.length
      ? `${visibleItems.length} média${visibleItems.length > 1 ? 's' : ''}`
      : `${visibleItems.length} / ${items.length} média${items.length > 1 ? 's' : ''}`;

  return (
    <div
      className={`media-library-menu${effectiveLayout === 'gallery' ? ' media-library-menu--gallery' : ''}`}
    >
      {showToggle ? (
        <button type="button" className="shared-btn shared-btn--sm" onClick={ensureOpen}>
          {open ? 'Fermer bibliothèque média' : 'Ouvrir bibliothèque média'}
        </button>
      ) : null}
      {open ? (
        <div className={panelClassName}>
          <h4 style={{ marginTop: 0 }}>{title}</h4>
          {error ? <p className="shared-error">{error}</p> : null}
          {notice ? <p className="shared-success">{notice}</p> : null}
          {manageHint ? <p className="shared-hint">{manageHint}</p> : null}
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
                <select
                  value={typeFilter}
                  disabled={busy}
                  onChange={(event) => setTypeFilter(event.target.value)}
                >
                  {MEDIA_LIBRARY_TYPE_FILTERS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="media-library-menu__filter">
                <span className="media-library-menu__filter-label">Tri</span>
                <select
                  value={sortBy}
                  disabled={busy}
                  onChange={(event) => setSortBy(event.target.value)}
                >
                  {MEDIA_LIBRARY_SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="media-library-menu__actions">
              {canUpload ? (
                <>
                  <button
                    type="button"
                    className="shared-btn shared-btn--sm"
                    disabled={busy}
                    onClick={() => openPicker(fileInputRef)}
                  >
                    <IconFolder size={14} /> Importer
                  </button>
                  <button
                    type="button"
                    className="shared-btn shared-btn--sm"
                    disabled={busy}
                    onClick={() => openPicker(cameraInputRef)}
                  >
                    <IconCamera size={14} /> Prendre une photo
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,audio/*,video/*"
                    multiple={allowMultiple}
                    style={{ display: 'none' }}
                    onChange={onPickerChange}
                  />
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: 'none' }}
                    onChange={onPickerChange}
                  />
                </>
              ) : (
                <button type="button" className="shared-btn shared-btn--sm" disabled>
                  <IconFolder size={14} /> Importer
                </button>
              )}
              <button
                type="button"
                className="shared-btn shared-btn--sm"
                disabled={busy}
                onClick={reload}
              >
                Rafraîchir
              </button>
            </div>
          </div>
          {galleryBulkEnabled ? (
            <MediaLibraryBulkActions
              busy={busy}
              visibleCount={visibleItems.length}
              selectedCount={selectedCount}
              totalCount={items.length}
              onSelectAll={selectAllVisible}
              onDeselectAll={deselectAll}
              onDeleteSelected={deleteSelected}
              onClearLibrary={clearLibrary}
            />
          ) : null}
          <p className="media-library-menu__count shared-hint">
            {countLabel}
            {galleryBulkEnabled && selectedCount > 0
              ? ` · ${selectedCount} sélectionné${selectedCount > 1 ? 's' : ''}`
              : ''}
          </p>
          {busy ? <p className="shared-hint">Chargement…</p> : null}
          {effectiveLayout === 'gallery' ? (
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
                    showUsage={showUsage}
                    usage={usageByPath[item.relativePath]}
                    usageReady={usageReady}
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
                      <IconClose size={16} />
                    </button>
                  ) : null}
                </li>
              ))}
              {visibleItems.length === 0 && !busy ? (
                <li className="media-library-menu__gallery-empty shared-hint">
                  Aucun média ne correspond aux filtres.
                </li>
              ) : null}
            </ul>
          ) : (
            <ul className="media-library-menu__list">
              {visibleItems.map((item) => (
                <li key={item.relativePath}>
                  <button
                    type="button"
                    className="shared-btn shared-btn--row"
                    onClick={() => onPickUrl?.(item.url)}
                  >
                    <MediaTypeIcon type={item.mediaType} /> <strong>{item.filename}</strong>
                    {item.stableKey ? (
                      <span className="shared-hint"> · slug : {item.stableKey}</span>
                    ) : null}
                    <span className="shared-hint"> — {item.url}</span>
                    {item.size ? (
                      <span className="shared-hint"> ({formatMediaLibrarySize(item.size)})</span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    className="shared-btn shared-btn--danger shared-btn--sm"
                    onClick={() => onDelete(item)}
                    disabled={busy || !canRemove}
                  >
                    Supprimer
                  </button>
                  {showUsage ? (
                    <div className="media-library-menu__usage-row">
                      <MediaUsageInfo
                        usage={usageByPath[item.relativePath]}
                        ready={usageReady}
                        limit={5}
                      />
                    </div>
                  ) : null}
                </li>
              ))}
              {visibleItems.length === 0 && !busy ? (
                <li className="shared-hint">Aucun média ne correspond aux filtres.</li>
              ) : null}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
