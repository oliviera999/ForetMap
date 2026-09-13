import { useCallback, useState } from 'react';
import {
  NEIGHBOR_SNAP_DEFAULT_RADIUS_PCT,
  applyNeighborSnap,
  sharedEdgeFillBetween,
} from '../utils/zoneNeighborSnap.js';

/**
 * Tracé d'une nouvelle zone sur la carte (mode `draw-zone`) — extrait de `MapView`.
 * Porte l'état des points cliqués et les actions de la barre d'outils
 * (terminer / annuler dernier point / abandonner).
 *
 * Avec « Voisins » actif : chaque clic s'accroche au contour proche ; si deux points
 * successifs touchent le même voisin, les sommets du meilleur côté partagé sont
 * insérés automatiquement.
 *
 * @param {object} params
 * @param {(mode: string) => void} params.setMode change le mode carte (retour à `view`)
 * @param {(points: Array<{xp:number,yp:number}>) => void} params.setPendingZone ouvre la modale
 *   de création avec le contour terminé (≥ 3 points)
 * @param {boolean} [params.neighborSnapEnabled]
 * @param {Array<{ id: string, points: Array<{xp:number,yp:number}> }>} [params.neighborZones]
 * @param {number} [params.neighborSnapRadiusPct]
 */
function useZoneDrawing({
  setMode,
  setPendingZone,
  neighborSnapEnabled = false,
  neighborZones = [],
  neighborSnapRadiusPct = NEIGHBOR_SNAP_DEFAULT_RADIUS_PCT,
}) {
  const [drawPoints, setDrawPoints] = useState([]);

  const addDrawPoint = useCallback(
    (p) => {
      setDrawPoints((pts) => {
        const snapped = applyNeighborSnap(
          p,
          neighborZones,
          neighborSnapRadiusPct,
          neighborSnapEnabled,
        );
        if (!neighborSnapEnabled || !pts.length) {
          return [...pts, snapped];
        }
        const fill = sharedEdgeFillBetween(
          pts[pts.length - 1],
          snapped,
          neighborZones,
          neighborSnapRadiusPct,
        );
        if (fill?.points?.length) {
          return [...pts, ...fill.points, snapped];
        }
        return [...pts, snapped];
      });
    },
    [neighborSnapEnabled, neighborZones, neighborSnapRadiusPct],
  );

  const resetDrawPoints = useCallback(() => {
    setDrawPoints([]);
  }, []);

  const finishZone = useCallback(() => {
    if (drawPoints.length >= 3) {
      setPendingZone(drawPoints);
      setDrawPoints([]);
      setMode('view');
    }
  }, [drawPoints, setMode, setPendingZone]);

  const undoPoint = useCallback(() => {
    setDrawPoints((pts) => pts.slice(0, -1));
  }, []);

  const cancelDraw = useCallback(() => {
    setDrawPoints([]);
    setMode('view');
  }, [setMode]);

  return { drawPoints, addDrawPoint, resetDrawPoints, finishZone, undoPoint, cancelDraw };
}

export default useZoneDrawing;
