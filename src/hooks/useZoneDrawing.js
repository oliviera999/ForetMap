import { useCallback, useState } from 'react';

/**
 * Tracé d'une nouvelle zone sur la carte (mode `draw-zone`) — extrait de `MapView`.
 * Porte l'état des points cliqués et les actions de la barre d'outils
 * (terminer / annuler dernier point / abandonner). Comportement strictement inchangé.
 *
 * @param {object} params
 * @param {(mode: string) => void} params.setMode change le mode carte (retour à `view`)
 * @param {(points: Array<{xp:number,yp:number}>) => void} params.setPendingZone ouvre la modale
 *   de création avec le contour terminé (≥ 3 points)
 * @returns {{
 *   drawPoints: Array<{xp:number,yp:number}>,
 *   addDrawPoint: (p: {xp:number,yp:number}) => void,
 *   resetDrawPoints: () => void,
 *   finishZone: () => void,
 *   undoPoint: () => void,
 *   cancelDraw: () => void,
 * }}
 */
function useZoneDrawing({ setMode, setPendingZone }) {
  const [drawPoints, setDrawPoints] = useState([]);

  const addDrawPoint = useCallback((p) => {
    setDrawPoints((pts) => [...pts, p]);
  }, []);

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
