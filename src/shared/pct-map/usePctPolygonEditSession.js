import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clonePctPoints,
  normalizePctPoints,
  pctPointsEqual,
} from './pctPolygon.js';

const HISTORY_MAX = 30;

/**
 * Session locale d’édition de contour (comme « Modifier le contour » sur la carte tâches).
 * Les points ne sont persistés qu’au `save()` ; `discard()` annule toute la session.
 */
export function usePctPolygonEditSession({ onSave } = {}) {
  const [active, setActive] = useState(false);
  const [points, setPoints] = useState([]);
  const [canUndo, setCanUndo] = useState(false);
  const historyRef = useRef([]);
  const pointsRef = useRef(points);
  pointsRef.current = points;

  const syncUndoFlag = useCallback(() => {
    setCanUndo(historyRef.current.length > 1);
  }, []);

  const recordHistory = useCallback(() => {
    const cur = normalizePctPoints(clonePctPoints(pointsRef.current));
    const h = historyRef.current;
    const last = h[h.length - 1];
    if (last && pctPointsEqual(last, cur)) return;
    h.push(cur);
    while (h.length > HISTORY_MAX) h.shift();
    syncUndoFlag();
  }, [syncUndoFlag]);

  const scheduleRecordHistory = useCallback(() => {
    if (typeof window === 'undefined') {
      recordHistory();
      return;
    }
    window.setTimeout(() => { recordHistory(); }, 0);
  }, [recordHistory]);

  const start = useCallback((initialPoints) => {
    const clamped = normalizePctPoints(initialPoints);
    historyRef.current = [clonePctPoints(clamped)];
    setPoints(clamped);
    setCanUndo(false);
    setActive(true);
  }, []);

  const discard = useCallback(() => {
    setActive(false);
    setPoints([]);
    historyRef.current = [];
    setCanUndo(false);
  }, []);

  const undo = useCallback(() => {
    const h = historyRef.current;
    if (h.length <= 1) return;
    h.pop();
    const prev = clonePctPoints(h[h.length - 1]);
    setPoints(prev);
    syncUndoFlag();
  }, [syncUndoFlag]);

  const save = useCallback(async () => {
    if (!active) return false;
    const snapshot = normalizePctPoints(clonePctPoints(pointsRef.current));
    if (typeof onSave === 'function') {
      await onSave(snapshot);
    }
    discard();
    return true;
  }, [active, onSave, discard]);

  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || e.shiftKey) return;
      const t = e.target;
      if (t?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      undo();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [active, undo]);

  return {
    active,
    points,
    setPoints,
    pointsRef,
    canUndo,
    start,
    discard,
    save,
    undo,
    recordHistory,
    scheduleRecordHistory,
  };
}
