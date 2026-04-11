import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { VISIT_MASCOT_STATE, resolveVisitMascotState } from '../utils/visitMascotState.js';
import {
  getVisitMascotCatalog,
  getVisitMascotById,
  getVisitMascotSupportedStates,
  loadVisitMascotId,
  saveVisitMascotId,
} from '../utils/visitMascotCatalog.js';

const VISIT_MASCOT_TRANSIENT_STATE_MS = 1500;

const VISIT_MASCOT_PREVIEW_STATE_META = {
  [VISIT_MASCOT_STATE.IDLE]: { label: 'Idle', icon: '🧍' },
  [VISIT_MASCOT_STATE.WALKING]: { label: 'Marche', icon: '🚶' },
  [VISIT_MASCOT_STATE.HAPPY]: { label: 'Heureuse', icon: '🎉' },
  [VISIT_MASCOT_STATE.TALK]: { label: 'Parle', icon: '💬' },
  [VISIT_MASCOT_STATE.ALERT]: { label: 'Alerte', icon: '⚠️' },
  [VISIT_MASCOT_STATE.ANGRY]: { label: 'Colère', icon: '😠' },
  [VISIT_MASCOT_STATE.SURPRISE]: { label: 'Surprise', icon: '😲' },
};

function useVisitMascotStateMachine({
  walking = false,
  happy = false,
  transientDurationMs = VISIT_MASCOT_TRANSIENT_STATE_MS,
} = {}) {
  const [visitMascotId, setVisitMascotId] = useState(() => loadVisitMascotId());
  const [visitMascotPreviewState, setVisitMascotPreviewState] = useState(VISIT_MASCOT_STATE.IDLE);
  const [visitMapMascotTransientState, setVisitMapMascotTransientState] = useState('');
  const visitMapMascotTransientStateTimeoutRef = useRef(null);

  const visitMascotOptions = useMemo(() => getVisitMascotCatalog(), []);

  const visitMascotPreviewStateOptions = useMemo(() => {
    const knownOrder = [
      VISIT_MASCOT_STATE.IDLE,
      VISIT_MASCOT_STATE.WALKING,
      VISIT_MASCOT_STATE.HAPPY,
      VISIT_MASCOT_STATE.TALK,
      VISIT_MASCOT_STATE.ALERT,
      VISIT_MASCOT_STATE.ANGRY,
      VISIT_MASCOT_STATE.SURPRISE,
    ];
    const supported = getVisitMascotSupportedStates(visitMascotId);
    const fromCatalog = getVisitMascotById(visitMascotId);
    const stateAnimations = fromCatalog?.rive?.stateAnimations || {};
    return knownOrder
      .filter((state) => supported.includes(state))
      .map((state) => ({
        state,
        icon: VISIT_MASCOT_PREVIEW_STATE_META[state]?.icon || '✨',
        label: VISIT_MASCOT_PREVIEW_STATE_META[state]?.label || state,
        aliases: stateAnimations[state] || [],
      }));
  }, [visitMascotId]);

  useEffect(() => {
    if (visitMascotPreviewStateOptions.some((entry) => entry.state === visitMascotPreviewState)) return;
    setVisitMascotPreviewState(VISIT_MASCOT_STATE.IDLE);
  }, [visitMascotPreviewStateOptions, visitMascotPreviewState]);

  const resetMascotTransientState = useCallback(() => {
    if (visitMapMascotTransientStateTimeoutRef.current) {
      clearTimeout(visitMapMascotTransientStateTimeoutRef.current);
      visitMapMascotTransientStateTimeoutRef.current = null;
    }
    setVisitMapMascotTransientState('');
  }, []);

  useEffect(() => () => {
    if (visitMapMascotTransientStateTimeoutRef.current) {
      clearTimeout(visitMapMascotTransientStateTimeoutRef.current);
    }
  }, []);

  const triggerMascotTransientState = useCallback((state, durationMs = transientDurationMs) => {
    const wanted = resolveVisitMascotState({ state });
    if (!wanted || wanted === VISIT_MASCOT_STATE.IDLE) return;
    if (visitMapMascotTransientStateTimeoutRef.current) {
      clearTimeout(visitMapMascotTransientStateTimeoutRef.current);
    }
    setVisitMapMascotTransientState(wanted);
    visitMapMascotTransientStateTimeoutRef.current = window.setTimeout(() => {
      setVisitMapMascotTransientState('');
      visitMapMascotTransientStateTimeoutRef.current = null;
    }, Math.max(300, Number(durationMs) || VISIT_MASCOT_TRANSIENT_STATE_MS));
  }, [transientDurationMs]);

  const visitMascotAnimationState = useMemo(
    () => resolveVisitMascotState({
      state: visitMapMascotTransientState,
      happy,
      walking,
    }),
    [visitMapMascotTransientState, happy, walking]
  );

  const onChangeVisitMascotId = useCallback((nextId) => {
    const normalized = saveVisitMascotId(nextId);
    setVisitMascotId(normalized);
  }, []);

  return {
    visitMascotId,
    visitMascotOptions,
    visitMascotPreviewState,
    visitMascotPreviewStateOptions,
    visitMascotAnimationState,
    onChangeVisitMascotId,
    setVisitMascotPreviewState,
    triggerMascotTransientState,
    resetMascotTransientState,
  };
}

export default useVisitMascotStateMachine;
