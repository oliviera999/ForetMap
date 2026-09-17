import { useMemo } from 'react';
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
      <p className="section-sub" style={{ fontSize: 'var(--text-sm)' }}>
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
        <p className="section-sub" style={{ fontSize: 'var(--text-sm)' }}>
          Alias :{' '}
          {Object.entries(validated.pack.stateAliases)
            .map(([a, t]) => `${a}→${t}`)
            .join(', ')}
        </p>
      ) : null}
      {/* Ce tableau réécrivait toute son apparence en styles inline — largeur, filets,
          marges de cellule, taille de texte — donc hors de portée de la moindre feuille.
          `.fm-table` la porte maintenant (shared/styles/surfaces.css). */}
      <div className="fm-table-wrap">
        <table className="fm-table fm-table--dense visit-mascot-pack-detail-table">
          <thead>
            <tr>
              <th>État</th>
              <th>Images</th>
              <th>fps</th>
              <th>frameDwellMs</th>
              <th>Durée estimée</th>
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
                <tr key={st}>
                  <td>
                    {STATE_LABELS[st] ? (
                      <>
                        {STATE_LABELS[st]}{' '}
                        <code style={{ fontSize: '0.9em', opacity: 0.85 }}>({st})</code>
                      </>
                    ) : (
                      <code>{st}</code>
                    )}
                  </td>
                  <td>{n}</td>
                  <td>{spec?.fps != null ? String(spec.fps) : '—'}</td>
                  {/* Une liste de durées peut être longue : elle se casse dans sa colonne
                      plutôt que d'élargir le tableau. */}
                  <td className="visit-mascot-pack-detail-table__dwell">{dwell}</td>
                  <td>{dur != null ? `${dur} ms` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
