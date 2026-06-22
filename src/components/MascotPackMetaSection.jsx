import React from 'react';
import { MASCOT_PACK_FALLBACK_SILHOUETTES } from '../utils/mascotPackEditorModel.js';

/**
 * Section « Métadonnées » (présentation) du WYSIWYG de pack de mascotte —
 * extraite de `MascotPackWysiwygEditor` (O6). Affiche les champs id, label,
 * framesBase (+ bouton URL serveur), les dimensions/échelle/pixelated, la
 * silhouette de secours et les avertissements non bloquants. La logique reste
 * dans le parent via les handlers `patchPack` / `setFramesBaseServer`.
 * DOM/classes/textes inchangés.
 *
 * @param {object} props
 * @param {Record<string, unknown>} props.pack pack en cours d'édition
 * @param {(partial: Record<string, unknown>) => void} props.patchPack applique une mise à jour partielle au pack
 * @param {string | null} [props.packUuid] UUID du pack (active le bouton URL serveur)
 * @param {() => void} props.setFramesBaseServer remplit framesBase avec l'URL serveur du pack
 * @param {string[]} props.packWarnings avertissements non bloquants à afficher
 * @param {boolean} [props.canImportMissingCatalogFrames]
 * @param {() => void} [props.onImportMissingCatalogFrames]
 * @param {string} [props.importMissingCatalogLabel]
 */
export default function MascotPackMetaSection({
  pack,
  patchPack,
  packUuid = null,
  setFramesBaseServer,
  packWarnings,
  canImportMissingCatalogFrames = false,
  onImportMissingCatalogFrames,
  importMissingCatalogLabel = '',
}) {
  return (
    <section className="mascot-pack-wysiwyg__meta">
      <h3 className="mascot-pack-wysiwyg__h">Métadonnées</h3>
      <div className="mascot-pack-wysiwyg__grid2">
        <label>
          <span className="mascot-pack-wysiwyg__label">id (kebab-case)</span>
          <input
            className="form-input"
            value={String(pack.id ?? '')}
            onChange={(ev) => patchPack({ id: ev.target.value })}
          />
        </label>
        <label>
          <span className="mascot-pack-wysiwyg__label">label</span>
          <input
            className="form-input"
            value={String(pack.label ?? '')}
            onChange={(ev) => patchPack({ label: ev.target.value })}
          />
        </label>
      </div>
      <label style={{ display: 'block', marginTop: 10 }}>
        <span className="mascot-pack-wysiwyg__label">framesBase (URL préfixe des images)</span>
        <input
          className="form-input"
          value={String(pack.framesBase ?? '')}
          onChange={(ev) => patchPack({ framesBase: ev.target.value })}
        />
        <span
          className="section-sub"
          style={{ display: 'block', marginTop: 4, fontSize: '0.78rem' }}
        >
          Utilisez idéalement une URL serveur du type <code>/api/visit/mascot-packs/…/assets/</code>{' '}
          ou <code>/api/visit/mascot-sprite-library/…/assets/</code>.
        </span>
      </label>
      {packUuid ? (
        <div style={{ marginTop: 8 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={setFramesBaseServer}>
            Utiliser l’URL des fichiers de ce pack (serveur)
          </button>
        </div>
      ) : null}

      <div className="mascot-pack-wysiwyg__grid4" style={{ marginTop: 12 }}>
        <label>
          <span className="mascot-pack-wysiwyg__label">frameWidth (px)</span>
          <input
            type="number"
            className="form-input"
            min={1}
            max={2048}
            value={Number(pack.frameWidth) || 0}
            onChange={(ev) => patchPack({ frameWidth: Number(ev.target.value) || 0 })}
          />
        </label>
        <label>
          <span className="mascot-pack-wysiwyg__label">frameHeight (px)</span>
          <input
            type="number"
            className="form-input"
            min={1}
            max={2048}
            value={Number(pack.frameHeight) || 0}
            onChange={(ev) => patchPack({ frameHeight: Number(ev.target.value) || 0 })}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 22 }}>
          <input
            type="checkbox"
            checked={pack.pixelated !== false}
            onChange={(ev) => patchPack({ pixelated: ev.target.checked })}
          />
          <span>pixelated</span>
        </label>
        <label>
          <span className="mascot-pack-wysiwyg__label">displayScale</span>
          <input
            type="number"
            step="0.05"
            min={0.25}
            max={4}
            className="form-input"
            value={Number(pack.displayScale ?? 1)}
            onChange={(ev) => patchPack({ displayScale: Number(ev.target.value) || 1 })}
          />
        </label>
      </div>

      <label style={{ display: 'block', marginTop: 12 }}>
        <span className="mascot-pack-wysiwyg__label">Silhouette de secours</span>
        <select
          className="form-select"
          value={String(pack.fallbackSilhouette || 'gnome')}
          onChange={(ev) => patchPack({ fallbackSilhouette: ev.target.value })}
        >
          {MASCOT_PACK_FALLBACK_SILHOUETTES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      {packWarnings.length > 0 ? (
        <div
          role="status"
          style={{
            marginTop: 10,
            padding: 10,
            borderRadius: 8,
            border: '1px solid rgba(217,119,6,0.35)',
            background: 'rgba(255,247,237,0.95)',
            fontSize: 12,
          }}
        >
          <strong>Avertissements non bloquants</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: 16 }}>
            {packWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          {canImportMissingCatalogFrames && onImportMissingCatalogFrames ? (
            <p style={{ marginTop: 10, marginBottom: 0 }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onImportMissingCatalogFrames}
              >
                Importer les PNG manquants depuis le catalogue
                {importMissingCatalogLabel ? ` « ${importMissingCatalogLabel} »` : ''}
              </button>
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
