import { useMemo } from 'react';
import { sortMarkersByPath } from '../../utils/glBoardPath.js';

/**
 * Le voile (« Tenir à deux », spec § 7) : une bande grise large le long du chemin, de la case
 * départ à la case de rang `position`, et les cases recouvertes en gris semi-transparent.
 * Jamais personnifié : pas de visage, pas d'icône ; légende « le voile ».
 */
export function GLVoileLayer({ markers = [], position = -1 }) {
  const sorted = useMemo(() => sortMarkersByPath(markers || []), [markers]);
  const pos = Number(position);
  if (!Number.isInteger(pos) || pos < 0 || !sorted.length) return null;
  const covered = sorted.slice(0, Math.min(pos, sorted.length - 1) + 1);
  const points = covered.map((m) => `${Number(m.x_pct)},${Number(m.y_pct)}`).join(' ');
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="gl-voile-layer"
      data-testid="gl-voile-layer"
      data-position={pos}
      role="img"
      aria-label="le voile"
    >
      {covered.length > 1 ? <polyline className="gl-voile-bande" points={points} /> : null}
      {covered.map((m) => (
        <circle
          key={`voile-${m.id}`}
          className="gl-voile-case"
          cx={Number(m.x_pct)}
          cy={Number(m.y_pct)}
          r="2.6"
        />
      ))}
    </svg>
  );
}
