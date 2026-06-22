import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { validateMascotPackV1 } from '../utils/mascotPack.js';
import {
  ensureServerFramesBase,
  serverMascotPackAssetsPrefix,
  serverMascotSpriteLibraryAssetsPrefix,
} from '../utils/mascotPackEditorModel.js';
import { normalizePackStateFramesForFramesBase } from '../utils/mascotPackEditorFrames.js';
import { computePackMediaWarnings } from '../utils/mascotPackEditorFrames.js';
import { buildPackAssetPreviewByFilename } from '../utils/visitMascotPackManager.js';
import {
  extractMascotPackValidationIssues,
  sanitizeMascotPackDraft,
  toMascotPackIssueLines,
} from '../utils/mascotPackValidationUi.js';
import MascotPackPreviewPanel from './MascotPackPreviewPanel.jsx';
import MascotPackMetaSection from './MascotPackMetaSection.jsx';
import MascotPackStateEditor from './mascot/MascotPackStateEditor.jsx';
import StateAliasesEditor from './mascot/StateAliasesEditor.jsx';
import { STATE_OPTIONS } from '../constants/mascotStateLabels.js';

/**
 * @param {{
 *   pack: Record<string, unknown>,
 *   onPackChange: (next: Record<string, unknown>) => void,
 *   packUuid?: string | null,
 *   catalogId?: string,
 *   visitMapId?: string,
 *   packAssets?: Array<Record<string, unknown>>,
 *   relaxAssetPrefix?: boolean,
 *   onForceLogout?: () => void,
 *   hidePreview?: boolean,
 *   canImportMissingCatalogFrames?: boolean,
 *   onImportMissingCatalogFrames?: () => void,
 *   importMissingCatalogLabel?: string,
 * }} props
 */
export default function MascotPackWysiwygEditor({
  pack,
  onPackChange,
  packUuid = null,
  catalogId = '',
  visitMapId = '',
  packAssets = [],
  relaxAssetPrefix = false,
  hidePreview = false,
  canImportMissingCatalogFrames = false,
  onImportMissingCatalogFrames,
  importMissingCatalogLabel = '',
}) {
  const [validated, setValidated] = useState(null);
  const [validationIssues, setValidationIssues] = useState([]);
  const [srcPreviewStatus, setSrcPreviewStatus] = useState({});

  const validationOpts = useMemo(() => {
    const allowed = ['/assets/mascots/'];
    const p = serverMascotPackAssetsPrefix(packUuid);
    if (p) allowed.push(p);
    const lib = serverMascotSpriteLibraryAssetsPrefix(visitMapId);
    if (lib) allowed.push(lib);
    return { relaxAssetPrefix: Boolean(relaxAssetPrefix), allowedFramesBasePrefixes: allowed };
  }, [packUuid, visitMapId, relaxAssetPrefix]);

  const runValidate = useCallback(() => {
    const draft = sanitizeMascotPackDraft(pack);
    const result = validateMascotPackV1(draft, validationOpts);
    if (!result.ok) {
      setValidated(null);
      setValidationIssues(
        extractMascotPackValidationIssues(result.error?.format?.() || result.error),
      );
      return;
    }
    setValidated(result);
    setValidationIssues([]);
  }, [pack, validationOpts]);

  useEffect(() => {
    const t = setTimeout(() => {
      runValidate();
    }, 300);
    return () => clearTimeout(t);
  }, [runValidate]);

  const patchPack = useCallback(
    (partial) => {
      onPackChange({ ...pack, ...partial });
    },
    [pack, onPackChange],
  );

  const setFramesBaseServer = useCallback(() => {
    if (!packUuid) return;
    onPackChange(normalizePackStateFramesForFramesBase(ensureServerFramesBase(pack, packUuid)));
  }, [pack, packUuid, onPackChange]);

  const stateFrames = useMemo(
    () =>
      pack.stateFrames && typeof pack.stateFrames === 'object' && !Array.isArray(pack.stateFrames)
        ? /** @type {Record<string, unknown>} */ (pack.stateFrames)
        : {},
    [pack.stateFrames],
  );

  const setStateFrames = useCallback(
    (next) => {
      patchPack({ stateFrames: next });
    },
    [patchPack],
  );

  const packWarnings = useMemo(
    () => computePackMediaWarnings(pack, packUuid, packAssets, stateFrames),
    [pack, packUuid, packAssets, stateFrames],
  );

  const assetPreviewByFilename = useMemo(
    () => buildPackAssetPreviewByFilename(packAssets),
    [packAssets],
  );

  const updateStateEntry = useCallback(
    (stateKey, spec) => {
      const next = { ...stateFrames };
      if (spec == null) delete next[stateKey];
      else next[stateKey] = spec;
      setStateFrames(next);
    },
    [stateFrames, setStateFrames],
  );

  const toggleState = useCallback(
    (stateKey, enabled) => {
      if (enabled) {
        updateStateEntry(stateKey, { files: [], fps: 8 });
      } else {
        updateStateEntry(stateKey, null);
      }
    },
    [updateStateEntry],
  );

  return (
    <div className="mascot-pack-wysiwyg">
      {catalogId ? (
        <p className="section-sub" style={{ fontSize: '0.82rem', marginTop: 0 }}>
          Identifiant catalogue (serveur) : <code>{catalogId}</code>
        </p>
      ) : null}

      <MascotPackMetaSection
        pack={pack}
        patchPack={patchPack}
        packUuid={packUuid}
        setFramesBaseServer={setFramesBaseServer}
        packWarnings={packWarnings}
        canImportMissingCatalogFrames={canImportMissingCatalogFrames}
        onImportMissingCatalogFrames={onImportMissingCatalogFrames}
        importMissingCatalogLabel={importMissingCatalogLabel}
      />

      <section className="mascot-pack-wysiwyg__states">
        <h3 className="mascot-pack-wysiwyg__h">États d’animation</h3>
        <p className="section-sub" style={{ fontSize: '0.82rem' }}>
          Cochez les états utilisés, puis ordonnez les images. La validation Zod exige au moins une
          image par état activé avant enregistrement. Les images se gèrent dans le panneau{' '}
          <strong>Images</strong> ci-dessous.
        </p>
        {STATE_OPTIONS.map((stateKey) => {
          const active = Object.prototype.hasOwnProperty.call(stateFrames, stateKey);
          const spec =
            active && stateFrames[stateKey] && typeof stateFrames[stateKey] === 'object'
              ? stateFrames[stateKey]
              : {};
          return (
            <MascotPackStateEditor
              key={stateKey}
              stateKey={stateKey}
              active={active}
              spec={spec}
              pack={pack}
              srcPreviewStatus={srcPreviewStatus}
              setSrcPreviewStatus={setSrcPreviewStatus}
              onToggleState={toggleState}
              onUpdateStateEntry={updateStateEntry}
              assetPreviewByFilename={assetPreviewByFilename}
            />
          );
        })}
      </section>

      <section className="mascot-pack-wysiwyg__aliases">
        <h3 className="mascot-pack-wysiwyg__h">Alias d’états (optionnel)</h3>
        <p className="section-sub" style={{ fontSize: '0.8rem' }}>
          Mappe un état canonique vers un autre (clé et cible parmi les états du schéma).
        </p>
        <StateAliasesEditor
          stateFrames={stateFrames}
          aliases={
            pack.stateAliases && typeof pack.stateAliases === 'object' ? pack.stateAliases : {}
          }
          onChange={(next) => {
            if (next && Object.keys(next).length) patchPack({ stateAliases: next });
            else {
              const { stateAliases: _a, ...rest } = pack;
              onPackChange(rest);
            }
          }}
        />
      </section>

      <div
        style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}
      >
        <button type="button" className="btn btn-ghost btn-sm" onClick={runValidate}>
          Revalider maintenant
        </button>
        <span className="section-sub" style={{ fontSize: '0.8rem' }}>
          Validation automatique active (300 ms).
        </span>
      </div>

      {validated ? (
        <p className="section-sub" style={{ marginTop: 10, fontSize: '0.82rem' }}>
          Pack valide: <code>{validated.pack.id}</code> (
          {Object.keys(validated.pack.stateFrames || {}).length} état(s)).
        </p>
      ) : null}
      {validationIssues.length > 0 ? (
        <div
          className="mascot-pack-wysiwyg__message"
          role="alert"
          style={{
            marginTop: 12,
            padding: 10,
            borderRadius: 8,
            border: '1px solid rgba(185,28,28,0.28)',
            background: 'rgba(254,242,242,0.95)',
            fontSize: 12,
          }}
        >
          <strong>Corrections nécessaires</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 16 }}>
            {toMascotPackIssueLines(validationIssues).map((line) => (
              <li key={line} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {line}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!hidePreview ? (
        <MascotPackPreviewPanel
          pack={pack}
          catalogId={catalogId}
          label={String(pack?.label || '')}
          assetPreviewByFilename={assetPreviewByFilename}
        />
      ) : null}
    </div>
  );
}
