/**
 * Aimant de contour (lot « ancrage magnétique ») de la carte de travail : réglages de
 * l'aimant (actif, rayon, sensibilité), analyse de l'image de fond à la demande (édition des
 * sommets seulement) et rayons convertis de l'écran en % d'image, constants au zoom.
 *
 * Extrait de `MapViewImpl` (`src/components/map-views.jsx`, étape B4 de l'audit du
 * 25/09/2026, § 3.3 ligne 5 — patron O6), sans changement de comportement.
 */
import { useState } from 'react';
import useMapImageEdgeSnap from '../../hooks/useMapImageEdgeSnap.js';
import { EDGE_SNAP_DEFAULTS } from '../../utils/edgeSnap.js';

export function useMapViewEdgeSnap({ mapImageSrc, mode, iw, inv }) {
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [snapRadiusPx, setSnapRadiusPx] = useState(EDGE_SNAP_DEFAULTS.radiusScreenPx);
  const [snapSensitivity, setSnapSensitivity] = useState(EDGE_SNAP_DEFAULTS.sensitivity);
  const edgeSnap = useMapImageEdgeSnap({
    src: mapImageSrc,
    active: snapEnabled && mode === 'edit-points',
  });
  // Rayons exprimés à l'écran → convertis en % d'image (constants visuellement au zoom).
  const hasWidth = iw > 0;
  const snapRadiusPct = hasWidth ? Math.max(0.05, ((snapRadiusPx * inv) / iw) * 100) : 1;
  const edgeTolerancePct = hasWidth ? Math.min(8, Math.max(0.3, ((28 * inv) / iw) * 100)) : 3;
  return {
    snapEnabled,
    setSnapEnabled,
    snapRadiusPx,
    setSnapRadiusPx,
    snapSensitivity,
    setSnapSensitivity,
    edgeSnap,
    snapRadiusPct,
    edgeTolerancePct,
  };
}
