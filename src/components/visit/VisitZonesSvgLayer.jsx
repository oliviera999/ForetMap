import React, { useMemo } from 'react';
import { parseVisitZonePoints } from '../../utils/visitMapGeometry.js';
import { detectLeadingMarkerEmoji, stripLeadingMarkerEmoji } from '../../constants/emojis';
import { itemSeenKey } from '../../utils/visitMediaGallery.js';
import { visitZoneSvgTextUniformYTransform } from '../../utils/visitMascotGeometry.js';
import { VisitDrawZonePreview } from '../VisitDrawZonePreview.jsx';

/**
 * Calque SVG des zones de la visite (polygones + emoji/libellé) — extraction
 * iso-comportement du rendu inline de VisitViewImpl (visit-views.jsx).
 *
 * Mémoïsé (React.memo) : ne re-rend que si ses props changent (props scalaires ou
 * identités stables côté parent). Les points de chaque zone sont pré-parsés dans un
 * useMemo keyé sur `zones` — auparavant `parseVisitZonePoints` était refait par zone
 * à chaque rendu de la vue.
 *
 * @param {object} props
 * @param {Array<object>} props.zones zones de la visite (`content.zones`).
 * @param {Set<string>} props.seen clés `itemSeenKey` des éléments vus.
 * @param {Array<string>} props.markerEmojis emojis « lieu » configurés (détection préfixe).
 * @param {{ emojiU: number, labelU: number, gapU: number, strokeU: number }} props.typography tailles en unités SVG.
 * @param {number} props.fitWidth largeur du rect « contain » (px).
 * @param {number} props.fitHeight hauteur du rect « contain » (px).
 * @param {string} props.mode mode courant (`view` | `draw-zone` | `add-marker`).
 * @param {Array<{ xp: number, yp: number }>} props.drawPoints points du tracé en cours (mode prof).
 * @param {(zone: object, event: object) => void} props.onZoneClick clic sur une zone (handler stable).
 */
function VisitZonesSvgLayerImpl({
  zones,
  seen,
  markerEmojis,
  typography,
  fitWidth,
  fitHeight,
  mode,
  drawPoints,
  onZoneClick,
}) {
  /** Géométrie pré-parsée par zone (points, attribut polygon, centre du libellé). */
  const parsedZones = useMemo(
    () =>
      (zones || [])
        .map((z) => {
          const points = parseVisitZonePoints(z.points);
          if (points.length < 3) return null;
          return {
            zone: z,
            pointsAttr: points.map((pt) => `${pt.xp},${pt.yp}`).join(' '),
            mx: points.reduce((s, pt) => s + pt.xp, 0) / points.length,
            my: points.reduce((s, pt) => s + pt.yp, 0) / points.length,
          };
        })
        .filter(Boolean),
    [zones],
  );

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="visit-map-zones">
      {parsedZones.map(({ zone: z, pointsAttr, mx, my }) => {
        const isSeen = seen.has(itemSeenKey('zone', z.id));
        const zoneEmoji = detectLeadingMarkerEmoji(z.name || '', markerEmojis);
        const zoneLabel = stripLeadingMarkerEmoji(z.name || '', markerEmojis);
        const { emojiU, labelU, gapU, strokeU } = typography;
        const titleY = my;
        const titleUniform = visitZoneSvgTextUniformYTransform(mx, titleY, fitWidth, fitHeight);
        const showZoneLabel = Boolean(String(zoneLabel || '').trim() || z.name);
        return (
          <g
            key={z.id}
            className="visit-zone-hit"
            style={{ cursor: 'pointer' }}
            onClick={(event) => onZoneClick(z, event)}
          >
            <polygon
              points={pointsAttr}
              className={`visit-zone-poly ${isSeen ? 'is-seen' : 'is-unseen'}`}
            />
            {zoneEmoji || showZoneLabel ? (
              <g transform={titleUniform}>
                {zoneEmoji ? (
                  <text
                    x={mx}
                    y={titleY}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={emojiU}
                    className="visit-zone-label visit-zone-label--emoji"
                  >
                    {zoneEmoji}
                  </text>
                ) : null}
                {showZoneLabel ? (
                  <text
                    x={mx}
                    y={titleY + (zoneEmoji ? gapU : 0)}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={labelU}
                    fontWeight="700"
                    fontFamily="DM Sans, sans-serif"
                    fill="#1a4731"
                    stroke="rgba(255,255,255,0.88)"
                    strokeWidth={strokeU}
                    paintOrder="stroke"
                    className="visit-zone-label visit-zone-label--title"
                  >
                    {zoneLabel || z.name}
                  </text>
                ) : null}
              </g>
            ) : null}
          </g>
        );
      })}
      {mode === 'draw-zone' && drawPoints.length >= 1 && (
        <VisitDrawZonePreview points={drawPoints} />
      )}
    </svg>
  );
}

export const VisitZonesSvgLayer = React.memo(VisitZonesSvgLayerImpl);
VisitZonesSvgLayer.displayName = 'VisitZonesSvgLayer';
