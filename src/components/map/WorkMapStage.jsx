import { detectLeadingMarkerEmoji, stripLeadingMarkerEmoji } from '../../constants/emojis.js';
import { SharedMapStage } from '../../shared/pct-map/SharedMapStage.jsx';
import { parsePctPolygonPoints } from '../../shared/pct-map/pctPolygon.js';
import { polygonPoleOfInaccessibilityPct } from '../../shared/pct-map/pctPolylabel.js';

/**
 * Sépare l'emoji en tête du nom (catalogue marqueurs + repli grapheme).
 * @param {string} rawName
 * @returns {{ emoji: string, name: string }}
 */
function workSplitNameEmoji(rawName) {
  return {
    emoji: detectLeadingMarkerEmoji(rawName) || '',
    name: stripLeadingMarkerEmoji(rawName),
  };
}

/**
 * Point de centrage carte de travail : repère en % image, ou pôle d'inaccessibilité du polygone.
 * @param {object} place
 * @returns {{ xp: number, yp: number }|null}
 */
function workFocusPlacePct(place) {
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
 * Scène carte de travail (consultation) : enveloppe de `SharedMapStage` avec classes CSS
 * ForetMap, clustering désactivé hors navigation, catégories « zoom only » si catalogue fourni.
 *
 * Les modes tracé / édition de sommets / alignement restent hors de cette enveloppe
 * (`DrawingLayer`, `EditPointsLayer`, `ZonePolygonsLayer` dans `map-views.jsx`).
 *
 * @param {object} props
 * @param {boolean} [props.editMode] si vrai, pas de regroupement des repères
 * @param {boolean} [props.clusteringEnabled] surcharge du clustering (ex. bascule barre d'outils)
 * @param {Map|null} [props.categoriesById] active `applyZoomOnlyCategories` si non vide
 * @param {import('react').ReactNode} [props.overlaySlot] calques produit (mascotte, badges…)
 * @param {import('react').ReactNode} [props.children] alias d'`overlaySlot`
 */
export function WorkMapStage({
  editMode = false,
  clusteringEnabled,
  categoriesById = null,
  overlaySlot = null,
  children = null,
  ...rest
}) {
  const hasCategories = categoriesById instanceof Map && categoriesById.size > 0;
  const resolvedClustering = typeof clusteringEnabled === 'boolean' ? clusteringEnabled : !editMode;
  const resolvedOverlay = overlaySlot ?? children ?? null;

  return (
    <SharedMapStage
      {...rest}
      categoriesById={categoriesById}
      className="map-view-stage"
      worldClassName="map-view-world"
      fitClassName="map-view-fit-layer"
      imgClassName="map-view-img"
      controlsClassName="fm-pct-map-controls"
      testIdPrefix="map"
      locateLabel="Me suivre"
      clusteringEnabled={resolvedClustering}
      applyZoomOnlyCategories={hasCategories}
      splitNameEmoji={workSplitNameEmoji}
      focusPlacePct={workFocusPlacePct}
      overlaySlot={resolvedOverlay}
    />
  );
}
