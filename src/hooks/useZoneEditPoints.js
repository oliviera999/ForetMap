import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import {
  clampEditZonePct,
  clampEditPts,
  cloneEditPts,
  editPtsSnapshotEqual,
} from '../utils/zoneEditGeometry.js';

/** Profondeur maximale de l'historique d'édition de contour (annulations Ctrl+Z). */
const EDIT_POINTS_HISTORY_MAX = 30;

/**
 * Édition du contour d'une zone (mode `edit-points`) — extrait de `MapView`.
 * Porte l'état de session (zone en cours, sommets, sommet glissé), l'historique
 * d'annulation (Ctrl/Cmd+Z), la translation du polygone entier et la sauvegarde.
 * Comportement strictement inchangé.
 *
 * @param {object} params
 * @param {string} params.mode mode carte courant (l'édition n'est active qu'en `edit-points`)
 * @param {(mode: string) => void} params.setMode change le mode carte
 * @param {(clientX: number, clientY: number) => ({xp:number,yp:number}|null)} params.toImagePct
 *   conversion pointeur → % image (fournie par useMapGestures, stable)
 * @param {() => Promise<*>} params.onRefresh recharge les données après sauvegarde
 * @param {(msg: string) => void} params.setToast affiche un toast de confirmation
 */
function useZoneEditPoints({ mode, setMode, toImagePct, onRefresh, setToast }) {
  const [editZone, setEditZone] = useState(null);
  const [editPoints, setEditPoints] = useState([]);
  const [draggingPtIdx, setDraggingPtIdx] = useState(-1);
  const [editCanUndo, setEditCanUndo] = useState(false);
  const editZoneTranslateLastRef = useRef(null);
  const editPointsHistoryRef = useRef([]);
  const editPointsRef = useRef([]);

  useEffect(() => {
    if (mode !== 'edit-points') editZoneTranslateLastRef.current = null;
  }, [mode]);

  useEffect(() => {
    editPointsRef.current = editPoints;
  }, [editPoints]);

  const recordEditHistoryAfterGesture = useCallback(() => {
    if (mode !== 'edit-points') return;
    const cur = clampEditPts(cloneEditPts(editPointsRef.current));
    const h = editPointsHistoryRef.current;
    const last = h[h.length - 1];
    if (last && editPtsSnapshotEqual(last, cur)) return;
    h.push(cur);
    while (h.length > EDIT_POINTS_HISTORY_MAX) h.shift();
    setEditCanUndo(h.length > 1);
  }, [mode]);

  /** Enregistre l'état après le geste (setTimeout 0 : laisse le dernier setEditPoints aboutir). */
  const scheduleRecordEditHistory = useCallback(() => {
    window.setTimeout(() => {
      recordEditHistoryAfterGesture();
    }, 0);
  }, [recordEditHistoryAfterGesture]);

  const undoEditPoints = useCallback(() => {
    const h = editPointsHistoryRef.current;
    if (h.length <= 1) return;
    h.pop();
    const prev = h[h.length - 1];
    setEditPoints(cloneEditPts(prev));
    setEditCanUndo(h.length > 1);
  }, []);

  // Ctrl/Cmd+Z pendant l'édition de contour (hors champs de saisie).
  useEffect(() => {
    if (mode !== 'edit-points') return undefined;
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || e.shiftKey) return;
      const t = e.target;
      if (t.closest && t.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      undoEditPoints();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [mode, undoEditPoints]);

  const discardEditPointsSession = useCallback(() => {
    setEditZone(null);
    setEditPoints([]);
    editPointsHistoryRef.current = [];
    setEditCanUndo(false);
    editZoneTranslateLastRef.current = null;
  }, []);

  const startEditPoints = useCallback(
    (z) => {
      let pts;
      try {
        pts = z.points ? JSON.parse(z.points) : [];
      } catch (_e) {
        pts = [];
      }
      const clamped = clampEditPts(pts);
      editPointsHistoryRef.current = [cloneEditPts(clamped)];
      setEditCanUndo(false);
      setEditZone(z);
      setEditPoints(clamped);
      setMode('edit-points');
    },
    [setMode],
  );

  const saveEditPoints = useCallback(async () => {
    if (!editZone) return;
    await api(`/api/zones/${editZone.id}`, 'PUT', { points: editPoints });
    await onRefresh();
    discardEditPointsSession();
    setMode('view');
    setToast('Contour sauvegardé ✓');
  }, [editZone, editPoints, onRefresh, discardEditPointsSession, setMode, setToast]);

  // ——— Translation du polygone entier (glisser la surface) ———

  const onTranslatePointerDown = useCallback(
    (e) => {
      e.stopPropagation();
      const p0 = toImagePct(e.clientX, e.clientY);
      if (!p0) return;
      editZoneTranslateLastRef.current = p0;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch (_e) {}
    },
    [toImagePct],
  );

  const onTranslatePointerMove = useCallback(
    (e) => {
      const last = editZoneTranslateLastRef.current;
      if (!last) return;
      const p2 = toImagePct(e.clientX, e.clientY);
      if (!p2) return;
      const dx = p2.xp - last.xp;
      const dy = p2.yp - last.yp;
      editZoneTranslateLastRef.current = p2;
      setEditPoints((pts) => clampEditPts(pts.map((pt) => ({ xp: pt.xp + dx, yp: pt.yp + dy }))));
      e.preventDefault();
    },
    [toImagePct],
  );

  const endEditZoneTranslate = useCallback(
    (e) => {
      scheduleRecordEditHistory();
      editZoneTranslateLastRef.current = null;
      if (e?.currentTarget?.hasPointerCapture?.(e.pointerId)) {
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch (_e) {}
      }
    },
    [scheduleRecordEditHistory],
  );

  const onTranslateLostPointerCapture = useCallback(() => {
    editZoneTranslateLastRef.current = null;
  }, []);

  // ——— Glissement d'un sommet ———

  const onEditPointPointerDown = useCallback((i, e) => {
    e.stopPropagation();
    setDraggingPtIdx(i);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_e) {}
  }, []);

  const onEditPointPointerMove = useCallback(
    (i, e) => {
      if (draggingPtIdx === i) {
        const p2 = toImagePct(e.clientX, e.clientY);
        if (p2) setEditPoints((pts) => pts.map((pt, j) => (j === i ? clampEditZonePct(p2) : pt)));
      }
    },
    [draggingPtIdx, toImagePct],
  );

  const onEditPointPointerUp = useCallback(
    (e) => {
      e.stopPropagation();
      scheduleRecordEditHistory();
      setDraggingPtIdx(-1);
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch (_e) {}
      }
    },
    [scheduleRecordEditHistory],
  );

  return {
    editZone,
    editPoints,
    draggingPtIdx,
    editCanUndo,
    undoEditPoints,
    startEditPoints,
    saveEditPoints,
    discardEditPointsSession,
    onTranslatePointerDown,
    onTranslatePointerMove,
    endEditZoneTranslate,
    onTranslateLostPointerCapture,
    onEditPointPointerDown,
    onEditPointPointerMove,
    onEditPointPointerUp,
  };
}

export default useZoneEditPoints;
