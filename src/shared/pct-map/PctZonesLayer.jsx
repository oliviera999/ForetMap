import React, { useMemo } from 'react';

import { stripLeadingEmojiPrefix } from '../emojiPrefixCore.js';
import { parsePctPolygonPoints } from './pctPolygon.js';
import { polygonPoleOfInaccessibilityPct } from './pctPolylabel.js';

/**
 * Calque SVG des zones d'une carte « % image » (noyau carte partagé, lot 4).
 *
 * `viewBox="0 0 100 100"` + `preserveAspectRatio="none"` : les points stockés en pourcentage
 * de l'image se tracent tels quels, quel que soit le zoom, tant que le calque parent épouse
 * le rectangle « contain » (voir `PctImageLayer`).
 *
 * Chaque zone est un **bouton** : `role`, `tabIndex` et `aria-label` la rendent atteignable au
 * clavier et annonçable par un lecteur d'écran, comme les repères
 * (`docs/AUDIT_PLAN_AFFICHAGE_2026-09.md` C4 — les 28 zones du plan de Lyautey, soit 58 % des
 * lieux, en étaient privées).
 *
 * Les étiquettes intégrées (`showLabels`) restent disponibles pour un rendu simple ; un
 * produit qui veut des étiquettes non déformées, contre-échelonnées et sans collision les
 * désactive et pose `PctLabelsLayer` par-dessus (voir `PlanMapStage`).
 *
 * @param {object} props
 * @param {Array<object>} props.zones zones `{ id, name, points, color, emoji }`.
 * @param {(zone: object, event: object) => void} props.onZoneClick handler stable.
 * @param {string|null} [props.activeZoneId] zone mise en avant (fiche ouverte).
 * @param {boolean} [props.showLabels=true] afficher emoji et nom au centre.
 * @param {string} [props.className]
 */
function PctZonesLayerImpl({
  zones,
  onZoneClick,
  activeZoneId = null,
  showLabels = true,
  className = 'fm-pct-zones',
}) {
  const parsed = useMemo(
    () =>
      (zones || [])
        .map((zone) => {
          const points = parsePctPolygonPoints(zone.points);
          if (points.length < 3) return null;
          // Ancrage au **pôle d'inaccessibilité** plutôt qu'au centroïde arithmétique : sur un
          // bâtiment en L ou en U, ce dernier tombe hors du polygone et le nom flotte sur le
          // voisin (audit B2 : deux zones dans ce cas sur le plan de Lyautey).
          const anchor = polygonPoleOfInaccessibilityPct(points);
          return {
            zone,
            pointsAttr: points.map((p) => `${p.xp},${p.yp}`).join(' '),
            cx: anchor ? anchor.xp : points.reduce((sum, p) => sum + p.xp, 0) / points.length,
            cy: anchor ? anchor.yp : points.reduce((sum, p) => sum + p.yp, 0) / points.length,
            // L'emoji est presque toujours saisi en tête du nom : sans séparation il est
            // dessiné deux fois (audit B3).
            name: stripLeadingEmojiPrefix(zone.name || ''),
          };
        })
        .filter(Boolean),
    [zones],
  );

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={className}>
      {parsed.map(({ zone, pointsAttr, cx, cy, name }) => {
        const isActive = activeZoneId != null && String(activeZoneId) === String(zone.id);
        const emoji = String(zone.emoji || '').trim();
        const accessibleName = name || String(zone.name || '').trim();
        const activate = onZoneClick ? (event) => onZoneClick(zone, event) : undefined;
        return (
          <g
            key={zone.id}
            className={`fm-pct-zone${isActive ? ' is-active' : ''}`}
            role={onZoneClick ? 'button' : undefined}
            tabIndex={onZoneClick ? 0 : undefined}
            aria-label={onZoneClick ? accessibleName || 'Zone' : undefined}
            onClick={activate}
            onKeyDown={
              activate
                ? (event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    activate(event);
                  }
                : undefined
            }
          >
            <polygon
              points={pointsAttr}
              className="fm-pct-zone__poly"
              style={zone.color ? { fill: zone.color } : undefined}
            />
            {showLabels && emoji ? (
              <text x={cx} y={cy} className="fm-pct-zone__emoji" textAnchor="middle">
                {emoji}
              </text>
            ) : null}
            {showLabels && name ? (
              <text
                x={cx}
                y={cy + (emoji ? 4 : 0)}
                className="fm-pct-zone__name"
                textAnchor="middle"
              >
                {name}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

export const PctZonesLayer = React.memo(PctZonesLayerImpl);
PctZonesLayer.displayName = 'PctZonesLayer';
