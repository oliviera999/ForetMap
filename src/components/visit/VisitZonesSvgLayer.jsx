import React, { useMemo } from 'react';
import { parseVisitZonePoints } from '../../utils/visitMapGeometry.js';
import { detectLeadingMarkerEmoji, stripLeadingMarkerEmoji } from '../../constants/emojis';
import { itemSeenKey } from '../../utils/visitMediaGallery.js';
import { visitZoneSvgTextUniformYTransform } from '../../utils/visitMascotGeometry.js';
import {
  shouldCompressOverlayLabel,
  shouldShowZoneEmojiLabel,
  shouldShowZoneNameLabel,
} from '../../utils/mapOverlayZoneLabels.js';
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
 * @param {{ emojiU: number, labelU: number, gapU: number, strokeU: number, labelFontPx: number, emojiFontPx: number, minSideFactor: number, labelMaxWorldLength: number, labelCompressChars: number, inv: number }} props.typography tailles en unités SVG + seuils masquage.
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
  const {
    emojiU,
    labelU,
    gapU,
    strokeU,
    labelFontPx,
    emojiFontPx,
    minSideFactor,
    labelMaxTextLengthU,
    labelCompressChars,
    inv,
  } = typography;

  /** Géométrie pré-parsée par zone (points, attribut polygon, centre du libellé). */
  const parsedZones = useMemo(
    () =>
      (zones || [])
        .map((z) => {
          const points = parseVisitZonePoints(z.points);
          if (points.length < 3) return null;
          const ptsPct = points.map((pt) => ({ xp: pt.xp, yp: pt.yp }));
          return {
            zone: z,
            ptsPct,
            pointsAttr: points.map((pt) => `${pt.xp},${pt.yp}`).join(' '),
            mx: points.reduce((s, pt) => s + pt.xp, 0) / points.length,
            my: points.reduce((s, pt) => s + pt.yp, 0) / points.length,
          };
        })
        .filter(Boolean),
    [zones],
  );

  const iw = fitWidth > 0 ? fitWidth : 360;
  const ih = fitHeight > 0 ? fitHeight : 480;

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="visit-map-zones">
      {parsedZones.map(({ zone: z, ptsPct, pointsAttr, mx, my }) => {
        const isSeen = seen.has(itemSeenKey('zone', z.id));
        const zoneEmoji = detectLeadingMarkerEmoji(z.name || '', markerEmojis);
        const zoneLabel = stripLeadingMarkerEmoji(z.name || '', markerEmojis);
        const zoneNameText = zoneLabel || z.name || '';
        const titleY = my;
        const titleUniform = visitZoneSvgTextUniformYTransform(mx, titleY, fitWidth, fitHeight);
        const showZoneEmoji =
          Boolean(zoneEmoji) &&
          shouldShowZoneEmojiLabel({
            pts: ptsPct,
            iw,
            ih,
            inv,
            emojiFontPx,
            minSideFactor,
          });
        const showZoneName =
          shouldShowZoneNameLabel({
            pts: ptsPct,
            iw,
            ih,
            inv,
            labelFontPx,
            minSideFactor,
          }) && Boolean(String(zoneNameText).trim());
        const compressLongName = shouldCompressOverlayLabel(zoneNameText, labelCompressChars);
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
            {showZoneEmoji || showZoneName ? (
              <g transform={titleUniform}>
                {showZoneEmoji ? (
                  <text
                    x={mx}
                    y={titleY}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={emojiU}
                    className="visit-zone-label visit-zone-label--emoji map-overlay-emoji-label"
                  >
                    {zoneEmoji}
                  </text>
                ) : null}
                {showZoneName ? (
                  <text
                    x={mx}
                    y={titleY + (showZoneEmoji ? gapU : 0)}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={labelU}
                    className="visit-zone-label visit-zone-label--title map-overlay-name-label map-overlay-name-label--svg"
                    strokeWidth={strokeU}
                    textLength={compressLongName ? labelMaxTextLengthU : undefined}
                    lengthAdjust={compressLongName ? 'spacingAndGlyphs' : undefined}
                  >
                    {zoneNameText}
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
