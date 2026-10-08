import React, { useMemo } from 'react';

import {
  pctToLayerPx,
  routeSegments,
  routeStepState,
  segmentChevrons,
} from '../map-routes/routeGeometry.js';

/** Écart entre deux chevrons, en pixels **écran** (constant quel que soit le zoom). */
const CHEVRON_SPACING_SCREEN_PX = 46;
/** Sous cette longueur à l'écran, un tronçon ne porte pas de chevron. */
const CHEVRON_MIN_SEGMENT_SCREEN_PX = 26;

/** Chevron centré sur l'origine, pointant vers +x (la transformation l'oriente). */
const CHEVRON_PATH = 'M -3.2 -4.6 L 2.2 0 L -3.2 4.6';

function Chevrons({ a, b, spacingPx, minLengthPx, className }) {
  const items = segmentChevrons(a, b, { spacingPx, minLengthPx });
  return items.map((c, i) => (
    <g
      // Rang dans le tronçon : stable tant que le tronçon ne change pas.
      key={i}
      className={className}
      transform={`translate(${c.x} ${c.y}) rotate(${c.angleDeg})`}
    >
      <path d={CHEVRON_PATH} />
    </g>
  ));
}

/**
 * Lignes d'un parcours, dessinées en **pixels du calque** (`viewBox` aux dimensions du
 * rectangle image) : contrairement à l'ancien trait en `viewBox 0 0 100 100` étiré, un chevron
 * reste un chevron sur un plan qui n'est pas carré. Épaisseurs et chevrons gardent une taille
 * constante à l'écran grâce à `--pct-inv`, comme les autres habillages de la carte.
 *
 * Deux couches :
 *   - le **tracé complet** (étape 1 → 2 → … → N), liseré clair et chevrons dans le sens de
 *     marche. En vue d'ensemble il est plein ; pendant les étapes, il passe en fond — tronçons
 *     déjà faits grisés, tronçon menant à l'étape courante mis en avant ;
 *   - la **ligne de guidage** position → étape courante (ou lieu visé par « Y aller ») : plus
 *     épaisse, chevrons qui défilent vers la cible (figés si animation coupée).
 *
 * @param {object} props
 * @param {Array<{ xp: number, yp: number, index: number }>} [props.points] étapes dessinables.
 * @param {'overview'|'steps'} [props.phase]
 * @param {number} [props.currentIndex]
 * @param {boolean} [props.showFullPath=true] dessiner le tracé complet.
 * @param {{ xp: number, yp: number }|null} [props.guideFrom] position de la personne.
 * @param {{ xp: number, yp: number }|null} [props.guideTo] cible de la ligne de guidage.
 * @param {number} props.widthPx largeur du rectangle image à l'échelle 1.
 * @param {number} props.heightPx hauteur du rectangle image à l'échelle 1.
 * @param {number} [props.scale=1] échelle courante de la vue (espacement des chevrons).
 * @param {boolean} [props.animated=true]
 * @param {string} [props.className]
 */
function PctRouteLinesImpl({
  points = [],
  phase = 'steps',
  currentIndex = 0,
  showFullPath = true,
  guideFrom = null,
  guideTo = null,
  widthPx,
  heightPx,
  scale = 1,
  animated = true,
  className = '',
}) {
  const w = Number(widthPx) || 0;
  const h = Number(heightPx) || 0;
  const s = Number(scale) > 0 ? Number(scale) : 1;
  const spacingPx = CHEVRON_SPACING_SCREEN_PX / s;
  const minLengthPx = CHEVRON_MIN_SEGMENT_SCREEN_PX / s;

  const segments = useMemo(() => {
    if (!showFullPath || !(w > 0) || !(h > 0)) return [];
    return routeSegments(points, { phase, currentIndex }).map((seg) => ({
      ...seg,
      a: pctToLayerPx(seg.from, w, h),
      b: pctToLayerPx(seg.to, w, h),
    }));
  }, [points, phase, currentIndex, showFullPath, w, h]);

  const guide = useMemo(() => {
    if (!guideFrom || !guideTo || !(w > 0) || !(h > 0)) return null;
    return { a: pctToLayerPx(guideFrom, w, h), b: pctToLayerPx(guideTo, w, h) };
  }, [guideFrom, guideTo, w, h]);

  if (!segments.length && !guide) return null;
  const rootClass = ['fm-pct-route', `is-phase-${phase}`, animated ? 'is-animated' : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <svg
      className={rootClass}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden
      data-testid="map-route-lines"
    >
      {segments.length ? (
        <g className="fm-pct-route__path">
          {segments.map((seg) => (
            <line
              key={`casing-${seg.from.index}-${seg.to.index}`}
              className={`fm-pct-route__casing is-${seg.state}`}
              x1={seg.a.x}
              y1={seg.a.y}
              x2={seg.b.x}
              y2={seg.b.y}
            />
          ))}
          {segments.map((seg) => (
            <line
              key={`stroke-${seg.from.index}-${seg.to.index}`}
              className={`fm-pct-route__stroke is-${seg.state}`}
              x1={seg.a.x}
              y1={seg.a.y}
              x2={seg.b.x}
              y2={seg.b.y}
            />
          ))}
          {segments.map((seg) => (
            <g key={`chev-${seg.from.index}-${seg.to.index}`}>
              <Chevrons
                a={seg.a}
                b={seg.b}
                spacingPx={spacingPx}
                minLengthPx={minLengthPx}
                className={`fm-pct-route__chevron is-${seg.state}`}
              />
            </g>
          ))}
        </g>
      ) : null}
      {guide ? (
        <g className="fm-pct-route__guide" data-testid="map-route-guide">
          <line
            className="fm-pct-route__guide-casing"
            x1={guide.a.x}
            y1={guide.a.y}
            x2={guide.b.x}
            y2={guide.b.y}
          />
          <line
            className="fm-pct-route__guide-stroke"
            x1={guide.a.x}
            y1={guide.a.y}
            x2={guide.b.x}
            y2={guide.b.y}
          />
          <line
            className="fm-pct-route__guide-flow"
            x1={guide.a.x}
            y1={guide.a.y}
            x2={guide.b.x}
            y2={guide.b.y}
          />
          <Chevrons
            a={guide.a}
            b={guide.b}
            spacingPx={spacingPx}
            minLengthPx={minLengthPx}
            className="fm-pct-route__guide-chevron"
          />
        </g>
      ) : null}
    </svg>
  );
}

export const PctRouteLines = React.memo(PctRouteLinesImpl);
PctRouteLines.displayName = 'PctRouteLines';

/**
 * Pastilles numérotées des étapes, au-dessus des repères. Calque HTML (et non SVG) : le
 * numéro reste droit sur une carte orientée et garde sa taille au zoom (`--pct-inv`,
 * `--pct-orient`). Décalées en haut à droite du lieu pour ne pas masquer son emoji, et
 * transparentes au toucher : le lieu reste ouvrable sous la pastille.
 *
 * Purement visuelles (`aria-hidden`) : la barre de parcours énonce déjà les étapes.
 *
 * @param {object} props
 * @param {Array<{ xp: number, yp: number, index: number, number: number }>} props.points
 * @param {'overview'|'steps'} [props.phase]
 * @param {number} [props.currentIndex]
 * @param {number} [props.total] nombre d'étapes du parcours (repère d'arrivée).
 */
function PctRouteBadgesImpl({ points = [], phase = 'steps', currentIndex = 0, total = 0 }) {
  if (!points.length) return null;
  const lastIndex = Math.max(0, (Number(total) || points.length) - 1);
  return (
    <div className="fm-pct-route-badges" aria-hidden data-testid="map-route-badges">
      {points.map((point) => {
        const state = routeStepState(point.index, { phase, currentIndex });
        const isStart = point.index === 0;
        const isEnd = point.index === lastIndex && lastIndex > 0;
        return (
          <span
            key={point.index}
            className={`fm-pct-route-badge is-${state}${isStart ? ' is-start' : ''}${
              isEnd ? ' is-end' : ''
            }`}
            style={{ left: `${point.xp}%`, top: `${point.yp}%` }}
            data-step-number={point.number}
          >
            <span className="fm-pct-route-badge__inner">
              <span className="fm-pct-route-badge__number">
                {state === 'done' ? '✓' : point.number}
              </span>
              {phase === 'overview' && isStart ? (
                <span className="fm-pct-route-badge__tag">Départ</span>
              ) : null}
              {phase === 'overview' && isEnd ? (
                <span className="fm-pct-route-badge__tag">Arrivée 🏁</span>
              ) : null}
            </span>
          </span>
        );
      })}
    </div>
  );
}

export const PctRouteBadges = React.memo(PctRouteBadgesImpl);
PctRouteBadges.displayName = 'PctRouteBadges';
