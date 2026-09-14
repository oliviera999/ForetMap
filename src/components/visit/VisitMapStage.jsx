import { useCallback, useMemo } from 'react';

import { detectLeadingMarkerEmoji, stripLeadingMarkerEmoji } from '../../constants/emojis.js';
import { SharedMapStage } from '../../shared/pct-map/SharedMapStage.jsx';
import { parsePctPolygonPoints } from '../../shared/pct-map/pctPolygon.js';
import { polygonPoleOfInaccessibilityPct } from '../../shared/pct-map/pctPolylabel.js';
import { itemSeenKey } from '../../utils/visitMediaGallery.js';

/**
 * Sépare l'emoji en tête du nom (catalogue marqueurs Visite + repli grapheme).
 * @param {string} rawName
 * @returns {{ emoji: string, name: string }}
 */
function visitSplitNameEmoji(rawName) {
  return {
    emoji: detectLeadingMarkerEmoji(rawName) || '',
    name: stripLeadingMarkerEmoji(rawName),
  };
}

/**
 * Point de centrage Visite : repère en % image, ou pôle d'inaccessibilité du polygone.
 * @param {object} place
 * @returns {{ xp: number, yp: number }|null}
 */
function visitFocusPlacePct(place) {
  if (!place) return null;
  if (place.kind === 'marker' || (place.x_pct != null && place.y_pct != null && !place.points)) {
    const xp = Number(place.x_pct);
    const yp = Number(place.y_pct);
    return Number.isFinite(xp) && Number.isFinite(yp) ? { xp, yp } : null;
  }
  const points = parsePctPolygonPoints(place.points);
  if (!points || points.length < 3) return null;
  return (
    polygonPoleOfInaccessibilityPct(points) || {
      xp: points.reduce((sum, p) => sum + p.xp, 0) / points.length,
      yp: points.reduce((sum, p) => sum + p.yp, 0) / points.length,
    }
  );
}

/**
 * Scène carte Visite : enveloppe de `SharedMapStage` avec classes CSS visite,
 * statut « vu », mascotte en calque, et clustering désactivé en édition.
 *
 * @param {object} props
 * @param {Set<string>} [props.seen] clés `itemSeenKey` des éléments déjà vus
 * @param {boolean} [props.editMode] si vrai, pas de regroupement des repères
 * @param {import('react').ReactNode} [props.mascot] calque mascotte (alias d'`overlaySlot`)
 * @param {import('react').ReactNode} [props.children] contenu overlay (prioritaire sur `mascot`)
 * @param {import('react').ReactNode} [props.overlaySlot]
 */
export function VisitMapStage({
  seen = null,
  editMode = false,
  mascot = null,
  children = null,
  overlaySlot = null,
  ...rest
}) {
  const getIsSeen = useCallback(
    (zoneOrMarker) => {
      if (!(seen instanceof Set)) return null;
      // Zones : champ `points` ; repères : `x_pct`/`y_pct`. `kind` prime s'il est déjà posé.
      let type = zoneOrMarker?.kind;
      if (type !== 'zone' && type !== 'marker') {
        type =
          zoneOrMarker?.points != null && String(zoneOrMarker.points).trim() !== ''
            ? 'zone'
            : 'marker';
      }
      return seen.has(itemSeenKey(type, zoneOrMarker.id));
    },
    [seen],
  );

  const resolvedOverlay = useMemo(
    () => overlaySlot ?? children ?? mascot ?? null,
    [overlaySlot, children, mascot],
  );

  return (
    <SharedMapStage
      {...rest}
      className="visit-map-stage"
      worldClassName="visit-map-world"
      fitClassName="visit-map-fit-layer"
      imgClassName="visit-map-img"
      controlsClassName="fm-pct-map-controls"
      testIdPrefix="visit"
      locateLabel="Me situer"
      getIsSeen={getIsSeen}
      clusteringEnabled={!editMode}
      applyZoomOnlyCategories={false}
      splitNameEmoji={visitSplitNameEmoji}
      focusPlacePct={visitFocusPlacePct}
      overlaySlot={resolvedOverlay}
    />
  );
}
