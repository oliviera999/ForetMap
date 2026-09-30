import React, { useMemo } from 'react';

import { stripLeadingEmojiPrefix } from '../emojiPrefixCore.js';
import { parsePctPolygonPoints } from './pctPolygon.js';

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
 * Ce calque ne dessine **que les contours** : dans ce SVG étiré, un texte serait déformé
 * (audit C1). Emojis et noms sont posés en HTML par `PctLabelsLayer`, contre-échelonnés et
 * sans collision (voir `SharedMapStage`).
 *
 * @param {object} props
 * @param {Array<object>} props.zones zones `{ id, name, points, color }`.
 * @param {(zone: object, event: object) => void} props.onZoneClick handler stable.
 * @param {string|null} [props.activeZoneId] zone mise en avant (fiche ouverte).
 * @param {(zone: object) => boolean|null} [props.getIsSeen] progression Visite : true=vu,
 *   false=non-vu, null/omit=pas de classe seen.
 * @param {(zone: object) => boolean} [props.getDiscoverHalo] halo bref « à découvrir ».
 * @param {(zone: object) => string} [props.getStatusLabel] libellé des pastilles d'état de la
 *   zone (`PctStatusDotsLayer`), joint au nom accessible : les pastilles elles-mêmes sont
 *   décoratives et posées en HTML, pas dans ce SVG déformé (`preserveAspectRatio="none"`).
 * @param {string} [props.highlightLabel] complément du nom accessible d'une zone mise en
 *   avant (`zone.map_highlight`, plan e-nov) — son halo ne s'entend pas.
 * @param {string} [props.className]
 */
function PctZonesLayerImpl({
  zones,
  onZoneClick,
  activeZoneId = null,
  getIsSeen = null,
  getDiscoverHalo = null,
  getStatusLabel = null,
  highlightLabel = '',
  className = 'fm-pct-zones',
}) {
  const parsed = useMemo(
    () =>
      (zones || [])
        .map((zone) => {
          const points = parsePctPolygonPoints(zone.points);
          if (points.length < 3) return null;
          return {
            zone,
            pointsAttr: points.map((p) => `${p.xp},${p.yp}`).join(' '),
            // L'emoji est presque toujours saisi en tête du nom : il n'a rien à faire dans le
            // nom accessible (audit B3).
            name: stripLeadingEmojiPrefix(zone.name || ''),
          };
        })
        .filter(Boolean),
    [zones],
  );

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={`${className}${activeZoneId != null ? ' has-selection' : ''}`}
    >
      {parsed.map(({ zone, pointsAttr, name }) => {
        const isActive = activeZoneId != null && String(activeZoneId) === String(zone.id);
        const accessibleName = name || String(zone.name || '').trim();
        const activate = onZoneClick ? (event) => onZoneClick(zone, event) : undefined;
        const seenFlag = typeof getIsSeen === 'function' ? getIsSeen(zone) : null;
        const seenClass = seenFlag === true ? ' is-seen' : seenFlag === false ? ' is-unseen' : '';
        const haloClass =
          typeof getDiscoverHalo === 'function' && getDiscoverHalo(zone) ? ' is-discover-halo' : '';
        const statusSuffix =
          seenFlag === true ? ' — Vu' : seenFlag === false ? ' — À découvrir' : '';
        const dotsSuffix =
          typeof getStatusLabel === 'function' ? String(getStatusLabel(zone) || '').trim() : '';
        const highlighted = zone.map_highlight === true;
        const highlightSuffix = highlighted && highlightLabel ? ` — ${highlightLabel}` : '';
        return (
          <g
            key={zone.id}
            className={`fm-pct-zone${isActive ? ' is-active' : ''}${seenClass}${haloClass}${
              highlighted ? ' is-highlight' : ''
            }`}
            role={onZoneClick ? 'button' : undefined}
            tabIndex={onZoneClick ? 0 : undefined}
            aria-current={isActive ? 'true' : undefined}
            aria-label={
              onZoneClick
                ? `${accessibleName || 'Zone'}${highlightSuffix}${statusSuffix}${dotsSuffix ? ` — ${dotsSuffix}` : ''}`
                : undefined
            }
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
          </g>
        );
      })}
    </svg>
  );
}

export const PctZonesLayer = React.memo(PctZonesLayerImpl);
PctZonesLayer.displayName = 'PctZonesLayer';
