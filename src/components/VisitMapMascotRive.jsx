import React, { useEffect, useMemo, useState } from 'react';
import { useRive, Layout, Fit, Alignment } from '@rive-app/react-canvas';
import { VISIT_MASCOT_STATE } from '../utils/visitMascotState.js';

function DefaultVisitMascotStaticSvg() {
  return (
    <svg viewBox="0 0 128 148" role="presentation" focusable="false">
      <ellipse cx="64" cy="140" rx="33" ry="7" fill="rgba(26,71,49,0.2)" />
      <path d="M28 40 L64 9 L100 40 L89 44 L39 44 Z" fill="#2f855a" stroke="#1a4731" strokeWidth="4" />
      <ellipse cx="64" cy="48" rx="27" ry="20" fill="#f4e9d0" stroke="#1a4731" strokeWidth="4" />
      <ellipse cx="50" cy="47" rx="6.5" ry="8.5" fill="#fff" />
      <ellipse cx="78" cy="47" rx="6.5" ry="8.5" fill="#fff" />
      <ellipse cx="50" cy="49" rx="3" ry="4" fill="#1a4731" />
      <ellipse cx="78" cy="49" rx="3" ry="4" fill="#1a4731" />
      <circle cx="52" cy="46" r="1.3" fill="#fff" />
      <circle cx="80" cy="46" r="1.3" fill="#fff" />
      <circle cx="64" cy="56" r="2.7" fill="#d97745" />
      <path d="M58 60 Q64 64 70 60" fill="none" stroke="#1a4731" strokeWidth="3" strokeLinecap="round" />
      <path d="M43 62 Q64 99 85 62 Q77 110 64 118 Q51 110 43 62 Z" fill="#fff8ef" stroke="#1a4731" strokeWidth="3.4" />
      <rect x="36" y="76" width="56" height="34" rx="14" fill="#6cc596" stroke="#1a4731" strokeWidth="4" />
      <rect x="59" y="78" width="10" height="28" rx="5" fill="#84512f" />
      <rect x="43" y="108" width="16" height="26" rx="8" fill="#6b4f2d" />
      <rect x="69" y="108" width="16" height="26" rx="8" fill="#6b4f2d" />
      <rect x="36" y="82" width="14" height="22" rx="7" fill="#f4e9d0" stroke="#1a4731" strokeWidth="3" />
      <rect x="78" y="82" width="14" height="22" rx="7" fill="#f4e9d0" stroke="#1a4731" strokeWidth="3" />
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
