import React, { useEffect, useMemo, useState } from 'react';
import { useRive, Layout, Fit, Alignment } from '@rive-app/react-canvas';
import { VISIT_MASCOT_STATE } from '../utils/visitMascotState.js';

function DefaultVisitMascotStaticSvg() {
  return (
    <svg viewBox="0 0 128 148" role="presentation" focusable="false">
      <ellipse cx="64" cy="140" rx="34" ry="7" fill="rgba(26,71,49,0.22)" />
      <rect x="23" y="18" width="82" height="30" rx="15" fill="#e8f5e9" stroke="#1a4731" strokeWidth="4" />
      <ellipse cx="64" cy="74" rx="38" ry="46" fill="#f4e9d0" stroke="#1a4731" strokeWidth="4" />
      <ellipse cx="48" cy="68" rx="9" ry="11" fill="#ffffff" />
      <ellipse cx="80" cy="68" rx="9" ry="11" fill="#ffffff" />
      <ellipse cx="48" cy="70" rx="4" ry="5" fill="#1a4731" />
      <ellipse cx="80" cy="70" rx="4" ry="5" fill="#1a4731" />
      <circle cx="51" cy="66" r="1.4" fill="#ffffff" />
      <circle cx="83" cy="66" r="1.4" fill="#ffffff" />
      <path d="M57 86 Q64 91 71 86" fill="none" stroke="#1a4731" strokeWidth="4" strokeLinecap="round" />
      <rect x="40" y="97" width="48" height="25" rx="12" fill="#86efac" stroke="#1a4731" strokeWidth="4" />
      <rect x="46" y="120" width="13" height="17" rx="6" fill="#6b4f2d" />
      <rect x="69" y="120" width="13" height="17" rx="6" fill="#6b4f2d" />
    </svg>
  );
}

function pickAnimationName(animationNames = [], mascotState = VISIT_MASCOT_STATE.IDLE, stateAnimations = null) {
  const names = Array.isArray(animationNames) ? animationNames : [];
  const byState = stateAnimations && typeof stateAnimations === 'object' ? stateAnimations : {
    [VISIT_MASCOT_STATE.IDLE]: ['idle', 'Idle', 'IDLE'],
    [VISIT_MASCOT_STATE.WALKING]: ['walk', 'Walk', 'walking', 'Walking'],
    [VISIT_MASCOT_STATE.HAPPY]: ['happy', 'Happy', 'celebrate', 'Celebrate'],
  };
  const preferred = byState[mascotState] || byState[VISIT_MASCOT_STATE.IDLE] || [];
  for (const wanted of preferred) {
    const found = names.find((n) => String(n).toLowerCase() === String(wanted).toLowerCase());
    if (found) return found;
  }
  return names[0] || '';
}

function VisitMapMascotRive({
  mascotState = VISIT_MASCOT_STATE.IDLE,
  mascotConfig = null,
  fallback = <DefaultVisitMascotStaticSvg />,
}) {
  const [riveError, setRiveError] = useState(false);
  const [status, setStatus] = useState('loading');
  const riveSrc = String(mascotConfig?.rive?.src || '').trim();
  const stateAnimations = mascotConfig?.rive?.stateAnimations || null;
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
      aria-hidden="true"
    >
      <div className="visit-map-mascot-static" aria-hidden="true">
        {fallback}
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
