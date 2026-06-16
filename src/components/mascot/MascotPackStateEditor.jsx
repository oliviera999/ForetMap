import React from 'react';
import {
  removeFrameAt,
  resolveFrameUrl,
  resolveSrcPreviewUrl,
  swapFrames,
} from '../../utils/mascotPackEditorFrames.js';
import { STATE_LABELS } from '../../constants/mascotStateLabels.js';

/**
 * Éditeur d'un état d'animation (feuille) : bascule actif, choix du mode
 * (fichiers relatifs vs srcs absolus), liste réordonnable de frames, liste
 * d'URLs avec aperçu, fps et durées personnalisées par frame.
 * Présentation prop-driven : l'état du pack reste dans le parent.
 * @param {{
 *   stateKey: string,
 *   active: boolean,
 *   spec: Record<string, unknown>,
 *   pack: Record<string, unknown>,
 *   srcPreviewStatus: Record<string, string>,
 *   setSrcPreviewStatus: (updater: (prev: Record<string, string>) => Record<string, string>) => void,
 *   onToggleState: (stateKey: string, enabled: boolean) => void,
 *   onUpdateStateEntry: (stateKey: string, spec: Record<string, unknown> | null) => void,
 * }} props
 */
export default function MascotPackStateEditor({
  stateKey,
  active,
  spec,
  pack,
  srcPreviewStatus,
  setSrcPreviewStatus,
  onToggleState,
  onUpdateStateEntry,
}) {
  const hasSrcMode = Object.prototype.hasOwnProperty.call(spec, 'srcs');
  const hasFileMode = Object.prototype.hasOwnProperty.call(spec, 'files');
  const useSrcs = hasSrcMode && !hasFileMode;
  const files = Array.isArray(spec.files) ? spec.files.map(String) : [];
  const srcs = Array.isArray(spec.srcs) ? spec.srcs.map(String) : [];
  const fps = Number(spec.fps) || 8;
  const dwell = Array.isArray(spec.frameDwellMs)
    ? spec.frameDwellMs.map((n) => Number(n) || 100)
    : [];

  return (
    <details className="mascot-pack-wysiwyg__state" open={active}>
      <summary className="mascot-pack-wysiwyg__state-summary">
        <label
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          onClick={(ev) => ev.preventDefault()}
        >
          <input
            type="checkbox"
            checked={active}
            onChange={(ev) => onToggleState(stateKey, ev.target.checked)}
          />
          <strong>
            {STATE_LABELS[stateKey] || stateKey}{' '}
            <span className="section-sub" style={{ fontSize: '0.78rem' }}>
              ({stateKey})
            </span>
          </strong>
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
                onUpdateStateEntry(stateKey, next);
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
                const next = { ...spec, srcs: srcs.length ? srcs : [], fps };
                delete next.files;
                onUpdateStateEntry(stateKey, next);
              }}
            />
            URLs absolues (srcs) — dev / blob
          </label>

          {!useSrcs ? (
            <ul className="mascot-pack-wysiwyg__frame-list">
              {files.map((f, idx) => (
                <li key={`${f}-${idx}`} className="mascot-pack-wysiwyg__frame-row">
                  <img
                    className="mascot-pack-wysiwyg__frame-thumb"
                    src={resolveFrameUrl(pack, f)}
                    alt=""
                    loading="lazy"
                  />
                  <code className="mascot-pack-wysiwyg__frame-name">{f}</code>
                  <div className="mascot-pack-wysiwyg__frame-move">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={idx === 0}
                      onClick={() => {
                        onUpdateStateEntry(
                          stateKey,
                          swapFrames(spec, files, dwell, fps, idx - 1, idx),
                        );
                      }}
                    >
                      Monter
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={idx >= files.length - 1}
                      onClick={() => {
                        onUpdateStateEntry(
                          stateKey,
                          swapFrames(spec, files, dwell, fps, idx, idx + 1),
                        );
                      }}
                    >
                      Descendre
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => {
                        onUpdateStateEntry(stateKey, removeFrameAt(spec, files, dwell, fps, idx));
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
                  {String(u || '').trim() ? (
                    <img
                      src={resolveSrcPreviewUrl(u)}
                      alt={`Aperçu URL ${idx + 1}`}
                      width={44}
                      height={44}
                      loading="lazy"
                      decoding="async"
                      onLoad={() =>
                        setSrcPreviewStatus((prev) => ({ ...prev, [`${stateKey}:${idx}`]: 'ok' }))
                      }
                      onError={() =>
                        setSrcPreviewStatus((prev) => ({
                          ...prev,
                          [`${stateKey}:${idx}`]: 'error',
                        }))
                      }
                      style={{
                        width: 44,
                        height: 44,
                        objectFit: 'contain',
                        borderRadius: 6,
                        border: '1px solid rgba(26,71,49,0.18)',
                        background: 'rgba(248,250,245,0.95)',
                        flex: '0 0 auto',
                      }}
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 6,
                        border: '1px dashed rgba(26,71,49,0.2)',
                        background: 'rgba(248,250,245,0.55)',
                        flex: '0 0 auto',
                      }}
                    />
                  )}
                  <input
                    className="form-input"
                    style={{ flex: 1 }}
                    value={u}
                    placeholder="https://… ou blob:…"
                    onChange={(ev) => {
                      const nextSrcs = [...srcs];
                      nextSrcs[idx] = ev.target.value;
                      onUpdateStateEntry(stateKey, { ...spec, srcs: nextSrcs, fps });
                    }}
                  />
                  <span
                    className="section-sub"
                    style={{
                      fontSize: '0.74rem',
                      alignSelf: 'center',
                      minWidth: 74,
                      textAlign: 'center',
                    }}
                    aria-live="polite"
                  >
                    {!String(u || '').trim()
                      ? 'vide'
                      : srcPreviewStatus[`${stateKey}:${idx}`] === 'ok'
                        ? 'chargée'
                        : srcPreviewStatus[`${stateKey}:${idx}`] === 'error'
                          ? 'non trouvée'
                          : 'test...'}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      const nextSrcs = srcs.filter((_, i) => i !== idx);
                      onUpdateStateEntry(stateKey, { ...spec, srcs: nextSrcs, fps });
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => onUpdateStateEntry(stateKey, { ...spec, srcs: [...srcs, ''], fps })}
              >
                + URL
              </button>
              <p
                className="section-sub"
                style={{ fontSize: '0.76rem', marginTop: 6, marginBottom: 0 }}
              >
                Formats conseillés: <code>https://...</code>, <code>blob:...</code> ou URL de
                l’application (ex: <code>/api/visit/...</code>).
              </p>
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
              onChange={(ev) =>
                onUpdateStateEntry(stateKey, {
                  ...spec,
                  ...(useSrcs ? { srcs } : { files }),
                  fps: Number(ev.target.value) || 8,
                })
              }
            />
          </label>

          {!useSrcs && files.length > 0 ? (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <input
                type="checkbox"
                checked={dwell.length === files.length && dwell.length > 0}
                onChange={(ev) => {
                  if (ev.target.checked) {
                    onUpdateStateEntry(stateKey, {
                      ...spec,
                      files,
                      fps,
                      frameDwellMs: files.map(() => Math.round(1000 / fps) || 100),
                    });
                  } else {
                    const { frameDwellMs: _d, ...rest } = spec;
                    onUpdateStateEntry(stateKey, { ...rest, files, fps });
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
                      onUpdateStateEntry(stateKey, { ...spec, files, fps, frameDwellMs: next });
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
}
