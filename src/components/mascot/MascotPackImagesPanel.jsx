import React, { useCallback, useMemo, useState } from 'react';
import { withAppBase } from '../../services/api';
import { isSpriteLibraryPreviewableUrl } from '../../utils/visitMascotPackTiming.js';
import { VISIT_MASCOT_STATE } from '../../utils/visitMascotState.js';
import { STATE_LABELS } from '../../constants/mascotStateLabels.js';
import { buildUnifiedMascotImageEntries } from '../../utils/visitMascotPackManager.js';
import { downloadApiFile } from '../../utils/downloadApiFile.js';

const SOURCE_FILTERS = [
  { id: 'all', label: 'Toutes' },
  { id: 'pack', label: 'Ce pack' },
  { id: 'map', label: 'Carte' },
  { id: 'site', label: 'Site' },
];

/**
 * Panneau Images unifié : médiathèque du pack, bibliothèque carte et assets globaux
 * avec un seul sélecteur d’état cible et l’action « Ajouter à l’état ».
 * @param {{
 *   packUuid: string | null,
 *   mapId: string,
 *   packAssets: Array<Record<string, unknown>>,
 *   packAssetsLoading: boolean,
 *   packAssetsMessage: string,
 *   libAssets: Array<Record<string, unknown>>,
 *   libLoading: boolean,
 *   libMessage: string,
 *   globalAssets: Array<Record<string, unknown>>,
 *   globalAssetsLoading: boolean,
 *   globalAssetsMessage: string,
 *   targetState: string,
 *   onTargetStateChange: (value: string) => void,
 *   sourceFilter: string,
 *   onSourceFilterChange: (value: string) => void,
 *   search: string,
 *   onSearchChange: (value: string) => void,
 *   onReloadAll: () => void,
 *   onPackUpload: (ev: React.ChangeEvent<HTMLInputElement>) => void,
 *   onMapUpload: (ev: React.ChangeEvent<HTMLInputElement>) => void,
 *   onSetFramesBasePack: () => void,
 *   onSetFramesBaseMap: () => void,
 *   onInsertImage: (entry: Record<string, unknown>) => void,
 *   onDeletePackAsset: (filename: string) => void,
 *   onDeleteMapAsset: (filename: string) => void,
 *   onDeletePublicAsset: (url: string) => void,
 *   insertFeedback?: string,
 * }} props
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
  onDeletePackAsset,
  onDeleteMapAsset,
  onDeletePublicAsset,
  insertFeedback = '',
}) {
  const [copyFeedback, setCopyFeedback] = useState('');
  const [downloadBusy, setDownloadBusy] = useState('');

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

  const loading = packAssetsLoading || libLoading || globalAssetsLoading;
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

  const targetLabel = STATE_LABELS[targetState] || targetState;

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

  const handleDelete = useCallback(
    (entry) => {
      const scope = entry?.deleteScope;
      if (scope === 'pack') onDeletePackAsset(entry.filename);
      else if (scope === 'map') onDeleteMapAsset(entry.filename);
      else if (scope === 'public') onDeletePublicAsset(entry.deleteUrl || entry.url);
    },
    [onDeletePackAsset, onDeleteMapAsset, onDeletePublicAsset],
  );

  return (
    <section
      className="mascot-pack-images-panel mascot-pack-wysiwyg__library"
      aria-label="Images mascotte"
    >
      <h3 className="mascot-pack-wysiwyg__h">Images</h3>
      <p className="section-sub" style={{ fontSize: '0.82rem', marginTop: 0 }}>
        Médiathèque du pack, bibliothèque partagée de la carte et catalogue du site — choisissez
        l’état cible puis ajoutez une image en un clic.
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
            {Object.values(VISIT_MASCOT_STATE).map((st) => (
              <option key={st} value={st}>
                {STATE_LABELS[st] || st} ({st})
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
            const previewable = isSpriteLibraryPreviewableUrl(entry.url);
            const isDownloading = downloadBusy === entry.url;
            return (
              <li key={entry.id} className="mascot-pack-wysiwyg__asset-card">
                <button
                  type="button"
                  className="mascot-pack-wysiwyg__asset-thumb"
                  onClick={() => onInsertImage(entry)}
                  title={`Ajouter à l’état « ${targetLabel} »`}
                >
                  {previewable ? (
                    <img src={withAppBase(entry.url)} alt="" loading="lazy" decoding="async" />
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
                      onClick={() => handleDelete(entry)}
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
    </section>
  );
}
