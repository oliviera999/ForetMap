import { useMemo } from 'react';
import { sortMarkersByPath } from '../../utils/glBoardPath.js';

/**
 * Le voile (« Tenir à deux », spec § 7) : une bande grise large le long du chemin, de la case
 * départ à la case de rang `position`, et les cases recouvertes en gris semi-transparent.
 * Jamais personnifié : pas de visage, pas d'icône ; légende « le voile ».
 *
 * `variante="projection"` : au tableau, lu du fond de la salle, la bande est plus opaque et
 * cernée d'un contour (modificateur `gl-voile-layer--projection`) — toujours sans pictogramme.
 */
export function GLVoileLayer({ markers = [], position = -1, variante = null }) {
  const sorted = useMemo(() => sortMarkersByPath(markers || []), [markers]);
  const pos = Number(position);
  if (!Number.isInteger(pos) || pos < 0 || !sorted.length) return null;
  const covered = sorted.slice(0, Math.min(pos, sorted.length - 1) + 1);
  const points = covered.map((m) => `${Number(m.x_pct)},${Number(m.y_pct)}`).join(' ');
  const projection = variante === 'projection';
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={projection ? 'gl-voile-layer gl-voile-layer--projection' : 'gl-voile-layer'}
      data-testid="gl-voile-layer"
      data-position={pos}
      role="img"
      aria-label="le voile"
    >
      {projection && covered.length > 1 ? (
        <polyline className="gl-voile-contour" points={points} />
      ) : null}
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
