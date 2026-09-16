import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { detectLeadingMarkerEmoji, stripLeadingMarkerEmoji } from '../../constants/emojis.js';
import { SharedMapStage } from '../../shared/pct-map/SharedMapStage.jsx';
import { parsePctPolygonPoints } from '../../shared/pct-map/pctPolygon.js';
import { polygonPoleOfInaccessibilityPct } from '../../shared/pct-map/pctPolylabel.js';
import { DISCOVER_HALO_MS, pickDiscoverHaloKeys } from '../../utils/visitDiscoverHalo.js';
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

/** Type zone|marker pour une clé de progression. */
function visitPlaceType(zoneOrMarker) {
  let type = zoneOrMarker?.kind;
  if (type !== 'zone' && type !== 'marker') {
    type =
      zoneOrMarker?.points != null && String(zoneOrMarker.points).trim() !== '' ? 'zone' : 'marker';
  }
  return type;
}

/**
 * Scène carte Visite : enveloppe de `SharedMapStage` avec classes CSS visite,
 * statut « vu », halo bref sur quelques non-vus, mascotte en calque, clustering
 * désactivé en édition.
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
  className = '',
  zones = null,
  markers = null,
  map = null,
  ...rest
}) {
  const getIsSeen = useCallback(
    (zoneOrMarker) => {
      if (!(seen instanceof Set)) return null;
      return seen.has(itemSeenKey(visitPlaceType(zoneOrMarker), zoneOrMarker.id));
    },
    [seen],
  );

  const mapId = map?.id != null ? String(map.id) : '';
  const haloPlayedForMapRef = useRef(null);
  const [haloKeys, setHaloKeys] = useState(() => new Set());
  const [haloActive, setHaloActive] = useState(false);

  useEffect(() => {
    if (!mapId || !(seen instanceof Set) || editMode) {
      setHaloActive(false);
      setHaloKeys(new Set());
      return undefined;
    }
    if (haloPlayedForMapRef.current === mapId) return undefined;

    const prefersReduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      haloPlayedForMapRef.current = mapId;
      setHaloActive(false);
      setHaloKeys(new Set());
      return undefined;
    }

    const placeCount = (zones?.length || 0) + (markers?.length || 0);
    if (placeCount === 0) return undefined;

    const next = pickDiscoverHaloKeys({
      zones: zones || [],
      markers: markers || [],
      seen,
    });
    haloPlayedForMapRef.current = mapId;
    if (next.size === 0) {
      setHaloActive(false);
      setHaloKeys(new Set());
      return undefined;
    }

    setHaloKeys(next);
    setHaloActive(true);
    const timer = window.setTimeout(() => setHaloActive(false), DISCOVER_HALO_MS);
    return () => window.clearTimeout(timer);
  }, [mapId, zones, markers, seen, editMode]);

  const getDiscoverHalo = useCallback(
    (zoneOrMarker) => {
      if (!haloActive || !(haloKeys instanceof Set) || haloKeys.size === 0) return false;
      return haloKeys.has(itemSeenKey(visitPlaceType(zoneOrMarker), zoneOrMarker.id));
    },
    [haloActive, haloKeys],
  );

  const resolvedOverlay = useMemo(
    () => overlaySlot ?? children ?? mascot ?? null,
    [overlaySlot, children, mascot],
  );

  const stageClassName = ['visit-map-stage', className]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return (
    <SharedMapStage
      {...rest}
      map={map}
      zones={zones}
      markers={markers}
      className={stageClassName}
      worldClassName="visit-map-world"
      fitClassName="visit-map-fit-layer"
      imgClassName="visit-map-img"
      controlsClassName="fm-pct-map-controls"
      testIdPrefix="visit"
      locateLabel="Me situer"
      getIsSeen={getIsSeen}
      getDiscoverHalo={getDiscoverHalo}
      clusteringEnabled={!editMode}
      applyZoomOnlyCategories={false}
      splitNameEmoji={visitSplitNameEmoji}
      focusPlacePct={visitFocusPlacePct}
      overlaySlot={resolvedOverlay}
    />
  );
}
