import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { withAppBase } from '../../services/api';
import { isSpriteLibraryPreviewableUrl } from '../../utils/visitMascotPackTiming.js';
import { buildStateOptions, getStateLabel } from '../../utils/visitMascotBehaviorRegistry.js';
import {
  buildUnifiedMascotImageEntries,
  filterMascotImageEntriesForSelectionCriterion,
  pruneMascotImageSelection,
  resolveSelectedMascotImageEntries,
  getFilenamesInPackState,
} from '../../utils/visitMascotPackManager.js';
import { findContiguousFilenameBlock } from '../../utils/mascotPackEditorFrames.js';
import { downloadApiFile } from '../../utils/downloadApiFile.js';
import MascotPackImagesBulkBar from './MascotPackImagesBulkBar.jsx';
import MascotPackInteractionBulkDialog from './MascotPackInteractionBulkDialog.jsx';

const SOURCE_FILTERS = [
  { id: 'all', label: 'Toutes' },
  { id: 'pack', label: 'Ce pack' },
  { id: 'map', label: 'Carte' },
  { id: 'site', label: 'Site' },
];

/**
 * Panneau Images unifié : médiathèque du pack, bibliothèque carte et assets globaux
 * avec sélection multiple et actions groupées.
 */
export default function MascotPackImagesPanel({
  packUuid,
  mapId,
  packAssets,
  packAssetsLoading,
  packAssetsMessage,
  libAssets,
  libLoading,
  libMessage,
  globalAssets,
  globalAssetsLoading,
  globalAssetsMessage,
  editorPack = {},
  packVersion = 1,
  targetState,
  onTargetStateChange,
  sourceFilter,
  onSourceFilterChange,
  search,
  onSearchChange,
  onReloadAll,
  onPackUpload,
  onMapUpload,
  onSetFramesBasePack,
  onSetFramesBaseMap,
  onInsertImage,
  onBulkInsert,
  onDeletePackAsset,
  onDeleteMapAsset,
  onDeletePublicAsset,
  onBulkDelete,
  onBulkRename,
  onBulkReplace,
  onRemoveFromTargetState,
  onMoveInTargetState,
  onBulkInteractionApply,
  onUpgradeToV2,
  bulkBusy = false,
  insertFeedback = '',
}) {
  const [copyFeedback, setCopyFeedback] = useState('');
  const [downloadBusy, setDownloadBusy] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [interactionOpen, setInteractionOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renamePrefix, setRenamePrefix] = useState('');
  const [renameSuffix, setRenameSuffix] = useState('');
  const [renameFind, setRenameFind] = useState('');
  const [renameReplace, setRenameReplace] = useState('');
  const replaceInputRef = useRef(null);

  const entries = useMemo(
    () =>
      buildUnifiedMascotImageEntries({
        packAssets,
        libAssets,
        globalAssets,
        packUuid,
        mapId,
        sourceFilter,
        search,
      }),
    [packAssets, libAssets, globalAssets, packUuid, mapId, sourceFilter, search],
  );

  useEffect(() => {
    setSelectedIds((prev) => pruneMascotImageSelection(prev, entries));
  }, [entries]);

  const selectedEntries = useMemo(
    () => resolveSelectedMascotImageEntries(selectedIds, entries),
    [selectedIds, entries],
  );

  const selectionCtx = useMemo(
    () => ({ pack: editorPack, targetState, sourceFilter }),
    [editorPack, targetState, sourceFilter],
  );

  const loading = packAssetsLoading || libLoading || globalAssetsLoading || bulkBusy;
  const statusMessage = [
    packAssetsMessage,
    libMessage,
    globalAssetsMessage,
    insertFeedback,
    copyFeedback,
  ]
    .map((m) => String(m || '').trim())
    .filter(Boolean)
    .join(' · ');

  const targetLabel = getStateLabel(targetState, editorPack);
  const stateOptions = buildStateOptions(editorPack);

  const canRename = selectedEntries.every(
    (e) => e.deleteScope === 'pack' || e.deleteScope === 'map',
  );
  const canReplace = selectedEntries.every(
    (e) => e.deleteScope === 'pack' || e.deleteScope === 'map',
  );
  const targetFilenames = useMemo(
    () => getFilenamesInPackState(editorPack, targetState),
    [editorPack, targetState],
  );
  const selectedFilenamesInTarget = selectedEntries
    .map((e) => String(e.filename || '').trim())
    .filter((fn) => fn && targetFilenames.has(fn));
  const canRemoveFromState = selectedFilenamesInTarget.length > 0;

  const blockInfo = useMemo(() => {
    const spec = editorPack?.stateFrames?.[targetState];
    const files = spec && typeof spec === 'object' && Array.isArray(spec.files) ? spec.files : [];
    if (selectedFilenamesInTarget.length === 0) return null;
    return findContiguousFilenameBlock(files, selectedFilenamesInTarget);
  }, [editorPack, targetState, selectedFilenamesInTarget]);

  const toggleSelection = useCallback((entryId, checked) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const id = String(entryId || '').trim();
      if (!id) return prev;
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const selectEntries = useCallback((list) => {
    setSelectedIds(new Set(list.map((e) => String(e.id))));
  }, []);

  const selectAllVisible = useCallback(() => selectEntries(entries), [entries, selectEntries]);
  const deselectAll = useCallback(() => setSelectedIds(new Set()), []);
  const invertSelection = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set();
      for (const e of entries) {
        const id = String(e.id);
        if (!prev.has(id)) next.add(id);
      }
      return next;
    });
  }, [entries]);

  const selectByCriterion = useCallback(
    (criterion) => {
      selectEntries(
        filterMascotImageEntriesForSelectionCriterion(entries, criterion, selectionCtx),
      );
    },
    [entries, selectionCtx, selectEntries],
  );

  const copyUrl = useCallback((url) => {
    const value = String(url || '').trim();
    if (!value) return;
    void navigator.clipboard.writeText(value).then(() => {
      setCopyFeedback('URL copiée.');
      setTimeout(() => setCopyFeedback(''), 2500);
    });
  }, []);

  const downloadAsset = useCallback(async (entry) => {
    const url = String(entry?.url || '').trim();
    const filename = String(entry?.filename || 'asset').trim() || 'asset';
    if (!url) return;
    setDownloadBusy(url);
    try {
      if (url.startsWith('/api/')) {
        await downloadApiFile(url, filename);
      } else {
        const link = document.createElement('a');
        link.href = withAppBase(url);
        link.download = filename;
        link.click();
      }
    } finally {
      setDownloadBusy('');
    }
  }, []);

  const handleDeleteOne = useCallback(
    (entry) => {
      const scope = entry?.deleteScope;
      if (scope === 'pack') onDeletePackAsset(entry.filename);
      else if (scope === 'map') onDeleteMapAsset(entry.filename);
      else if (scope === 'public') onDeletePublicAsset(entry.deleteUrl || entry.url);
    },
    [onDeletePackAsset, onDeleteMapAsset, onDeletePublicAsset],
  );

  const handleBulkInsert = useCallback(() => {
    if (selectedEntries.length === 0) return;
    onBulkInsert?.(selectedEntries);
  }, [selectedEntries, onBulkInsert]);

  const handleBulkDelete = useCallback(() => {
    if (selectedEntries.length === 0) return;
    onBulkDelete?.(selectedEntries);
  }, [selectedEntries, onBulkDelete]);

  const previewRename = useCallback(
    (filename) => {
      let name = String(filename || '').trim();
      if (renameFind) {
        name = name.split(renameFind).join(renameReplace);
      }
      if (renamePrefix) name = `${renamePrefix}${name}`;
      if (renameSuffix) {
        if (name.toLowerCase().endsWith('.png')) {
          name = `${name.slice(0, -4)}${renameSuffix}.png`;
        } else {
          name = `${name}${renameSuffix}.png`;
        }
      }
      return name;
    },
    [renameFind, renameReplace, renamePrefix, renameSuffix],
  );

  const handleConfirmRename = useCallback(() => {
    const pairs = selectedEntries
      .filter((e) => e.deleteScope === 'pack' || e.deleteScope === 'map')
      .map((e) => ({
        entry: e,
        newFilename: previewRename(e.filename),
      }))
      .filter((p) => p.newFilename && p.newFilename !== p.entry.filename);
    if (pairs.length === 0) return;
    onBulkRename?.(pairs);
    setRenameOpen(false);
    setRenamePrefix('');
    setRenameSuffix('');
    setRenameFind('');
    setRenameReplace('');
  }, [selectedEntries, previewRename, onBulkRename]);

  const handleReplacePick = useCallback(() => {
    replaceInputRef.current?.click();
  }, []);

  const handleReplaceFiles = useCallback(
    (ev) => {
      const files = ev.target?.files;
      ev.target.value = '';
      if (!files?.length || selectedEntries.length === 0) return;
      onBulkReplace?.(selectedEntries, files);
    },
    [selectedEntries, onBulkReplace],
  );

  return (
    <section
      className="mascot-pack-images-panel mascot-pack-wysiwyg__library"
      aria-label="Images mascotte"
    >
      <h3 className="mascot-pack-wysiwyg__h">Images</h3>
      <p className="section-sub" style={{ fontSize: '0.82rem', marginTop: 0 }}>
        Médiathèque du pack, bibliothèque partagée de la carte et catalogue du site — cochez des
        sprites puis utilisez les actions groupées, ou ajoutez une image via « + État ».
      </p>

      <div className="mascot-pack-images-panel__toolbar">
        <label className="mascot-pack-images-panel__target">
          <span className="section-sub" style={{ fontSize: '0.78rem' }}>
            État cible
          </span>
          <select
            className="form-select"
            value={targetState}
            onChange={(e) => onTargetStateChange(e.target.value)}
            aria-label="État d’animation cible pour l’insertion d’images"
          >
            {stateOptions.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
                {opt.custom ? ' (perso)' : ''} ({opt.key})
              </option>
            ))}
          </select>
        </label>
        <input
          className="form-input mascot-pack-images-panel__search"
          placeholder="Filtrer (nom, source, URL)…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Filtrer les images"
        />
      </div>

      <div
        className="mascot-pack-images-panel__filters"
        role="group"
        aria-label="Filtrer par origine"
      >
        {SOURCE_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`btn btn-sm ${sourceFilter === f.id ? 'btn-primary' : 'btn-ghost'}`}
            aria-pressed={sourceFilter === f.id}
            onClick={() => onSourceFilterChange(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <MascotPackImagesBulkBar
        busy={loading}
        selectedCount={selectedIds.size}
        visibleCount={entries.length}
        targetLabel={targetLabel}
        canRename={canRename && selectedEntries.length > 0}
        canReplace={canReplace && selectedEntries.length > 0}
        canRemoveFromState={canRemoveFromState}
        canMoveBlock={Boolean(blockInfo)}
        onSelectAll={selectAllVisible}
        onDeselectAll={deselectAll}
        onInvertSelection={invertSelection}
        onSelectDeletable={() => selectByCriterion('deletable')}
        onSelectUnreferenced={() => selectByCriterion('unreferenced')}
        onSelectInTargetState={() => selectByCriterion('in_target_state')}
        onSelectSourceFilter={() => selectByCriterion('source_filter')}
        onBulkInsert={handleBulkInsert}
        onBulkDelete={handleBulkDelete}
        onBulkRename={() => setRenameOpen(true)}
        onBulkReplace={handleReplacePick}
        onRemoveFromTargetState={() => onRemoveFromTargetState?.(selectedFilenamesInTarget)}
        onMoveBlockUp={() => onMoveInTargetState?.(selectedFilenamesInTarget, 'up', blockInfo)}
        onMoveBlockDown={() => onMoveInTargetState?.(selectedFilenamesInTarget, 'down', blockInfo)}
        onOpenInteractionDialog={() => setInteractionOpen(true)}
      />

      <input
        ref={replaceInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleReplaceFiles}
      />

      <div className="mascot-pack-images-panel__actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onReloadAll}>
          Actualiser tout
        </button>
        {packUuid ? (
          <>
            <label className="btn btn-primary btn-sm" style={{ cursor: 'pointer' }}>
              Envoyer au pack…
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={onPackUpload}
              />
            </label>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onSetFramesBasePack}>
              framesBase → pack
            </button>
          </>
        ) : null}
        <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
          Importer sur la carte…
          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={onMapUpload} />
        </label>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onSetFramesBaseMap}>
          framesBase → carte
        </button>
      </div>

      {statusMessage ? (
        <p className="section-sub" role="status" aria-live="polite" style={{ marginTop: 8 }}>
          {statusMessage}
        </p>
      ) : null}
      {loading ? <p className="section-sub">Chargement des images…</p> : null}

      {!loading && entries.length === 0 ? (
        <p className="section-sub" style={{ marginTop: 10 }}>
          Aucune image pour ce filtre — importez un PNG ou élargissez la recherche.
        </p>
      ) : null}

      {entries.length > 0 ? (
        <ul className="mascot-pack-wysiwyg__asset-grid" style={{ marginTop: 12 }}>
          {entries.map((entry) => {
            const previewable = isSpriteLibraryPreviewableUrl(entry.previewUrl || entry.url);
            const isDownloading = downloadBusy === entry.url;
            const isSelected = selectedIds.has(String(entry.id));
            return (
              <li
                key={entry.id}
                className={`mascot-pack-wysiwyg__asset-card${isSelected ? ' is-selected' : ''}`}
              >
                <label className="mascot-pack-images-panel__select">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    aria-label={`Sélectionner ${entry.filename}`}
                    onChange={(ev) => toggleSelection(entry.id, ev.target.checked)}
                  />
                </label>
                <button
                  type="button"
                  className="mascot-pack-wysiwyg__asset-thumb"
                  onClick={() => toggleSelection(entry.id, !isSelected)}
                  title={isSelected ? 'Désélectionner' : 'Sélectionner'}
                >
                  {previewable ? (
                    <img
                      src={withAppBase(entry.previewUrl || entry.url)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <span className="section-sub" style={{ fontSize: '0.72rem', padding: 8 }}>
                      Pas d’aperçu
                    </span>
                  )}
                </button>
                <div className="mascot-pack-wysiwyg__asset-name">
                  <span className="mascot-pack-images-panel__badge">{entry.sourceLabel}</span>
                  <code>{entry.filename}</code>
                  {entry.meta ? (
                    <span className="section-sub" style={{ display: 'block', fontSize: '0.72rem' }}>
                      {entry.meta}
                    </span>
                  ) : null}
                </div>
                <div className="mascot-pack-wysiwyg__asset-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => onInsertImage(entry)}
                  >
                    + {targetLabel}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => copyUrl(entry.url)}
                  >
                    Copier URL
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={isDownloading}
                    onClick={() => void downloadAsset(entry)}
                  >
                    {isDownloading ? '…' : 'Télécharger'}
                  </button>
                  {entry.canDelete ? (
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => handleDeleteOne(entry)}
                    >
                      Supprimer
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      <MascotPackInteractionBulkDialog
        open={interactionOpen}
        onClose={() => setInteractionOpen(false)}
        packVersion={packVersion}
        defaultTargetState={targetState}
        pack={editorPack}
        onUpgradeToV2={onUpgradeToV2}
        onApply={onBulkInteractionApply}
      />

      {renameOpen ? (
        <div className="modal-overlay" role="presentation" onClick={() => setRenameOpen(false)}>
          <div
            className="modal-content mascot-pack-images-rename-dialog"
            role="dialog"
            aria-labelledby="mascot-rename-title"
            aria-modal="true"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h3 id="mascot-rename-title" className="mascot-pack-wysiwyg__h">
              Renommer la sélection ({selectedEntries.length})
            </h3>
            <p className="section-sub" style={{ fontSize: '0.82rem' }}>
              Pack ou bibliothèque carte uniquement. Les références dans le JSON du pack seront
              mises à jour.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
              <label>
                Préfixe{' '}
                <input
                  className="form-input"
                  value={renamePrefix}
                  onChange={(e) => setRenamePrefix(e.target.value)}
                />
              </label>
              <label>
                Suffixe (avant .png){' '}
                <input
                  className="form-input"
                  value={renameSuffix}
                  onChange={(e) => setRenameSuffix(e.target.value)}
                />
              </label>
              <label>
                Remplacer dans le nom{' '}
                <input
                  className="form-input"
                  placeholder="texte à chercher"
                  value={renameFind}
                  onChange={(e) => setRenameFind(e.target.value)}
                />
              </label>
              <label>
                Par{' '}
                <input
                  className="form-input"
                  value={renameReplace}
                  onChange={(e) => setRenameReplace(e.target.value)}
                />
              </label>
            </div>
            <ul className="mascot-pack-images-rename-dialog__preview">
              {selectedEntries.slice(0, 6).map((e) => (
                <li key={e.id}>
                  <code>{e.filename}</code>
                  {' → '}
                  <code>{previewRename(e.filename)}</code>
                </li>
              ))}
              {selectedEntries.length > 6 ? (
                <li className="section-sub">… et {selectedEntries.length - 6} autre(s)</li>
              ) : null}
            </ul>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleConfirmRename}
              >
                Renommer
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setRenameOpen(false)}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
