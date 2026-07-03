import React from 'react';

import { detectLeadingMarkerEmoji, stripLeadingMarkerEmoji } from '../../constants/emojis';
import { TASK_VISUAL_LABEL } from '../../utils/taskEnrollment.js';

/**
 * Pré-parse les zones pour le calque SVG : `JSON.parse(z.points)` + détection de l'emoji
 * d'étiquette une seule fois par changement de données (à mémoïser côté appelant avec
 * `useMemo` keyé sur `[zones, emojiParsingList]`) au lieu d'à chaque rendu de la carte.
 * Les zones sans contour exploitable (< 3 points) sont écartées, comme avant
 * (`renderZonePoly` retournait `null`).
 *
 * @param {Array<object>} zones zones brutes (points JSON en %)
 * @param {string[]} emojiParsingList emojis reconnus en tête de nom
 * @returns {Array<{ zone: object, pts: Array<{xp:number,yp:number}>, zoneEmoji: string, zoneName: string }>}
 */
export function parseZonesForLayer(zones, emojiParsingList) {
  return (zones || [])
    .map((z) => {
      let pts;
      try {
        pts = z.points ? JSON.parse(z.points) : null;
      } catch (_e) {
        pts = null;
      }
      if (!pts || pts.length < 3) return null;
      return {
        zone: z,
        pts,
        zoneEmoji: detectLeadingMarkerEmoji(z.name || '', emojiParsingList),
        zoneName: stripLeadingMarkerEmoji(z.name || '', emojiParsingList),
      };
    })
    .filter(Boolean);
}

/**
 * Polygone d'une zone sur la carte (présentation) — extrait de `renderZonePoly` (MapView).
 * DOM/classes/styles/textes strictement inchangés ; mémoïsé pour ne re-rendre la zone que
 * si ses props changent (zoom `inv`, typo, visuels tâche/tutoriel, mode…).
 */
const ZonePolygon = React.memo(function ZonePolygon({
  parsed,
  iw,
  ih,
  inv,
  mode,
  showLabels,
  isEditing,
  taskVisual,
  tutorialCount,
  emojiFontPx,
  labelFontPx,
  emojiLabelCenterGap,
  onZoneOpen,
}) {
  const { zone: z, pts, zoneEmoji, zoneName } = parsed;
  const wp = pts.map((p) => ({ cx: (p.xp / 100) * iw, cy: (p.yp / 100) * ih }));
  const str = wp.map((p) => `${p.cx},${p.cy}`).join(' ');
  const mx = wp.reduce((s, p) => s + p.cx, 0) / wp.length;
  const my = wp.reduce((s, p) => s + p.cy, 0) / wp.length;
  const isEd = isEditing;
  return (
    <g
      className={mode === 'view' ? 'map-zone-hit' : ''}
      style={{ cursor: mode === 'view' ? 'pointer' : 'default' }}
      onClick={(e) => onZoneOpen(z, e)}
    >
      <polygon
        points={str}
        fill={isEd ? 'rgba(82,183,136,0.35)' : z.color || '#86efac90'}
        stroke={isEd ? '#52b788' : 'rgba(26,71,49,0.5)'}
        strokeWidth={(isEd ? 2.5 : 1.5) * inv}
        strokeDasharray={z.special ? `${5 * inv},${3 * inv}` : 'none'}
      />
      {showLabels && (
        <text
          x={mx}
          y={my}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={emojiFontPx}
          fontFamily="ForetMapColorEmoji, Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {zoneEmoji || ''}
        </text>
      )}
      {showLabels && (
        <text
          x={mx}
          y={my + (zoneEmoji ? emojiLabelCenterGap : 0)}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={labelFontPx}
          fontWeight="700"
          fontFamily="DM Sans,sans-serif"
          fill="#1a4731"
          stroke="rgba(255,255,255,0.8)"
          strokeWidth={3 * inv}
          paintOrder="stroke"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          {zoneName || z.name}
        </text>
      )}
      {taskVisual && (
        <circle
          className={`map-task-status map-task-status--${taskVisual}`}
          cx={mx + 16 * inv}
          cy={my - 12 * inv}
          r={Math.max(5, 7 * inv)}
          style={{ pointerEvents: 'none' }}
        >
          <title>{TASK_VISUAL_LABEL[taskVisual]}</title>
        </circle>
      )}
      {tutorialCount > 0 && (
        <circle
          className="map-tutorial-zone-dot"
          cx={mx - 16 * inv}
          cy={my - 12 * inv}
          r={Math.max(4, 6 * inv)}
          style={{ pointerEvents: 'none' }}
        >
          <title>
            {tutorialCount === 1 ? '1 tutoriel lié' : `${tutorialCount} tutoriels liés`}
          </title>
        </circle>
      )}
    </g>
  );
});

/**
 * Calque des polygones de zones (SVG) — extrait de `MapView`.
 * Mémoïsé : ne re-rend que si les zones pré-parsées, le zoom, la typo ou les visuels changent
 * (plus de re-parse JSON/centroïde/emoji par zone à chaque rendu de la carte).
 *
 * @param {object} props
 * @param {ReturnType<typeof parseZonesForLayer>} props.parsedZones zones pré-parsées (mémoïsées)
 * @param {number} props.iw largeur naturelle du plan (px monde)
 * @param {number} props.ih hauteur naturelle du plan (px monde)
 * @param {number} props.inv inverse de l'échelle commitée (traits constants à l'écran)
 * @param {string} props.mode mode carte (`view`, `draw-zone`, `edit-points`, …)
 * @param {boolean} props.showLabels affiche emoji + nom des zones
 * @param {string|number|null} props.editZoneId id de la zone en édition de contour (surbrillance)
 * @param {Map<*, string>} props.zoneTaskVisualById visuel de tâche par id de zone
 * @param {Map<*, number>} props.zoneTutorialCountById nb de tutoriels liés par id de zone
 * @param {number} props.emojiFontPx taille de l'emoji d'étiquette (px monde)
 * @param {number} props.labelFontPx taille du nom de zone (px monde)
 * @param {number} props.emojiLabelCenterGap écart vertical emoji/nom (px monde)
 * @param {(zone: object, e: React.MouseEvent) => void} props.onZoneOpen clic zone (handler stable)
 */
export const ZonePolygonsLayer = React.memo(function ZonePolygonsLayer({
  parsedZones,
  iw,
  ih,
  inv,
  mode,
  showLabels,
  editZoneId,
  zoneTaskVisualById,
  zoneTutorialCountById,
  emojiFontPx,
  labelFontPx,
  emojiLabelCenterGap,
  onZoneOpen,
}) {
  return (
    <>
      {parsedZones.map((parsed) => (
        <ZonePolygon
          key={parsed.zone.id}
          parsed={parsed}
          iw={iw}
          ih={ih}
          inv={inv}
          mode={mode}
          showLabels={showLabels}
          isEditing={mode === 'edit-points' && editZoneId === parsed.zone.id}
          taskVisual={zoneTaskVisualById.get(parsed.zone.id)}
          tutorialCount={zoneTutorialCountById.get(parsed.zone.id) || 0}
          emojiFontPx={emojiFontPx}
          labelFontPx={labelFontPx}
          emojiLabelCenterGap={emojiLabelCenterGap}
          onZoneOpen={onZoneOpen}
        />
      ))}
    </>
  );
});
