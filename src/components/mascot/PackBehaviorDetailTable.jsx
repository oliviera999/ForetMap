import React, { useMemo } from 'react';
import { validateMascotPackV1 } from '../../utils/mascotPack.js';
import { estimateStateDurationMs } from '../../utils/visitMascotPackTiming.js';
import { STATE_LABELS } from '../../constants/mascotStateLabels.js';

/**
 * Fiche récapitulative (lecture seule) d'un pack mascotte : métadonnées
 * (version, framesBase, dimensions, silhouette, alias) + tableau par état
 * (nombre d'images, fps, frameDwellMs, durée estimée).
 * @param {{ pack: Record<string, unknown> }} props
 */
export default function PackBehaviorDetailTable({ pack }) {
  const validated = useMemo(() => validateMascotPackV1(pack, { relaxAssetPrefix: true }), [pack]);
  if (!validated.ok) {
    return (
      <p className="section-sub text-danger">
        Pack invalide pour la fiche — corrigez le JSON ou l’éditeur.
      </p>
    );
  }
  const states = Object.keys(validated.pack.stateFrames || {}).sort();
  const ver = Number(validated.pack.mascotPackVersion) === 2 ? 2 : 1;
  return (
    <div className="visit-mascot-pack-detail">
      <p className="section-sub" style={{ fontSize: '0.85rem' }}>
        Version pack <strong>{ver}</strong>
        {' · '}
        <code>framesBase</code> {String(validated.pack.framesBase || '')}
        {' · '}
        {validated.pack.frameWidth}×{validated.pack.frameHeight}
        {validated.pack.displayScale != null ? ` · échelle ${validated.pack.displayScale}` : ''}
        {' · '}
        silhouette <code>{String(validated.pack.fallbackSilhouette || '')}</code>
      </p>
      {validated.pack.stateAliases && Object.keys(validated.pack.stateAliases).length > 0 ? (
        <p className="section-sub" style={{ fontSize: '0.82rem' }}>
          Alias :{' '}
          {Object.entries(validated.pack.stateAliases)
            .map(([a, t]) => `${a}→${t}`)
            .join(', ')}
        </p>
      ) : null}
      <div style={{ overflowX: 'auto' }}>
        <table
          className="visit-mascot-pack-detail-table"
          style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}
        >
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(26,71,49,0.2)' }}>
              <th style={{ padding: '6px 8px' }}>État</th>
              <th style={{ padding: '6px 8px' }}>Images</th>
              <th style={{ padding: '6px 8px' }}>fps</th>
              <th style={{ padding: '6px 8px' }}>frameDwellMs</th>
              <th style={{ padding: '6px 8px' }}>Durée estimée</th>
            </tr>
          </thead>
          <tbody>
            {states.map((st) => {
              const spec = validated.pack.stateFrames[st];
              const n = Array.isArray(spec?.files)
                ? spec.files.length
                : Array.isArray(spec?.srcs)
                  ? spec.srcs.length
                  : 0;
              const dwell = Array.isArray(spec?.frameDwellMs) ? spec.frameDwellMs.join(', ') : '—';
              const dur = estimateStateDurationMs(validated.pack, st);
              return (
                <tr key={st} style={{ borderBottom: '1px solid rgba(26,71,49,0.08)' }}>
                  <td style={{ padding: '6px 8px' }}>
                    {STATE_LABELS[st] ? (
                      <>
                        {STATE_LABELS[st]}{' '}
                        <code style={{ fontSize: '0.9em', opacity: 0.85 }}>({st})</code>
                      </>
                    ) : (
                      <code>{st}</code>
                    )}
                  </td>
                  <td style={{ padding: '6px 8px' }}>{n}</td>
                  <td style={{ padding: '6px 8px' }}>
                    {spec?.fps != null ? String(spec.fps) : '—'}
                  </td>
                  <td style={{ padding: '6px 8px', maxWidth: 220, wordBreak: 'break-all' }}>
                    {dwell}
                  </td>
                  <td style={{ padding: '6px 8px' }}>{dur != null ? `${dur} ms` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
