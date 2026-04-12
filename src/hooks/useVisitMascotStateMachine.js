import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { VISIT_MASCOT_STATE, resolveVisitMascotState } from '../utils/visitMascotState.js';
import {
  VISIT_MASCOT_STORAGE_KEY,
  getVisitMascotCatalog,
  resolveVisitMascotEntry,
  getVisitMascotSupportedStates,
  normalizeVisitMascotId,
  loadVisitMascotId,
  saveVisitMascotId,
} from '../utils/visitMascotCatalog.js';

const VISIT_MASCOT_TRANSIENT_STATE_MS = 1500;

const VISIT_MASCOT_PREVIEW_STATE_META = {
  [VISIT_MASCOT_STATE.IDLE]: { label: 'Idle', icon: '🧍' },
  [VISIT_MASCOT_STATE.WALKING]: { label: 'Marche', icon: '🚶' },
  [VISIT_MASCOT_STATE.RUNNING]: { label: 'Course', icon: '🏃' },
  [VISIT_MASCOT_STATE.HAPPY]: { label: 'Heureuse', icon: '🎉' },
  [VISIT_MASCOT_STATE.HAPPY_JUMP]: { label: 'Saut joyeux', icon: '🤸' },
  [VISIT_MASCOT_STATE.SPIN]: { label: 'Rotation', icon: '🌀' },
  [VISIT_MASCOT_STATE.INSPECT]: { label: 'Inspecte', icon: '🔎' },
  [VISIT_MASCOT_STATE.MAP_READ]: { label: 'Lit la carte', icon: '🗺️' },
  [VISIT_MASCOT_STATE.CELEBRATE]: { label: 'Célèbre', icon: '✨' },
  [VISIT_MASCOT_STATE.TALK]: { label: 'Parle', icon: '💬' },
  [VISIT_MASCOT_STATE.ALERT]: { label: 'Alerte', icon: '⚠️' },
  [VISIT_MASCOT_STATE.ANGRY]: { label: 'Colère', icon: '😠' },
  [VISIT_MASCOT_STATE.SURPRISE]: { label: 'Surprise', icon: '😲' },
};

function useVisitMascotStateMachine({
  walking = false,
  happy = false,
  transientDurationMs = VISIT_MASCOT_TRANSIENT_STATE_MS,
  extraCatalogEntries = [],
} = {}) {
  const [visitMascotId, setVisitMascotId] = useState(() => loadVisitMascotId());
  const [visitMascotPreviewState, setVisitMascotPreviewState] = useState(VISIT_MASCOT_STATE.IDLE);
  const [visitMapMascotTransientState, setVisitMapMascotTransientState] = useState('');
  const visitMapMascotTransientStateTimeoutRef = useRef(null);

  const visitMascotOptions = useMemo(
    () => [...getVisitMascotCatalog(), ...extraCatalogEntries],
    [extraCatalogEntries],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(VISIT_MASCOT_STORAGE_KEY);
    const normalized = normalizeVisitMascotId(raw, extraCatalogEntries);
    setVisitMascotId((prev) => (prev === normalized ? prev : normalized));
  }, [extraCatalogEntries]);

  const visitMascotPreviewStateOptions = useMemo(() => {
    const knownOrder = [
      VISIT_MASCOT_STATE.IDLE,
      VISIT_MASCOT_STATE.WALKING,
      VISIT_MASCOT_STATE.RUNNING,
      VISIT_MASCOT_STATE.HAPPY,
      VISIT_MASCOT_STATE.HAPPY_JUMP,
      VISIT_MASCOT_STATE.SPIN,
      VISIT_MASCOT_STATE.INSPECT,
      VISIT_MASCOT_STATE.MAP_READ,
      VISIT_MASCOT_STATE.CELEBRATE,
      VISIT_MASCOT_STATE.TALK,
      VISIT_MASCOT_STATE.ALERT,
      VISIT_MASCOT_STATE.ANGRY,
      VISIT_MASCOT_STATE.SURPRISE,
    ];
    const supported = getVisitMascotSupportedStates(visitMascotId, extraCatalogEntries);
    const fromCatalog = resolveVisitMascotEntry(visitMascotId, extraCatalogEntries);
    let stateAnimations = fromCatalog?.rive?.stateAnimations || {};
    if (fromCatalog?.renderer === 'spritesheet') {
      stateAnimations = fromCatalog?.spritesheet?.stateFrames || {};
    } else if (fromCatalog?.renderer === 'sprite_cut') {
      const frames = fromCatalog?.spriteCut?.stateFrames || {};
      stateAnimations = Object.fromEntries(
        Object.entries(frames).map(([stateKey, spec]) => {
          const srcs = Array.isArray(spec?.srcs) ? spec.srcs : [];
          const aliases = srcs.map((u) => String(u || '').split('/').pop() || u);
          return [stateKey, aliases];
        }),
      );
    }
    return knownOrder
      .filter((state) => supported.includes(state))
      .map((state) => ({
        state,
        icon: VISIT_MASCOT_PREVIEW_STATE_META[state]?.icon || '✨',
        label: VISIT_MASCOT_PREVIEW_STATE_META[state]?.label || state,
        aliases: stateAnimations[state] || [],
      }));
  }, [visitMascotId, extraCatalogEntries]);

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
    const normalized = saveVisitMascotId(nextId, extraCatalogEntries);
    setVisitMascotId(normalized);
  }, [extraCatalogEntries]);

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
