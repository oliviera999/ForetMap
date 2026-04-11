import React, { useEffect, useMemo, useState } from 'react';
import { useRive, Layout, Fit, Alignment } from '@rive-app/react-canvas';
import { VISIT_MASCOT_STATE } from '../utils/visitMascotState.js';

function DefaultVisitMascotStaticSvg({ variant = 'forest' }) {
  const isAmber = variant === 'amber';
  const hatFill = isAmber ? '#b45309' : '#2f855a';
  const bodyFill = isAmber ? '#7c9a42' : '#6cc596';
  const beltFill = isAmber ? '#92400e' : '#84512f';
  const skinFill = isAmber ? '#f2ddc2' : '#f4e9d0';
  const beardFill = isAmber ? '#fff3df' : '#fff8ef';
  const charmFill = isAmber ? '#f59e0b' : '#fbbf24';
  const shoesFill = isAmber ? '#5b3a1b' : '#6b4f2d';

  return (
    <svg className="visit-gnome-svg" viewBox="0 0 128 148" role="presentation" focusable="false">
      <ellipse cx="64" cy="140" rx="30" ry="7" fill="rgba(26,71,49,0.2)" />

      <g className="visit-gnome-hat">
        <path d="M34 40 L73 12 L100 37 L74 42 Z" fill={hatFill} stroke="#1a4731" strokeWidth="4" />
        <circle cx="100" cy="37" r="4" fill={charmFill} stroke="#1a4731" strokeWidth="2" />
      </g>

      <g className="visit-gnome-head">
        <ellipse cx="68" cy="52" rx="20" ry="16" fill={skinFill} stroke="#1a4731" strokeWidth="3.5" />
        <ellipse cx="75" cy="50" rx="5.5" ry="6.8" fill="#fff" />
        <ellipse cx="76.5" cy="51.5" rx="2.4" ry="3.3" fill="#1a4731" />
        <circle cx="77.4" cy="50.4" r="1" fill="#fff" />
        <circle cx="84" cy="54" r="2.2" fill="#d97745" />
        <path d="M73 60 Q79 63 85 58" fill="none" stroke="#1a4731" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M58 60 Q77 96 95 61 Q89 108 77 116 Q65 107 58 60 Z" fill={beardFill} stroke="#1a4731" strokeWidth="3" />
      </g>

      <g className="visit-gnome-body">
        <rect x="52" y="76" width="45" height="34" rx="13" fill={bodyFill} stroke="#1a4731" strokeWidth="4" />
        <rect x="71" y="78" width="8" height="27" rx="4" fill={beltFill} />
      </g>

      <g className="visit-gnome-arm visit-gnome-arm--back">
        <rect x="54" y="82" width="12" height="25" rx="6" fill={skinFill} stroke="#1a4731" strokeWidth="3" />
      </g>
      <g className="visit-gnome-arm visit-gnome-arm--front">
        <rect x="85" y="81" width="12" height="25" rx="6" fill={skinFill} stroke="#1a4731" strokeWidth="3" />
      </g>

      <g className="visit-gnome-leg visit-gnome-leg--back">
        <rect x="60" y="108" width="14" height="26" rx="7" fill={shoesFill} />
      </g>
      <g className="visit-gnome-leg visit-gnome-leg--front">
        <rect x="79" y="108" width="14" height="26" rx="7" fill={shoesFill} />
      </g>
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
