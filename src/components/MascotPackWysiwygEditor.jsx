import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { VISIT_MASCOT_STATE } from '../utils/visitMascotState.js';
import { validateMascotPackV1 } from '../utils/mascotPack.js';
import { api, AccountDeletedError, withAppBase } from '../services/api';
import {
  ensureServerFramesBase,
  serverMascotPackAssetsPrefix,
  serverMascotSpriteLibraryAssetsPrefix,
} from '../utils/mascotPackEditorModel.js';
import {
  appendFileToStateFrames,
  computePackMediaWarnings,
  sanitizeClientFilename,
} from '../utils/mascotPackEditorFrames.js';
import {
  extractMascotPackValidationIssues,
  sanitizeMascotPackDraft,
  toMascotPackIssueLines,
} from '../utils/mascotPackValidationUi.js';
import MascotPackPreviewPanel from './MascotPackPreviewPanel.jsx';
import MascotPackMetaSection from './MascotPackMetaSection.jsx';
import MascotPackStateEditor from './mascot/MascotPackStateEditor.jsx';
import StateAliasesEditor from './mascot/StateAliasesEditor.jsx';
import { STATE_OPTIONS, STATE_LABELS } from '../constants/mascotStateLabels.js';

/**
 * @param {{
 *   pack: Record<string, unknown>,
 *   onPackChange: (next: Record<string, unknown>) => void,
 *   packUuid?: string | null,
 *   catalogId?: string,
 *   visitMapId?: string,
 *   relaxAssetPrefix?: boolean,
 *   onForceLogout?: () => void,
 * }} props
 */
export default function MascotPackWysiwygEditor({
  pack,
  onPackChange,
  packUuid = null,
  catalogId = '',
  visitMapId = '',
  relaxAssetPrefix = false,
  onForceLogout,
}) {
  const [statusMessage, setStatusMessage] = useState('');
  const [validated, setValidated] = useState(null);
  const [validationIssues, setValidationIssues] = useState([]);
  const [assets, setAssets] = useState([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [libraryTargetState, setLibraryTargetState] = useState(VISIT_MASCOT_STATE.IDLE);
  const [srcPreviewStatus, setSrcPreviewStatus] = useState({});
  const fileInputRef = useRef(null);

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

  const loadAssets = useCallback(async () => {
    const id = String(packUuid || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      setAssets([]);
      return;
    }
    setAssetsLoading(true);
    try {
      const res = await api(`/api/visit/mascot-packs/${encodeURIComponent(id)}/assets`);
      const list = Array.isArray(res?.assets) ? res.assets : [];
      setAssets(list);
    } catch (e) {
      if (e instanceof AccountDeletedError) onForceLogout?.();
      else setStatusMessage(e.message || 'Impossible de charger la médiathèque');
      setAssets([]);
    } finally {
      setAssetsLoading(false);
    }
  }, [packUuid, onForceLogout]);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  const patchPack = useCallback(
    (partial) => {
      onPackChange({ ...pack, ...partial });
    },
    [pack, onPackChange],
  );

  const setFramesBaseServer = useCallback(() => {
    if (!packUuid) return;
    onPackChange(ensureServerFramesBase(pack, packUuid));
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
    () => computePackMediaWarnings(pack, packUuid, assets, stateFrames),
    [pack, packUuid, assets, stateFrames],
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

  const appendFileToState = useCallback(
    (stateKey, filename) => {
      setStateFrames(appendFileToStateFrames(stateFrames, stateKey, filename));
    },
    [stateFrames, setStateFrames],
  );

  const onAddLibraryToTarget = useCallback(
    (filename) => {
      if (!filename) return;
      appendFileToState(libraryTargetState, filename);
      setStatusMessage(`« ${filename} » ajouté à l’état « ${libraryTargetState} ».`);
    },
    [appendFileToState, libraryTargetState],
  );

  const fileToPngDataUrl = useCallback(
    (file) =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Lecture fichier impossible'));
        reader.onload = () => {
          const dataUrl = reader.result;
          const img = new Image();
          img.onerror = () => reject(new Error('Image invalide'));
          img.onload = () => {
            let w = img.naturalWidth;
            let h = img.naturalHeight;
            const max = 2048;
            if (w > max || h > max) {
              if (w >= h) {
                h = Math.round((h * max) / w);
                w = max;
              } else {
                w = Math.round((w * max) / h);
                h = max;
              }
            }
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              reject(new Error('Canvas indisponible'));
              return;
            }
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/png'));
          };
          img.src = dataUrl;
        };
        reader.readAsDataURL(file);
      }),
    [],
  );

  const onPickUpload = useCallback(
    async (e) => {
      const file = e.target?.files?.[0];
      e.target.value = '';
      if (!file || !packUuid) return;
      const filename = sanitizeClientFilename(file.name);
      setStatusMessage('Envoi en cours…');
      try {
        const dataUrl = await fileToPngDataUrl(file);
        await api(`/api/visit/mascot-packs/${encodeURIComponent(packUuid)}/assets`, 'POST', {
          filename,
          image_data: dataUrl,
        });
        setStatusMessage(`Fichier « ${filename} » enregistré.`);
        await loadAssets();
      } catch (err) {
        if (err instanceof AccountDeletedError) onForceLogout?.();
        else setStatusMessage(err.message || 'Upload impossible');
      }
    },
    [fileToPngDataUrl, loadAssets, packUuid, onForceLogout],
  );

  const onDeleteAsset = useCallback(
    async (filename) => {
      if (!packUuid || !filename) return;
      if (!window.confirm(`Supprimer « ${filename} » du serveur ?`)) return;
      try {
        await api(
          `/api/visit/mascot-packs/${encodeURIComponent(packUuid)}/assets/${encodeURIComponent(filename)}`,
          'DELETE',
        );
        await loadAssets();
        setStatusMessage(`« ${filename} » supprimé.`);
      } catch (err) {
        if (err instanceof AccountDeletedError) onForceLogout?.();
        else setStatusMessage(err.message || 'Suppression impossible');
      }
    },
    [loadAssets, packUuid, onForceLogout],
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
      />

      {packUuid ? (
        <section className="mascot-pack-wysiwyg__library">
          <h3 className="mascot-pack-wysiwyg__h">Médiathèque (serveur)</h3>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              alignItems: 'center',
              marginBottom: 10,
            }}
          >
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void loadAssets()}
              disabled={assetsLoading}
            >
              {assetsLoading ? 'Chargement…' : 'Actualiser'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={onPickUpload}
            />
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => fileInputRef.current?.click()}
            >
              Envoyer une image PNG…
            </button>
            <label>
              État cible :{' '}
              <select
                className="form-select"
                style={{ minWidth: 140 }}
                value={libraryTargetState}
                onChange={(ev) => setLibraryTargetState(ev.target.value)}
              >
                {STATE_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {STATE_LABELS[s] || s} ({s})
                  </option>
                ))}
              </select>
            </label>
          </div>
          {assets.length === 0 && !assetsLoading ? (
            <p className="section-sub">Aucun fichier — envoyez des PNG.</p>
          ) : (
            <ul className="mascot-pack-wysiwyg__asset-grid">
              {assets.map((a) => (
                <li key={a.filename} className="mascot-pack-wysiwyg__asset-card">
                  <button
                    type="button"
                    className="mascot-pack-wysiwyg__asset-thumb"
                    onClick={() => onAddLibraryToTarget(a.filename)}
                    title={`Ajouter à l’état « ${libraryTargetState} »`}
                  >
                    <img src={withAppBase(a.url)} alt="" loading="lazy" />
                  </button>
                  <div className="mascot-pack-wysiwyg__asset-name">{a.filename}</div>
                  <div className="mascot-pack-wysiwyg__asset-actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => onAddLibraryToTarget(a.filename)}
                    >
                      + animation
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => void onDeleteAsset(a.filename)}
                    >
                      Supprimer
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section className="mascot-pack-wysiwyg__library">
          <p className="section-sub" style={{ fontSize: '0.85rem' }}>
            Médiathèque serveur : disponible lorsque le pack est enregistré sur une carte (UUID). En
            mode autonome, utilisez des <strong>srcs</strong> (URLs / blob) dans chaque état.
          </p>
        </section>
      )}

      <section className="mascot-pack-wysiwyg__states">
        <h3 className="mascot-pack-wysiwyg__h">États d’animation</h3>
        <p className="section-sub" style={{ fontSize: '0.82rem' }}>
          Cochez les états utilisés, puis ordonnez les images. La validation Zod exige au moins une
          image par état activé avant enregistrement.
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
      {statusMessage ? (
        <p className="section-sub" style={{ marginTop: 10, fontSize: '0.82rem' }}>
          {statusMessage}
        </p>
      ) : null}

      <MascotPackPreviewPanel validated={validated} />
    </div>
  );
}
