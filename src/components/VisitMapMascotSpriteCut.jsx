import React, { useEffect, useMemo, useState } from 'react';
import { VISIT_MASCOT_STATE } from '../utils/visitMascotState.js';

function resolveSpriteCutStateSpec(spriteCutConfig = null, mascotState = VISIT_MASCOT_STATE.IDLE) {
  const spec = spriteCutConfig?.stateFrames?.[mascotState];
  if (spec && Array.isArray(spec.srcs) && spec.srcs.length > 0) return spec;
  const aliasKey = spriteCutConfig?.stateAliases?.[mascotState];
  if (aliasKey && spriteCutConfig?.stateFrames?.[aliasKey]) {
    return spriteCutConfig.stateFrames[aliasKey];
  }
  const idle = spriteCutConfig?.stateFrames?.[VISIT_MASCOT_STATE.IDLE];
  if (idle && Array.isArray(idle.srcs) && idle.srcs.length > 0) return idle;
  return { srcs: [], fps: 1 };
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => (
    typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ));
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

function VisitMapMascotSpriteCut({
  mascotState = VISIT_MASCOT_STATE.IDLE,
  mascotConfig = null,
  fallback,
  mascotId = '',
}) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const cut = mascotConfig?.spriteCut || null;
  const stateSpec = useMemo(() => resolveSpriteCutStateSpec(cut, mascotState), [cut, mascotState]);
  const srcs = useMemo(
    () => (Array.isArray(stateSpec?.srcs) ? stateSpec.srcs.map((u) => String(u || '').trim()).filter(Boolean) : []),
    [stateSpec?.srcs],
  );
  const fps = Math.max(1, Number(stateSpec?.fps) || 1);
  const [frameIndex, setFrameIndex] = useState(0);
  const [failedSrcs, setFailedSrcs] = useState(() => new Set());

  const spriteAnimKey = useMemo(
    () => [mascotId, mascotState, srcs.join('|'), fps].join('::'),
    [mascotId, mascotState, srcs, fps],
  );

  const workingSrcs = useMemo(
    () => srcs.filter((u) => !failedSrcs.has(u)),
    [srcs, failedSrcs],
  );

  useEffect(() => {
    setFrameIndex(0);
    setFailedSrcs(new Set());
  }, [spriteAnimKey]);

  useEffect(() => {
    if (srcs.length === 0) return undefined;
    srcs.forEach((url) => {
      const img = new Image();
      img.src = url;
    });
  }, [spriteAnimKey, srcs]);

  useEffect(() => {
    if (workingSrcs.length <= 1 || prefersReducedMotion) return undefined;
    const ms = Math.round(1000 / fps);
    const id = window.setInterval(() => {
      setFrameIndex((i) => (i + 1) % workingSrcs.length);
    }, Math.max(33, ms));
    return () => window.clearInterval(id);
  }, [workingSrcs.length, fps, prefersReducedMotion, spriteAnimKey]);
  const safeIndex = workingSrcs.length === 0
    ? 0
    : (prefersReducedMotion ? 0 : Math.min(frameIndex, workingSrcs.length - 1));
  const currentSrc = workingSrcs[safeIndex] || '';

  const onImgError = () => {
    if (!currentSrc) return;
    setFailedSrcs((prev) => {
      const next = new Set(prev);
      next.add(currentSrc);
      return next;
    });
    setFrameIndex(0);
  };

  const canRender = workingSrcs.length > 0
    && Number(cut?.frameWidth) > 0
    && Number(cut?.frameHeight) > 0;
  const fallbackSilhouette = mascotConfig?.fallbackSilhouette || 'gnome';

  return (
    <div
      className="visit-map-mascot-spritesheet-shell"
      data-renderer={canRender ? 'sprite-cut' : 'fallback-static'}
      data-mascot-state={mascotState}
      data-sprite-cut-status={canRender ? 'ready' : 'fallback'}
      data-mascot-id={mascotId}
      data-mascot-shape={fallbackSilhouette}
      aria-hidden="true"
    >
      <div className="visit-map-mascot-static" aria-hidden="true">
        {fallback}
      </div>
      {canRender ? (
        <div
          key={spriteAnimKey}
          className={`visit-map-mascot-sprite-cut${cut.pixelated ? ' visit-map-mascot-spritesheet--pixelated' : ''}`}
          style={{
            width: `${cut.frameWidth}px`,
            height: `${cut.frameHeight}px`,
          }}
          role="presentation"
          aria-hidden="true"
        >
          <img
            src={currentSrc}
            alt=""
            decoding="async"
            draggable={false}
            onError={onImgError}
          />
        </div>
      ) : null}
    </div>
  );
}

export default VisitMapMascotSpriteCut;
