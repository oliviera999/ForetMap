import React, { useEffect, useMemo, useState } from 'react';
import { useRive, Layout, Fit, Alignment } from '@rive-app/react-canvas';
import { VISIT_MASCOT_STATE } from '../utils/visitMascotState.js';
import { VisitMascotFallbackSvg, DefaultVisitMascotStaticSvg } from './VisitMascotFallbackSvg.jsx';

function pickAnimationName(animationNames = [], mascotState = VISIT_MASCOT_STATE.IDLE, stateAnimations = null) {
  const names = Array.isArray(animationNames) ? animationNames : [];
  const byState = stateAnimations && typeof stateAnimations === 'object' ? stateAnimations : {
    [VISIT_MASCOT_STATE.IDLE]: ['idle', 'Idle', 'IDLE'],
    [VISIT_MASCOT_STATE.WALKING]: ['walk', 'Walk', 'walking', 'Walking'],
    [VISIT_MASCOT_STATE.HAPPY]: ['happy', 'Happy', 'celebrate', 'Celebrate'],
    [VISIT_MASCOT_STATE.TALK]: ['talk', 'Talk', 'speaking', 'Speaking'],
    [VISIT_MASCOT_STATE.ALERT]: ['alert', 'Alert', 'warning', 'Warning'],
    [VISIT_MASCOT_STATE.ANGRY]: ['angry', 'Angry', 'alert', 'Alert'],
    [VISIT_MASCOT_STATE.SURPRISE]: ['surprise', 'Surprise', 'happy', 'Happy'],
  };
  const preferredByPriority = [
    ...(byState[mascotState] || []),
    ...(byState[VISIT_MASCOT_STATE.IDLE] || []),
  ];
  for (const wanted of preferredByPriority) {
    const normalizedWanted = String(wanted).toLowerCase();
    const found = names.find((n) => String(n).toLowerCase() === normalizedWanted);
    if (found) return found;
  }
  return names[0] || '';
}

function VisitMapMascotRive({
  mascotState = VISIT_MASCOT_STATE.IDLE,
  mascotConfig = null,
  fallback = null,
  mascotId = '',
}) {
  const [riveError, setRiveError] = useState(false);
  const [status, setStatus] = useState('loading');
  const riveSrc = String(mascotConfig?.rive?.src || '').trim();
  const stateAnimations = mascotConfig?.rive?.stateAnimations || null;
  const fallbackSilhouette = mascotConfig?.fallbackSilhouette || 'gnome';
  const fallbackVariant = mascotConfig?.fallbackVariant || 'forest';
  const resolvedFallback = fallback ?? (
    <VisitMascotFallbackSvg silhouette={fallbackSilhouette} variant={fallbackVariant} />
  );
  const layout = useMemo(
    () => new Layout({ fit: Fit.Contain, alignment: Alignment.Center }),
    []
  );
  const { rive, RiveComponent } = useRive({
    src: riveSrc,
    autoplay: true,
    layout,
    onLoad: () => {
      setStatus('loaded');
      setRiveError(false);
    },
    onLoadError: () => {
      setStatus('error');
      setRiveError(true);
    },
  });

  useEffect(() => {
    if (!rive || riveError) return;
    const names = rive.animationNames || [];
    const selected = pickAnimationName(names, mascotState, stateAnimations);
    if (!selected) {
      setStatus('fallback-no-animation');
      return;
    }
    try {
      rive.stop();
      rive.play(selected);
      setStatus(`playing:${selected}`);
    } catch (_) {
      setStatus('fallback-play-error');
      setRiveError(true);
    }
  }, [rive, riveError, mascotState]);

  return (
    <div
      className="visit-map-mascot-rive-shell"
      data-renderer={riveError ? 'fallback-static' : 'rive'}
      data-rive-status={status}
      data-mascot-state={mascotState}
      data-mascot-id={mascotId}
      data-mascot-shape={fallbackSilhouette}
      aria-hidden="true"
    >
      <div className="visit-map-mascot-static" aria-hidden="true">
        {resolvedFallback}
      </div>
      {!riveError ? (
        <div className="visit-map-mascot-rive" aria-hidden="true">
          <RiveComponent />
        </div>
      ) : null}
    </div>
  );
}

export default VisitMapMascotRive;
export { VisitMapMascotRive, DefaultVisitMascotStaticSvg };
