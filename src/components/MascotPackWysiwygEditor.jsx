import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { VISIT_MASCOT_STATE } from '../utils/visitMascotState.js';
import { validateMascotPackV1 } from '../utils/mascotPack.js';
import { api, AccountDeletedError, withAppBase } from '../services/api';
import {
  MASCOT_PACK_FALLBACK_SILHOUETTES,
  ensureServerFramesBase,
  serverMascotPackAssetsPrefix,
} from '../utils/mascotPackEditorModel.js';
import MascotPackPreviewPanel from './MascotPackPreviewPanel.jsx';

const STATE_OPTIONS = Object.values(VISIT_MASCOT_STATE).sort();

/** @param {string} name */
function sanitizeClientFilename(name) {
  const raw = String(name || '').replace(/^.*[\\/]/, '').trim();
  const base = raw.replace(/[^a-zA-Z0-9._-]+/g, '-').toLowerCase().replace(/^-+|-+$/g, '') || 'frame';
  return base.toLowerCase().endsWith('.png') ? base : `${base}.png`;
}

/** @param {Record<string, unknown>} pack @param {string} rel */
function resolveFrameUrl(pack, rel) {
  const s = String(rel || '').trim();
  if (!s) return '';
  if (s.startsWith('blob:') || s.startsWith('http://') || s.startsWith('https://')) return s;
  let base = String(pack.framesBase || '').trim();
  if (!base.endsWith('/')) base = `${base}/`;
  return withAppBase(`${base}${s.replace(/^\//, '')}`);
}

/**
 * @param {{
 *   pack: Record<string, unknown>,
 *   onPackChange: (next: Record<string, unknown>) => void,
 *   packUuid?: string | null,
 *   catalogId?: string,
 *   relaxAssetPrefix?: boolean,
 *   onForceLogout?: () => void,
 * }} props
 */
export default function MascotPackWysiwygEditor({
  pack,
  onPackChange,
  packUuid = null,
  catalogId = '',
  relaxAssetPrefix = false,
  onForceLogout,
}) {
  const [message, setMessage] = useState('');
  const [validated, setValidated] = useState(null);
  const [assets, setAssets] = useState([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [libraryTargetState, setLibraryTargetState] = useState(VISIT_MASCOT_STATE.IDLE);
  const fileInputRef = useRef(null);

  const validationOpts = useMemo(() => {
    const allowed = ['/assets/mascots/'];
    const p = serverMascotPackAssetsPrefix(packUuid);
    if (p) allowed.push(p);
    return { relaxAssetPrefix: Boolean(relaxAssetPrefix), allowedFramesBasePrefixes: allowed };
  }, [packUuid, relaxAssetPrefix]);

  const runValidate = useCallback(() => {
    const result = validateMascotPackV1(pack, validationOpts);
    if (!result.ok) {
      setValidated(null);
      setMessage(result.error?.format ? result.error.format() : String(result.error));
      return;
    }
    setValidated(result);
    setMessage(`Valide — id « ${result.pack.id} », ${Object.keys(result.pack.stateFrames || {}).length} état(s).`);
  }, [pack, validationOpts]);

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
      else setMessage(e.message || 'Impossible de charger la médiathèque');
      setAssets([]);
    } finally {
      setAssetsLoading(false);
    }
  }, [packUuid, onForceLogout]);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  const patchPack = useCallback((partial) => {
    onPackChange({ ...pack, ...partial });
  }, [pack, onPackChange]);

  const setFramesBaseServer = useCallback(() => {
    if (!packUuid) return;
    onPackChange(ensureServerFramesBase(pack, packUuid));
  }, [pack, packUuid, onPackChange]);

  const stateFrames = useMemo(() => (
    pack.stateFrames && typeof pack.stateFrames === 'object' && !Array.isArray(pack.stateFrames)
      ? /** @type {Record<string, unknown>} */ (pack.stateFrames)
      : {}
  ), [pack.stateFrames]);

  const setStateFrames = useCallback((next) => {
    patchPack({ stateFrames: next });
  }, [patchPack]);

  const updateStateEntry = useCallback((stateKey, spec) => {
    const next = { ...stateFrames };
    if (spec == null) delete next[stateKey];
    else next[stateKey] = spec;
    setStateFrames(next);
  }, [stateFrames, setStateFrames]);

  const appendFileToState = useCallback((stateKey, filename) => {
    const cur = stateFrames[stateKey];
    const base = cur && typeof cur === 'object' ? { ...cur } : { fps: 8 };
    const files = Array.isArray(base.files) ? [...base.files] : [];
    if (files.includes(filename)) return;
    files.push(filename);
    const next = { ...base, files };
    delete next.srcs;
    updateStateEntry(stateKey, next);
  }, [stateFrames, updateStateEntry]);

  const onAddLibraryToTarget = useCallback((filename) => {
    if (!filename) return;
    appendFileToState(libraryTargetState, filename);
    setMessage(`« ${filename} » ajouté à l’état « ${libraryTargetState} ».`);
  }, [appendFileToState, libraryTargetState]);

  const fileToPngDataUrl = useCallback((file) => new Promise((resolve, reject) => {
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
  }), []);

  const onPickUpload = useCallback(async (e) => {
    const file = e.target?.files?.[0];
    e.target.value = '';
    if (!file || !packUuid) return;
    const filename = sanitizeClientFilename(file.name);
    setMessage('Envoi en cours…');
    try {
      const dataUrl = await fileToPngDataUrl(file);
      await api(`/api/visit/mascot-packs/${encodeURIComponent(packUuid)}/assets`, 'POST', {
        filename,
        image_data: dataUrl,
      });
      setMessage(`Fichier « ${filename} » enregistré.`);
      await loadAssets();
    } catch (err) {
      if (err instanceof AccountDeletedError) onForceLogout?.();
      else setMessage(err.message || 'Upload impossible');
    }
  }, [fileToPngDataUrl, loadAssets, packUuid, onForceLogout]);

  const onDeleteAsset = useCallback(async (filename) => {
    if (!packUuid || !filename) return;
    if (!window.confirm(`Supprimer « ${filename} » du serveur ?`)) return;
    try {
      await api(
        `/api/visit/mascot-packs/${encodeURIComponent(packUuid)}/assets/${encodeURIComponent(filename)}`,
        'DELETE',
      );
      await loadAssets();
      setMessage(`« ${filename} » supprimé.`);
    } catch (err) {
      if (err instanceof AccountDeletedError) onForceLogout?.();
      else setMessage(err.message || 'Suppression impossible');
    }
  }, [loadAssets, packUuid, onForceLogout]);

  const toggleState = useCallback((stateKey, enabled) => {
    if (enabled) {
      updateStateEntry(stateKey, { files: [], fps: 8 });
    } else {
      updateStateEntry(stateKey, null);
    }
  }, [updateStateEntry]);

  return (
    <div className="mascot-pack-wysiwyg">
      {catalogId ? (
        <p className="section-sub" style={{ fontSize: '0.82rem', marginTop: 0 }}>
          Identifiant catalogue (serveur) : <code>{catalogId}</code>
        </p>
      ) : null}

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
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
      </section>

      {packUuid ? (
        <section className="mascot-pack-wysiwyg__library">
          <h3 className="mascot-pack-wysiwyg__h">Médiathèque (serveur)</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void loadAssets()} disabled={assetsLoading}>
              {assetsLoading ? 'Chargement…' : 'Actualiser'}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onPickUpload} />
            <button type="button" className="btn btn-primary btn-sm" onClick={() => fileInputRef.current?.click()}>
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
                  <option key={s} value={s}>{s}</option>
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
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => onAddLibraryToTarget(a.filename)}>
                      + animation
                    </button>
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => void onDeleteAsset(a.filename)}>
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
            Médiathèque serveur : disponible lorsque le pack est enregistré sur une carte (UUID).
            En mode autonome, utilisez des <strong>srcs</strong> (URLs / blob) dans chaque état.
          </p>
        </section>
      )}

      <section className="mascot-pack-wysiwyg__states">
        <h3 className="mascot-pack-wysiwyg__h">États d’animation</h3>
        <p className="section-sub" style={{ fontSize: '0.82rem' }}>
          Cochez les états utilisés, puis ordonnez les images. La validation Zod exige au moins une image par état activé avant enregistrement.
        </p>
        {STATE_OPTIONS.map((stateKey) => {
          const active = Object.prototype.hasOwnProperty.call(stateFrames, stateKey);
          const spec = active && stateFrames[stateKey] && typeof stateFrames[stateKey] === 'object'
            ? stateFrames[stateKey]
            : {};
          const useSrcs = Array.isArray(spec.srcs) && spec.srcs.length > 0;
          const files = Array.isArray(spec.files) ? spec.files.map(String) : [];
          const srcs = Array.isArray(spec.srcs) ? spec.srcs.map(String) : [];
          const fps = Number(spec.fps) || 8;
          const dwell = Array.isArray(spec.frameDwellMs) ? spec.frameDwellMs.map((n) => Number(n) || 100) : [];

          return (
            <details key={stateKey} className="mascot-pack-wysiwyg__state" open={active}>
              <summary className="mascot-pack-wysiwyg__state-summary">
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }} onClick={(ev) => ev.preventDefault()}>
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(ev) => toggleState(stateKey, ev.target.checked)}
                  />
                  <strong>{stateKey}</strong>
                </label>
              </summary>
              {active ? (
                <div className="mascot-pack-wysiwyg__state-body">
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <input
                      type="radio"
                      name={`mode-${stateKey}`}
                      checked={!useSrcs}
                      onChange={() => {
                        const next = { ...spec, files: files.length ? files : [], fps };
                        delete next.srcs;
                        updateStateEntry(stateKey, next);
                      }}
                    />
                    Fichiers relatifs (framesBase)
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <input
                      type="radio"
                      name={`mode-${stateKey}`}
                      checked={useSrcs}
                      onChange={() => {
                        const next = { ...spec, srcs: srcs.length ? srcs : [''], fps };
                        delete next.files;
                        updateStateEntry(stateKey, next);
                      }}
                    />
                    URLs absolues (srcs) — dev / blob
                  </label>

                  {!useSrcs ? (
                    <ul className="mascot-pack-wysiwyg__frame-list">
                      {files.map((f, idx) => (
                        <li key={`${f}-${idx}`} className="mascot-pack-wysiwyg__frame-row">
                          <img className="mascot-pack-wysiwyg__frame-thumb" src={resolveFrameUrl(pack, f)} alt="" loading="lazy" />
                          <code className="mascot-pack-wysiwyg__frame-name">{f}</code>
                          <div className="mascot-pack-wysiwyg__frame-move">
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              disabled={idx === 0}
                              onClick={() => {
                                const nextFiles = [...files];
                                [nextFiles[idx - 1], nextFiles[idx]] = [nextFiles[idx], nextFiles[idx - 1]];
                                const nextDwell = dwell.length === files.length
                                  ? (() => {
                                    const d = [...dwell];
                                    [d[idx - 1], d[idx]] = [d[idx], d[idx - 1]];
                                    return d;
                                  })()
                                  : undefined;
                                updateStateEntry(stateKey, {
                                  ...spec,
                                  files: nextFiles,
                                  fps,
                                  ...(nextDwell ? { frameDwellMs: nextDwell } : {}),
                                });
                              }}
                            >
                              Monter
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              disabled={idx >= files.length - 1}
                              onClick={() => {
                                const nextFiles = [...files];
                                [nextFiles[idx], nextFiles[idx + 1]] = [nextFiles[idx + 1], nextFiles[idx]];
                                const nextDwell = dwell.length === files.length
                                  ? (() => {
                                    const d = [...dwell];
                                    [d[idx], d[idx + 1]] = [d[idx + 1], d[idx]];
                                    return d;
                                  })()
                                  : undefined;
                                updateStateEntry(stateKey, {
                                  ...spec,
                                  files: nextFiles,
                                  fps,
                                  ...(nextDwell ? { frameDwellMs: nextDwell } : {}),
                                });
                              }}
                            >
                              Descendre
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              onClick={() => {
                                const nextFiles = files.filter((_, i) => i !== idx);
                                let nextDwell = dwell;
                                if (dwell.length === files.length) {
                                  nextDwell = dwell.filter((_, i) => i !== idx);
                                }
                                updateStateEntry(stateKey, {
                                  ...spec,
                                  files: nextFiles,
                                  fps,
                                  ...(nextDwell.length ? { frameDwellMs: nextDwell } : {}),
                                });
                              }}
                            >
                              Retirer
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div style={{ marginTop: 8 }}>
                      {srcs.map((u, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                          <input
                            className="form-input"
                            style={{ flex: 1 }}
                            value={u}
                            placeholder="https://… ou blob:…"
                            onChange={(ev) => {
                              const nextSrcs = [...srcs];
                              nextSrcs[idx] = ev.target.value;
                              updateStateEntry(stateKey, { ...spec, srcs: nextSrcs, fps });
                            }}
                          />
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => {
                              const nextSrcs = srcs.filter((_, i) => i !== idx);
                              updateStateEntry(stateKey, { ...spec, srcs: nextSrcs, fps });
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => updateStateEntry(stateKey, { ...spec, srcs: [...srcs, ''], fps })}
                      >
                        + URL
                      </button>
                    </div>
                  )}

                  <label style={{ display: 'block', marginTop: 10 }}>
                    <span className="mascot-pack-wysiwyg__label">fps</span>
                    <input
                      type="number"
                      className="form-input"
                      style={{ maxWidth: 120 }}
                      min={1}
                      max={120}
                      value={fps}
                      onChange={(ev) => updateStateEntry(stateKey, {
                        ...spec,
                        ...(useSrcs ? { srcs } : { files }),
                        fps: Number(ev.target.value) || 8,
                      })}
                    />
                  </label>

                  {!useSrcs && files.length > 0 ? (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                      <input
                        type="checkbox"
                        checked={dwell.length === files.length && dwell.length > 0}
                        onChange={(ev) => {
                          if (ev.target.checked) {
                            updateStateEntry(stateKey, {
                              ...spec,
                              files,
                              fps,
                              frameDwellMs: files.map(() => Math.round(1000 / fps) || 100),
                            });
                          } else {
                            const { frameDwellMs: _d, ...rest } = spec;
                            updateStateEntry(stateKey, { ...rest, files, fps });
                          }
                        }}
                      />
                      Durées personnalisées (ms) par frame
                    </label>
                  ) : null}
                  {!useSrcs && dwell.length === files.length && files.length > 0 ? (
                    <div className="mascot-pack-wysiwyg__dwell-grid">
                      {dwell.map((ms, idx) => (
                        <label key={idx}>
                          <span className="mascot-pack-wysiwyg__label">#{idx + 1}</span>
                          <input
                            type="number"
                            className="form-input"
                            min={16}
                            max={60000}
                            value={ms}
                            onChange={(ev) => {
                              const next = [...dwell];
                              next[idx] = Number(ev.target.value) || 100;
                              updateStateEntry(stateKey, { ...spec, files, fps, frameDwellMs: next });
                            }}
                          />
                        </label>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </details>
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
          aliases={pack.stateAliases && typeof pack.stateAliases === 'object' ? pack.stateAliases : {}}
          onChange={(next) => {
            if (next && Object.keys(next).length) patchPack({ stateAliases: next });
            else {
              const { stateAliases: _a, ...rest } = pack;
              onPackChange(rest);
            }
          }}
        />
      </section>

      <div style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <button type="button" className="btn btn-primary btn-sm" onClick={runValidate}>
          Vérifier le pack
        </button>
      </div>

      {message ? (
        <pre
          className="mascot-pack-wysiwyg__message"
          style={{
            marginTop: 12,
            padding: 10,
            background: 'rgba(240,253,244,0.9)',
            borderRadius: 8,
            fontSize: 12,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {message}
        </pre>
      ) : null}

      <MascotPackPreviewPanel validated={validated} />
    </div>
  );
}

/**
 * @param {{
 *   stateFrames: Record<string, unknown>,
 *   aliases: Record<string, string>,
 *   onChange: (next: Record<string, string>) => void,
 * }} props
 */
function StateAliasesEditor({ stateFrames, aliases, onChange }) {
  const keys = Object.keys(stateFrames || {});
  const rows = useMemo(() => Object.entries(aliases || {}), [aliases]);

  const addRow = () => {
    const used = new Set(rows.map(([a]) => a));
    const aliasKey = STATE_OPTIONS.find((s) => !used.has(s)) || STATE_OPTIONS[0];
    const withFrames = keys.filter((k) => {
      const sf = stateFrames[k];
      if (!sf || typeof sf !== 'object') return false;
      const f = /** @type {{ files?: unknown[], srcs?: unknown[] }} */ (sf);
      return (Array.isArray(f.files) && f.files.length > 0)
        || (Array.isArray(f.srcs) && f.srcs.length > 0);
    });
    const target = withFrames.includes(VISIT_MASCOT_STATE.IDLE)
      ? VISIT_MASCOT_STATE.IDLE
      : (withFrames[0] || VISIT_MASCOT_STATE.IDLE);
    onChange({ ...aliases, [aliasKey]: target });
  };

  return (
    <div>
      {rows.length === 0 ? (
        <p className="section-sub">Aucun alias.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {rows.map(([alias, target]) => (
            <li key={alias} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <select
                className="form-select"
                value={alias}
                onChange={(ev) => {
                  const next = { ...aliases };
                  delete next[alias];
                  next[ev.target.value] = target;
                  onChange(next);
                }}
              >
                {STATE_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <span>→</span>
              <select
                className="form-select"
                value={target}
                onChange={(ev) => {
                  onChange({ ...aliases, [alias]: ev.target.value });
                }}
              >
                {STATE_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  const next = { ...aliases };
                  delete next[alias];
                  onChange(next);
                }}
              >
                Supprimer
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="btn btn-ghost btn-sm" onClick={addRow} disabled={rows.length >= STATE_OPTIONS.length}>
        + Alias
      </button>
    </div>
  );
}
