import React from 'react';
import { withAppBase } from '../../services/api';
import { isSpriteLibraryPreviewableUrl } from '../../utils/visitMascotPackTiming.js';
import { buildStateOptions } from '../../utils/visitMascotBehaviorRegistry.js';

/**
 * Onglet « Édition guidée » — sections bibliothèque carte + assets globaux du site.
 * Présentation pure prop-driven : l'état (assets, messages, filtre, état cible) et
 * les actions (chargement, upload, suppression, insertion) restent dans le parent.
 * @param {{
 *   libAssets: Array<Record<string, unknown>>,
 *   libLoading: boolean,
 *   libMessage: string,
 *   onReloadLibrary: () => void,
 *   onSetFramesBaseToLibrary: () => void,
 *   onLibUpload: (ev: React.ChangeEvent<HTMLInputElement>) => void,
 *   onLibDelete: (filename: string) => void,
 *   globalAssetsLoading: boolean,
 *   globalAssetsMessage: string,
 *   filteredAssets: Array<Record<string, unknown>>,
 *   globalAssetSearch: string,
 *   onGlobalAssetSearchChange: (value: string) => void,
 *   globalTargetState: string,
 *   onGlobalTargetStateChange: (value: string) => void,
 *   onReloadGlobalAssets: () => void,
 *   onInsertGlobalAsset: (assetUrl: string) => void,
 * }} props
 */
export default function MascotAssetsLibraryPanel({
  libAssets,
  libLoading,
  libMessage,
  onReloadLibrary,
  onSetFramesBaseToLibrary,
  onLibUpload,
  onLibDelete,
  globalAssetsLoading,
  globalAssetsMessage,
  filteredAssets,
  globalAssetSearch,
  onGlobalAssetSearchChange,
  globalTargetState,
  onGlobalTargetStateChange,
  onReloadGlobalAssets,
  onInsertGlobalAsset,
  editorPack = null,
}) {
  const stateOptions = buildStateOptions(editorPack);
  return (
    <div>
      <section style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, fontSize: '0.95rem' }}>Bibliothèque de la carte</h3>
        <p className="section-sub" style={{ fontSize: '0.82rem' }}>
          PNG partagés pour cette carte. Utilisez « Définir framesBase sur la bibliothèque » puis
          des noms relatifs dans chaque état.
        </p>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          style={{ marginRight: 8 }}
          onClick={onReloadLibrary}
        >
          Actualiser la liste
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={onSetFramesBaseToLibrary}>
          Définir framesBase sur la bibliothèque
        </button>
        <label className="btn btn-ghost btn-sm" style={{ marginLeft: 8, cursor: 'pointer' }}>
          Importer PNG…
          <input
            type="file"
            accept="image/png"
            style={{ display: 'none' }}
            onChange={onLibUpload}
          />
        </label>
        {libMessage ? (
          <p className="section-sub" role="status" aria-live="polite" style={{ marginTop: 8 }}>
            {libMessage}
          </p>
        ) : null}
        {libLoading ? <p className="section-sub">Chargement…</p> : null}
        {libAssets.length === 0 && !libLoading ? (
          <p className="section-sub" style={{ marginTop: 10 }}>
            Aucun PNG dans la bibliothèque pour cette carte.
          </p>
        ) : null}
        {libAssets.length > 0 ? (
          <ul
            className="mascot-pack-wysiwyg__asset-grid"
            style={{ marginTop: 12 }}
            aria-label="Sprites de la bibliothèque carte"
          >
            {libAssets.map((a) => (
              <li key={a.filename} className="mascot-pack-wysiwyg__asset-card">
                <div
                  className="mascot-pack-wysiwyg__asset-thumb"
                  style={{ cursor: 'default' }}
                  title={a.filename}
                >
                  <img
                    src={withAppBase(a.url)}
                    alt={`Aperçu ${a.filename}`}
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                <div className="mascot-pack-wysiwyg__asset-name">
                  <code>{a.filename}</code>
                </div>
                <div className="mascot-pack-wysiwyg__asset-actions">
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => onLibDelete(a.filename)}
                  >
                    Supprimer
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section>
        <h3 style={{ marginTop: 0, fontSize: '0.95rem' }}>Tous les assets mascotte du site</h3>
        <p className="section-sub" style={{ fontSize: '0.82rem' }}>
          Vue globale : catalogue statique + assets des packs + bibliothèques cartes, sans dépendre
          de la mascotte en cours d’édition.
        </p>
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            alignItems: 'center',
            marginBottom: 8,
          }}
        >
          <button type="button" className="btn btn-secondary btn-sm" onClick={onReloadGlobalAssets}>
            Actualiser assets site
          </button>
          <input
            className="form-input"
            style={{ minWidth: 220 }}
            placeholder="Filtrer (nom, map, source, URL)…"
            value={globalAssetSearch}
            onChange={(e) => onGlobalAssetSearchChange(e.target.value)}
          />
          <label
            className="section-sub"
            style={{ fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            Insérer dans état
            <select
              className="form-select"
              value={globalTargetState}
              onChange={(e) => onGlobalTargetStateChange(e.target.value)}
            >
              {stateOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                  {opt.custom ? ' (perso)' : ''} ({opt.key})
                </option>
              ))}
            </select>
          </label>
        </div>
        {globalAssetsMessage ? (
          <p className="section-sub" style={{ marginTop: 8 }}>
            {globalAssetsMessage}
          </p>
        ) : null}
        {globalAssetsLoading ? <p className="section-sub">Chargement assets globaux…</p> : null}
        <div
          style={{
            maxHeight: 330,
            overflow: 'auto',
            border: '1px solid rgba(26,71,49,0.12)',
            borderRadius: 8,
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(26,71,49,0.18)' }}>
                <th style={{ padding: '6px 8px', width: 76 }}>Aperçu</th>
                <th style={{ padding: '6px 8px' }}>Source</th>
                <th style={{ padding: '6px 8px' }}>Fichier</th>
                <th style={{ padding: '6px 8px' }}>URL</th>
                <th style={{ padding: '6px 8px' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredAssets.map((asset) => (
                <tr key={asset.id} style={{ borderBottom: '1px solid rgba(26,71,49,0.08)' }}>
                  <td style={{ padding: '6px 8px', verticalAlign: 'middle' }}>
                    {isSpriteLibraryPreviewableUrl(asset.url) ? (
                      <img
                        src={withAppBase(asset.url)}
                        alt=""
                        width={56}
                        height={56}
                        loading="lazy"
                        decoding="async"
                        style={{
                          display: 'block',
                          width: 56,
                          height: 56,
                          objectFit: 'contain',
                          borderRadius: 6,
                          background: 'rgba(248,250,245,0.95)',
                          border: '1px solid rgba(26,71,49,0.12)',
                        }}
                      />
                    ) : (
                      <span className="section-sub" title="Pas d’aperçu pour ce type de fichier">
                        —
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <code>{asset.source}</code>
                    {asset.map_id ? <span>{` · ${asset.map_id}`}</span> : null}
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <code>{asset.filename || '—'}</code>
                  </td>
                  <td style={{ padding: '6px 8px', maxWidth: 320, wordBreak: 'break-all' }}>
                    <code>{asset.url}</code>
                  </td>
                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => void navigator.clipboard.writeText(asset.url || '')}
                    >
                      Copier URL
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ marginLeft: 6 }}
                      onClick={() => onInsertGlobalAsset(asset.url)}
                    >
                      Utiliser
                    </button>
                  </td>
                </tr>
              ))}
              {!globalAssetsLoading && filteredAssets.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '10px 8px' }} className="section-sub">
                    Aucun asset trouvé pour ce filtre.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
