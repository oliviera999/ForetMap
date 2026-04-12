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

/** Durée par frame (ms) : `frameDwellMs` si aligné sur `srcs`, sinon uniforme depuis `fps`. */
function computeDwellMsForSrcs(stateSpec, srcsLength) {
  if (srcsLength <= 0) return [];
  const fps = Math.max(1, Number(stateSpec?.fps) || 8);
  const uniform = Math.max(33, Math.round(1000 / fps));
  const custom = stateSpec?.frameDwellMs;
  if (Array.isArray(custom) && custom.length === srcsLength) {
    return custom.map((n) => Math.max(33, Math.round(Number(n) || uniform)));
  }
  return Array(srcsLength).fill(uniform);
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
  const dwellMsFull = useMemo(
    () => computeDwellMsForSrcs(stateSpec, srcs.length),
    [stateSpec, srcs.length],
  );
  const [frameIndex, setFrameIndex] = useState(0);
  const [failedSrcs, setFailedSrcs] = useState(() => new Set());

  const dwellKey = useMemo(
    () => (Array.isArray(stateSpec?.frameDwellMs) ? JSON.stringify(stateSpec.frameDwellMs) : ''),
    [stateSpec?.frameDwellMs],
  );

  const spriteAnimKey = useMemo(
    () => [mascotId, mascotState, srcs.join('|'), fps, dwellKey].join('::'),
    [mascotId, mascotState, srcs, fps, dwellKey],
  );

  const workingSrcs = useMemo(
    () => srcs.filter((u) => !failedSrcs.has(u)),
    [srcs, failedSrcs],
  );

  const workingDwells = useMemo(() => {
    return srcs
      .map((url, i) => (!failedSrcs.has(url) ? dwellMsFull[i] : null))
      .filter((d) => d != null);
  }, [srcs, failedSrcs, dwellMsFull]);

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
    const n = workingSrcs.length;
    const idx = frameIndex % n;
    const dwell = workingDwells[idx] ?? Math.max(33, Math.round(1000 / fps));
    const id = window.setTimeout(() => {
      setFrameIndex((i) => (i + 1) % n);
    }, Math.max(33, dwell));
    return () => window.clearTimeout(id);
  }, [frameIndex, workingSrcs, workingDwells, prefersReducedMotion, fps, spriteAnimKey]);

  const safeIndex = workingSrcs.length === 0
    ? 0
    : (prefersReducedMotion ? 0 : frameIndex % workingSrcs.length);
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
  const displayScale = (() => {
    const s = Number(cut?.displayScale);
    if (!Number.isFinite(s) || s <= 0) return 1;
    return Math.min(4, Math.max(0.25, s));
  })();

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
      {!canRender ? (
        <div className="visit-map-mascot-static" aria-hidden="true">
          {fallback}
        </div>
      ) : null}
      {canRender ? (
        <div
          key={spriteAnimKey}
          className={`visit-map-mascot-sprite-cut${cut.pixelated ? ' visit-map-mascot-spritesheet--pixelated' : ''}`}
          style={{
            width: `${cut.frameWidth}px`,
            height: `${cut.frameHeight}px`,
            transform: displayScale !== 1 ? `scale(${displayScale})` : undefined,
            transformOrigin: 'center bottom',
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
