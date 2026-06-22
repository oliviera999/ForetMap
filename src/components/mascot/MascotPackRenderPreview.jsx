import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import VisitMapMascotRenderer from '../VisitMapMascotRenderer.jsx';
import { STATE_LABELS } from '../../constants/mascotStateLabels.js';
import useVisitMascotStateMachine from '../../hooks/useVisitMascotStateMachine.js';
import { validateMascotPackV1 } from '../../utils/mascotPack.js';
import { sanitizeMascotPackDraft } from '../../utils/mascotPackValidationUi.js';
import { buildVisitMascotCatalogExtraFromValidated } from '../../utils/visitMascotPackExtras.js';
import { VISIT_MASCOT_STATE } from '../../utils/visitMascotState.js';
import {
  VISIT_MASCOT_INTERACTION_EVENT,
  VISIT_MASCOT_INTERACTION_EVENT_KEYS,
  VISIT_MASCOT_INTERACTION_LABELS,
} from '../../utils/visitMascotInteractionEvents.js';
import { resolveVisitMascotInteraction } from '../../utils/visitMascotInteractionApply.js';

const PREVIEW_HAPPY_MS = 1800;

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

function previewMotionClass(state) {
  if (state === VISIT_MASCOT_STATE.WALKING || state === VISIT_MASCOT_STATE.RUNNING) {
    return 'visit-mascot-preview-body--motion-walk';
  }
  if (
    state === VISIT_MASCOT_STATE.HAPPY ||
    state === VISIT_MASCOT_STATE.CELEBRATE ||
    state === VISIT_MASCOT_STATE.HAPPY_JUMP ||
    state === VISIT_MASCOT_STATE.SPIN
  ) {
    return 'visit-mascot-preview-body--motion-happy';
  }
  return 'visit-mascot-preview-body--motion-idle';
}

function describeInteractionResult(result) {
  if (!result || result.kind === 'none') return 'Désactivé';
  if (result.kind === 'happy') return 'Joyeux';
  if (result.kind === 'transient') {
    const label = STATE_LABELS[result.state] || result.state;
    const ms = result.durationMs != null ? ` · ${result.durationMs} ms` : '';
    return `${label}${ms}`;
  }
  return '';
}

/**
 * Fenêtre de rendu final du pack : scène cliquable + puces animations et comportements visite.
 * @typedef {{
 *   playInteraction: (eventKey: string) => void,
 *   playAnimationState: (state: string) => void,
 * }} MascotPackRenderPreviewHandle
 */

/**
 * @param {{
 *   pack: Record<string, unknown>,
 *   catalogId?: string,
 *   label?: string,
 *   focusSection?: 'all' | 'animations' | 'behaviors',
 *   variant?: 'studio' | 'embedded',
 * }} props
 * @param {React.Ref<MascotPackRenderPreviewHandle>} ref
 */
function MascotPackRenderPreview(
  { pack, catalogId = '', label = '', focusSection = 'all', variant = 'studio' },
  ref,
) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [previewHappy, setPreviewHappy] = useState(false);
  const previewHappyTimeoutRef = useRef(null);
  const [activeChip, setActiveChip] = useState(
    /** @type {{ type: 'animation' | 'behavior', key: string } | null} */ (null),
  );

  const validated = useMemo(
    () => validateMascotPackV1(sanitizeMascotPackDraft(pack), { relaxAssetPrefix: true }),
    [pack],
  );

  const catalogExtra = useMemo(() => {
    if (!validated.ok) return null;
    const id = String(catalogId || validated.pack.id || '').trim();
    return buildVisitMascotCatalogExtraFromValidated(validated, id, label);
  }, [validated, catalogId, label]);

  const extras = useMemo(() => (catalogExtra ? [catalogExtra] : []), [catalogExtra]);
  const mascotId = catalogExtra?.id || '';

  const {
    visitMascotPreviewState,
    visitMascotAnimationState,
    setVisitMascotPreviewState,
    triggerMascotTransientState,
    resetMascotTransientState,
  } = useVisitMascotStateMachine({
    happy: previewHappy,
    extraCatalogEntries: extras,
    preferredMascotId: mascotId,
  });

  const clearPreviewHappy = useCallback(() => {
    if (previewHappyTimeoutRef.current) {
      clearTimeout(previewHappyTimeoutRef.current);
      previewHappyTimeoutRef.current = null;
    }
    setPreviewHappy(false);
  }, []);

  const triggerPreviewHappy = useCallback(() => {
    clearPreviewHappy();
    setPreviewHappy(true);
    previewHappyTimeoutRef.current = window.setTimeout(() => {
      setPreviewHappy(false);
      previewHappyTimeoutRef.current = null;
    }, PREVIEW_HAPPY_MS);
  }, [clearPreviewHappy]);

  useEffect(
    () => () => {
      if (previewHappyTimeoutRef.current) clearTimeout(previewHappyTimeoutRef.current);
    },
    [],
  );

  const displayState = useMemo(() => {
    if (visitMascotAnimationState !== VISIT_MASCOT_STATE.IDLE) return visitMascotAnimationState;
    return visitMascotPreviewState;
  }, [visitMascotAnimationState, visitMascotPreviewState]);

  const animationStates = useMemo(() => {
    if (!validated.ok) return [];
    return Object.keys(validated.pack.stateFrames || {}).sort();
  }, [validated]);

  const behaviorChips = useMemo(() => {
    if (!mascotId) return [];
    return VISIT_MASCOT_INTERACTION_EVENT_KEYS.map((key) => {
      const resolved = resolveVisitMascotInteraction(key, {
        mascotId,
        extraCatalogEntries: extras,
      });
      return {
        key,
        label: VISIT_MASCOT_INTERACTION_LABELS[key] || key,
        hint: describeInteractionResult(resolved),
        disabled: resolved.kind === 'none',
        resolved,
      };
    });
  }, [mascotId, extras]);

  const playInteraction = useCallback(
    (eventKey) => {
      if (!mascotId) return;
      const result = resolveVisitMascotInteraction(eventKey, {
        mascotId,
        extraCatalogEntries: extras,
      });
      if (result.kind === 'none') return;
      resetMascotTransientState();
      clearPreviewHappy();
      setVisitMascotPreviewState(VISIT_MASCOT_STATE.IDLE);
      setActiveChip({ type: 'behavior', key: eventKey });
      if (result.kind === 'happy') {
        triggerPreviewHappy();
        return;
      }
      if (result.kind === 'transient') {
        triggerMascotTransientState(result.state, result.durationMs);
      }
    },
    [
      mascotId,
      extras,
      resetMascotTransientState,
      clearPreviewHappy,
      setVisitMascotPreviewState,
      triggerPreviewHappy,
      triggerMascotTransientState,
    ],
  );

  const playAnimationState = useCallback(
    (state) => {
      resetMascotTransientState();
      clearPreviewHappy();
      setVisitMascotPreviewState(state);
      setActiveChip({ type: 'animation', key: state });
    },
    [resetMascotTransientState, clearPreviewHappy, setVisitMascotPreviewState],
  );

  useImperativeHandle(ref, () => ({ playInteraction, playAnimationState }), [
    playInteraction,
    playAnimationState,
  ]);

  const onStageClick = useCallback(() => {
    playInteraction(VISIT_MASCOT_INTERACTION_EVENT.MARKER_INSPECT_OPEN);
  }, [playInteraction]);

  const showAnimations = focusSection === 'all' || focusSection === 'animations';
  const showBehaviors = focusSection === 'all' || focusSection === 'behaviors';

  if (!validated.ok) {
    return (
      <section
        className="mascot-pack-render-preview mascot-pack-render-preview--invalid"
        aria-label="Rendu final du pack"
      >
        <h3 className="mascot-pack-render-preview__title">Rendu final</h3>
        <p className="section-sub" style={{ fontSize: '0.85rem', margin: 0 }}>
          Corrigez le pack pour afficher l’aperçu animé (au moins un état avec images valides).
        </p>
      </section>
    );
  }

  const motionClass = prefersReducedMotion
    ? 'visit-mascot-preview-body--reduced-motion'
    : previewMotionClass(displayState);

  return (
    <section
      className={`mascot-pack-render-preview mascot-pack-render-preview--${variant}`}
      aria-label="Rendu final du pack"
    >
      <div className="mascot-pack-render-preview__header">
        <h3 className="mascot-pack-render-preview__title">Rendu final</h3>
        <p className="mascot-pack-render-preview__state" role="status">
          État affiché :{' '}
          <strong>
            {STATE_LABELS[displayState] || displayState}{' '}
            <code style={{ fontWeight: 500 }}>({displayState})</code>
          </strong>
        </p>
      </div>

      <div className="mascot-pack-render-preview__layout">
        <button
          type="button"
          className={`visit-mascot-preview-body mascot-pack-render-preview__stage ${motionClass}`}
          onClick={onStageClick}
          aria-label="Scène de rendu — clic pour simuler l’inspection d’un repère"
          title="Clic : simule l’ouverture d’un repère (inspection)"
        >
          <VisitMapMascotRenderer
            mascotState={displayState}
            mascotId={mascotId}
            extraCatalogEntries={extras}
          />
        </button>

        <div className="mascot-pack-render-preview__controls">
          {showBehaviors ? (
            <div className="mascot-pack-render-preview__group">
              <h4 className="mascot-pack-render-preview__group-title">Comportements visite</h4>
              <p className="section-sub mascot-pack-render-preview__hint">
                Cliquez une puce pour rejouer la réaction configurée sur la carte.
              </p>
              <div className="mascot-pack-render-preview__chips">
                {behaviorChips.map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    aria-label={`${chip.label} — ${chip.hint}`}
                    className={`btn btn-sm mascot-pack-render-preview__chip ${
                      activeChip?.type === 'behavior' && activeChip.key === chip.key
                        ? 'btn-primary'
                        : 'btn-ghost'
                    }`}
                    disabled={chip.disabled}
                    onClick={() => playInteraction(chip.key)}
                    title={chip.hint}
                  >
                    <span className="mascot-pack-render-preview__chip-label">{chip.label}</span>
                    <span className="mascot-pack-render-preview__chip-hint">{chip.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {showAnimations ? (
            <div className="mascot-pack-render-preview__group">
              <h4 className="mascot-pack-render-preview__group-title">Animations du pack</h4>
              <p className="section-sub mascot-pack-render-preview__hint">
                États définis dans le pack — maintien jusqu’au prochain comportement.
              </p>
              <div className="mascot-pack-render-preview__chips">
                {animationStates.map((stateKey) => (
                  <button
                    key={stateKey}
                    type="button"
                    aria-label={`${STATE_LABELS[stateKey] || stateKey} (${stateKey})`}
                    className={`btn btn-sm mascot-pack-render-preview__chip ${
                      activeChip?.type === 'animation' && activeChip.key === stateKey
                        ? 'btn-primary'
                        : 'btn-ghost'
                    }`}
                    onClick={() => playAnimationState(stateKey)}
                  >
                    <span className="mascot-pack-render-preview__chip-label">
                      {STATE_LABELS[stateKey] || stateKey}
                    </span>
                    <span className="mascot-pack-render-preview__chip-hint">
                      <code>{stateKey}</code>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export default forwardRef(MascotPackRenderPreview);
