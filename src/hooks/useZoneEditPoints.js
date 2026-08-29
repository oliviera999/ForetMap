import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/api';
import {
  canRemoveEditPoints,
  clampEditZonePct,
  clampEditPts,
  cloneEditPts,
  editPtsSnapshotEqual,
  findEditEdgeInsertion,
  insertEditPointAt,
  moveEditPointsBy,
  normalizeEditSelection,
  removeEditPointsAt,
  shiftSelectionAfterRemove,
  snapEditPointOrthogonal,
} from '../utils/zoneEditGeometry.js';

/** Profondeur maximale de l'historique d'édition de contour (annulations Ctrl+Z). */
const EDIT_POINTS_HISTORY_MAX = 30;

/** Déplacement (en % d'image) au-delà duquel un appui est un glissement, pas un clic. */
const CLICK_SLOP_PCT = 0.4;

const EMPTY_SELECTION = new Set();

/**
 * Édition du contour d'une zone (mode `edit-points`) — extrait de `MapView`.
 * Porte l'état de session (zone en cours, sommets, sommet glissé), l'historique
 * d'annulation (Ctrl/Cmd+Z), la translation du polygone entier et la sauvegarde.
 *
 * Depuis les lots « édition avancée » : ajout/suppression de sommets, sélection
 * multiple (Maj+clic, déplacement et suppression groupés) et ancrage
 * magnétique des sommets sur les contours de l'image de fond.
 *
 * @param {object} params
 * @param {string} params.mode mode carte courant (l'édition n'est active qu'en `edit-points`)
 * @param {(mode: string) => void} params.setMode change le mode carte
 * @param {(clientX: number, clientY: number) => ({xp:number,yp:number}|null)} params.toImagePct
 *   conversion pointeur → % image (fournie par useMapGestures, stable)
 * @param {() => Promise<*>} params.onRefresh recharge les données après sauvegarde
 * @param {(msg: string) => void} params.setToast affiche un toast de confirmation
 * @param {(point: {xp:number,yp:number}, opts?: object) => ({xp:number,yp:number}|null)} [params.snapPoint]
 *   ancrage magnétique (aimant de contour) ; renvoie `null` si aucun contour proche
 * @param {number} [params.snapRadiusPct] rayon d'accroche de l'aimant, en % de largeur d'image
 * @param {number} [params.snapMinStrength] contraste minimal exigé par l'aimant (sensibilité)
 * @param {number} [params.edgeTolerancePct] distance max. à une arête pour y insérer un sommet
 * @param {number} [params.mapScaleInv] inverse de l'échelle carte (nudge clavier scale-aware)
 * @param {number} [params.mapImgW] largeur naturelle du plan (px)
 * @param {number} [params.mapImgH] hauteur naturelle du plan (px)
 * @param {(dxPx: number, dyPx: number) => void} [params.onKeyboardPan] pan clavier quand rien n'est sélectionné
 * @param {(clientX: number, clientY: number) => void} [params.onBackgroundPanStart]
 * @param {(clientX: number, clientY: number) => void} [params.onBackgroundPanMove]
 * @param {() => void} [params.onBackgroundPanEnd]
 */
function useZoneEditPoints({
  mode,
  setMode,
  toImagePct,
  onRefresh,
  setToast,
  snapPoint,
  snapRadiusPct = 1,
  snapMinStrength,
  edgeTolerancePct = 3,
  mapScaleInv = 1,
  mapImgW = 1,
  mapImgH = 1,
  onKeyboardPan,
  onBackgroundPanStart,
  onBackgroundPanMove,
  onBackgroundPanEnd,
}) {
  const [editZone, setEditZone] = useState(null);
  const [editPoints, setEditPoints] = useState([]);
  const [draggingPtIdx, setDraggingPtIdx] = useState(-1);
  const [editCanUndo, setEditCanUndo] = useState(false);
  const [selectedPtIdxs, setSelectedPtIdxs] = useState(EMPTY_SELECTION);
  const [insertVertexMode, setInsertVertexMode] = useState(false);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const editZoneTranslateLastRef = useRef(null);
  const editPointsHistoryRef = useRef([]);
  const editPointsRef = useRef([]);
  const selectedPtIdxsRef = useRef(EMPTY_SELECTION);
  const groupDragLastRef = useRef(null);
  const pointerDownInfoRef = useRef(null);
  const bgPointerRef = useRef(null);
  // Réglages de l'aimant lus au moment du geste : évite de recréer les handlers
  // (et donc de re-rendre le calque SVG mémoïsé) à chaque changement de zoom.
  const snapRef = useRef({
    snapPoint: null,
    snapRadiusPct: 1,
    snapMinStrength: undefined,
    edgeTolerancePct: 3,
  });
  snapRef.current = { snapPoint, snapRadiusPct, snapMinStrength, edgeTolerancePct };

  useEffect(() => {
    if (mode !== 'edit-points') {
      editZoneTranslateLastRef.current = null;
      groupDragLastRef.current = null;
      bgPointerRef.current = null;
      setInsertVertexMode(false);
      setMultiSelectMode(false);
    }
  }, [mode]);

  useEffect(() => {
    editPointsRef.current = editPoints;
  }, [editPoints]);

  useEffect(() => {
    selectedPtIdxsRef.current = selectedPtIdxs;
  }, [selectedPtIdxs]);

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
    // La sélection peut viser des sommets qui n'existent plus après annulation.
    setSelectedPtIdxs((cur) => {
      const kept = normalizeEditSelection([...cur], prev.length);
      return kept.length === cur.size ? cur : new Set(kept);
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedPtIdxs((cur) => (cur.size ? EMPTY_SELECTION : cur));
  }, []);

  const selectAllPoints = useCallback(() => {
    setSelectedPtIdxs(new Set(editPointsRef.current.map((_p, i) => i)));
  }, []);

  const toggleInsertVertexMode = useCallback(() => {
    setInsertVertexMode((v) => !v);
  }, []);

  const toggleMultiSelectMode = useCallback(() => {
    setMultiSelectMode((v) => !v);
  }, []);

  // ——— Ajout / suppression de sommets ———

  /** Insère un sommet à l'index donné, le sélectionne et enregistre l'historique. */
  const insertPointAtIndex = useCallback(
    (index, point) => {
      const pts = editPointsRef.current;
      const next = insertEditPointAt(pts, index, point);
      editPointsRef.current = next;
      setEditPoints(next);
      // Le sommet créé devient la seule sélection : un glissement immédiat ne doit
      // pas entraîner les sommets sélectionnés avant l'insertion.
      setSelectedPtIdxs(new Set([index]));
      scheduleRecordEditHistory();
      return index;
    },
    [scheduleRecordEditHistory],
  );

  /**
   * Insère un sommet sur l'arête la plus proche d'un point cliqué.
   * @returns {number} index du sommet créé, ou -1 si le clic est trop loin du contour
   */
  const insertPointFromPct = useCallback(
    (pct, options = {}) => {
      const pts = editPointsRef.current;
      if (!pct || pts.length < 2) return -1;
      const tolerance = options.tolerancePct ?? snapRef.current.edgeTolerancePct;
      const hit = findEditEdgeInsertion(pts, pct, tolerance);
      if (!hit) return -1;
      return insertPointAtIndex(hit.index, hit.point);
    },
    [insertPointAtIndex],
  );

  /** Insère un sommet au milieu d'une arête (poignée « fantôme »). */
  const insertPointAtMidpoint = useCallback(
    (index, point) => {
      if (!point) return -1;
      return insertPointAtIndex(index, clampEditZonePct(point));
    },
    [insertPointAtIndex],
  );

  const canRemoveSelection = useMemo(
    () => canRemoveEditPoints(editPoints, [...selectedPtIdxs]),
    [editPoints, selectedPtIdxs],
  );

  const removeSelectedPoints = useCallback(() => {
    const pts = editPointsRef.current;
    const targets = [...selectedPtIdxsRef.current];
    if (!canRemoveEditPoints(pts, targets)) return false;
    const next = removeEditPointsAt(pts, targets);
    editPointsRef.current = next;
    setEditPoints(next);
    setSelectedPtIdxs((cur) => shiftSelectionAfterRemove(cur, targets));
    scheduleRecordEditHistory();
    return true;
  }, [scheduleRecordEditHistory]);

  /** Colle les sommets sélectionnés (ou tous) sur les contours de l'image de fond. */
  const snapSelectedPoints = useCallback(() => {
    const {
      snapPoint: snap,
      snapRadiusPct: radiusPct,
      snapMinStrength: minStrength,
    } = snapRef.current;
    if (typeof snap !== 'function') return 0;
    const pts = editPointsRef.current;
    const targets = selectedPtIdxsRef.current.size
      ? new Set(normalizeEditSelection([...selectedPtIdxsRef.current], pts.length))
      : new Set(pts.map((_p, i) => i));
    let moved = 0;
    const n = pts.length;
    const next = pts.map((p, i) => {
      if (!targets.has(i)) return p;
      const prev = pts[(i - 1 + n) % n];
      const neighborNext = pts[(i + 1) % n];
      const hit = snapEditPointOrthogonal(p, prev, neighborNext, radiusPct, snap, {
        radiusPct,
        minStrength,
      });
      if (hit.xp === p.xp && hit.yp === p.yp) return p;
      moved += 1;
      return clampEditZonePct(hit);
    });
    if (!moved) return 0;
    editPointsRef.current = next;
    setEditPoints(next);
    scheduleRecordEditHistory();
    return moved;
  }, [scheduleRecordEditHistory]);

  // ——— Raccourcis clavier (hors champs de saisie) ———

  const ARROW_KEY_DELTA = useMemo(
    () => ({
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    }),
    [],
  );

  useEffect(() => {
    if (mode !== 'edit-points') return undefined;
    const onKey = (e) => {
      const t = e.target;
      if (t?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      const key = e.key;
      const arrowDir = ARROW_KEY_DELTA[key];
      if (arrowDir) {
        e.preventDefault();
        const stepPx = e.shiftKey ? 10 : 1;
        const [ax, ay] = arrowDir;
        if (selectedPtIdxsRef.current.size > 0) {
          const inv = mapScaleInv || 1;
          const iw = mapImgW || 1;
          const ih = mapImgH || 1;
          const dxPct = ((stepPx * ax * inv) / iw) * 100;
          const dyPct = ((stepPx * ay * inv) / ih) * 100;
          const pts = editPointsRef.current;
          const selection = [...selectedPtIdxsRef.current];
          const moved = moveEditPointsBy(pts, selection, dxPct, dyPct);
          if (!editPtsSnapshotEqual(pts, moved)) {
            editPointsRef.current = moved;
            setEditPoints(moved);
            scheduleRecordEditHistory();
          }
        } else {
          onKeyboardPan?.(stepPx * ax, stepPx * ay);
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undoEditPoints();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && key.toLowerCase() === 'a') {
        e.preventDefault();
        selectAllPoints();
        return;
      }
      if (key === 'Delete' || key === 'Backspace') {
        if (!selectedPtIdxsRef.current.size) return;
        e.preventDefault();
        const done = removeSelectedPoints();
        if (!done) setToast?.('Un contour garde au moins 3 sommets');
        return;
      }
      if (key === 'Escape') {
        if (insertVertexMode || multiSelectMode) {
          e.preventDefault();
          setInsertVertexMode(false);
          setMultiSelectMode(false);
          return;
        }
        if (selectedPtIdxsRef.current.size) {
          e.preventDefault();
          clearSelection();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [
    mode,
    ARROW_KEY_DELTA,
    mapScaleInv,
    mapImgW,
    mapImgH,
    onKeyboardPan,
    undoEditPoints,
    selectAllPoints,
    removeSelectedPoints,
    clearSelection,
    insertVertexMode,
    multiSelectMode,
    scheduleRecordEditHistory,
    setToast,
  ]);

  const discardEditPointsSession = useCallback(() => {
    setEditZone(null);
    setEditPoints([]);
    editPointsHistoryRef.current = [];
    setEditCanUndo(false);
    editZoneTranslateLastRef.current = null;
    groupDragLastRef.current = null;
    bgPointerRef.current = null;
    setSelectedPtIdxs(EMPTY_SELECTION);
    setInsertVertexMode(false);
    setMultiSelectMode(false);
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
      setSelectedPtIdxs(EMPTY_SELECTION);
      setInsertVertexMode(false);
      setMultiSelectMode(false);
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

  // ——— Glissement d'un sommet (seul ou en groupe) ———

  const onEditPointPointerDown = useCallback(
    (i, e) => {
      e.stopPropagation();
      const additive = e.shiftKey || e.ctrlKey || e.metaKey || multiSelectMode;
      const wasSelected = selectedPtIdxsRef.current.has(i);
      pointerDownInfoRef.current = {
        idx: i,
        additive,
        wasSelected,
        moved: false,
        start: toImagePct(e.clientX, e.clientY),
      };
      setSelectedPtIdxs((cur) => {
        if (additive) {
          if (cur.has(i)) return cur; // le retrait éventuel se joue au relâchement
          const next = new Set(cur);
          next.add(i);
          return next;
        }
        if (cur.has(i) && cur.size > 1) return cur; // conserve le groupe pour le déplacer
        return new Set([i]);
      });
      groupDragLastRef.current = toImagePct(e.clientX, e.clientY);
      setDraggingPtIdx(i);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch (_e) {}
    },
    [multiSelectMode, toImagePct],
  );

  const onEditPointPointerMove = useCallback(
    (i, e) => {
      if (draggingPtIdx !== i) return;
      const p2 = toImagePct(e.clientX, e.clientY);
      if (!p2) return;
      const info = pointerDownInfoRef.current;
      if (info && !info.moved && info.start) {
        const dxAbs = Math.abs(p2.xp - info.start.xp);
        const dyAbs = Math.abs(p2.yp - info.start.yp);
        if (dxAbs > CLICK_SLOP_PCT || dyAbs > CLICK_SLOP_PCT) info.moved = true;
      }
      const selection = selectedPtIdxsRef.current;
      const groupDrag = selection.size > 1 && selection.has(i);
      if (groupDrag) {
        const last = groupDragLastRef.current || p2;
        const dx = p2.xp - last.xp;
        const dy = p2.yp - last.yp;
        groupDragLastRef.current = p2;
        if (dx === 0 && dy === 0) return;
        setEditPoints((pts) => moveEditPointsBy(pts, [...selection], dx, dy));
        return;
      }
      groupDragLastRef.current = p2;
      const {
        snapPoint: snap,
        snapRadiusPct: radiusPct,
        snapMinStrength: minStrength,
      } = snapRef.current;
      const pts = editPointsRef.current;
      const n = pts.length;
      const prev = pts[(i - 1 + n) % n];
      const next = pts[(i + 1) % n];
      const target =
        typeof snap === 'function'
          ? snapEditPointOrthogonal(p2, prev, next, radiusPct, snap, { radiusPct, minStrength })
          : p2;
      setEditPoints((cur) => cur.map((pt, j) => (j === i ? clampEditZonePct(target) : pt)));
    },
    [draggingPtIdx, toImagePct],
  );

  const onEditPointPointerUp = useCallback(
    (e) => {
      e.stopPropagation();
      const info = pointerDownInfoRef.current;
      pointerDownInfoRef.current = null;
      groupDragLastRef.current = null;
      // Second appui sur un sommet déjà sélectionné, sans glissement → on le retire.
      if (info && !info.moved && info.additive && info.wasSelected) {
        setSelectedPtIdxs((cur) => {
          if (!cur.has(info.idx)) return cur;
          const next = new Set(cur);
          next.delete(info.idx);
          return next;
        });
      } else if (info && !info.moved && !info.additive) {
        setSelectedPtIdxs((cur) =>
          cur.size === 1 && cur.has(info.idx) ? cur : new Set([info.idx]),
        );
      }
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

  // ——— Pan sur le fond (glisser pour déplacer la vue ; clic simple = désélection) ———

  const onBackgroundPointerDown = useCallback(
    (e) => {
      if (bgPointerRef.current && bgPointerRef.current.pointerId !== e.pointerId) {
        bgPointerRef.current = null;
        onBackgroundPanEnd?.();
        return;
      }
      if (e.isPrimary === false) return;
      e.stopPropagation();
      bgPointerRef.current = { moved: false, pointerId: e.pointerId };
      onBackgroundPanStart?.(e.clientX, e.clientY);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch (_e) {}
    },
    [onBackgroundPanStart, onBackgroundPanEnd],
  );

  const onBackgroundPointerMove = useCallback(
    (e) => {
      const state = bgPointerRef.current;
      if (!state || state.pointerId !== e.pointerId) return;
      state.moved = true;
      onBackgroundPanMove?.(e.clientX, e.clientY);
      e.preventDefault();
    },
    [onBackgroundPanMove],
  );

  const onBackgroundPointerUp = useCallback(
    (e) => {
      const state = bgPointerRef.current;
      if (state && state.pointerId !== e.pointerId) return;
      bgPointerRef.current = null;
      if (e?.currentTarget?.hasPointerCapture?.(e.pointerId)) {
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch (_e) {}
      }
      if (!state) return;
      if (!state.moved && !(e.shiftKey || multiSelectMode)) {
        clearSelection();
      }
      onBackgroundPanEnd?.();
    },
    [clearSelection, multiSelectMode, onBackgroundPanEnd],
  );

  const onBackgroundLostPointerCapture = useCallback(() => {
    bgPointerRef.current = null;
    onBackgroundPanEnd?.();
  }, [onBackgroundPanEnd]);

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
    // Lot « ajout / suppression de sommets »
    insertVertexMode,
    toggleInsertVertexMode,
    insertPointFromPct,
    insertPointAtMidpoint,
    removeSelectedPoints,
    canRemoveSelection,
    // Lot « sélection multiple »
    selectedPtIdxs,
    multiSelectMode,
    toggleMultiSelectMode,
    clearSelection,
    selectAllPoints,
    onBackgroundPointerDown,
    onBackgroundPointerMove,
    onBackgroundPointerUp,
    onBackgroundLostPointerCapture,
    // Lot « aimant de contour »
    snapSelectedPoints,
  };
}

export default useZoneEditPoints;
