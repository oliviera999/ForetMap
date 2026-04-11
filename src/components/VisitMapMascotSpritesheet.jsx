import React, { useMemo, useState } from 'react';
import { VISIT_MASCOT_STATE } from '../utils/visitMascotState.js';

function resolveStateSpec(spritesheetConfig = null, mascotState = VISIT_MASCOT_STATE.IDLE) {
  const spec = spritesheetConfig?.stateFrames?.[mascotState];
  if (spec) return spec;
  const aliasKey = spritesheetConfig?.stateAliases?.[mascotState];
  if (aliasKey && spritesheetConfig?.stateFrames?.[aliasKey]) {
    return spritesheetConfig.stateFrames[aliasKey];
  }
  return spritesheetConfig?.stateFrames?.[VISIT_MASCOT_STATE.IDLE] || { row: 0, frames: 1, fps: 1 };
}

function VisitMapMascotSpritesheet({
  mascotState = VISIT_MASCOT_STATE.IDLE,
  mascotConfig = null,
  fallback,
  mascotId = '',
}) {
  const [imgError, setImgError] = useState(false);
  const sheet = mascotConfig?.spritesheet || null;
  const stateSpec = useMemo(() => resolveStateSpec(sheet, mascotState), [sheet, mascotState]);
  const canRender =
    !imgError
    && !!sheet?.src
    && Number(sheet?.frameWidth) > 0
    && Number(sheet?.frameHeight) > 0;
  const fallbackSilhouette = mascotConfig?.fallbackSilhouette || 'gnome';
  const spriteStartCol = Math.max(0, Number(stateSpec?.col) || 0);

  return (
    <div
      className="visit-map-mascot-spritesheet-shell"
      data-renderer={canRender ? 'spritesheet' : 'fallback-static'}
      data-mascot-state={mascotState}
      data-spritesheet-status={canRender ? 'ready' : 'fallback'}
      data-mascot-id={mascotId}
      data-mascot-shape={fallbackSilhouette}
      aria-hidden="true"
    >
      <div className="visit-map-mascot-static" aria-hidden="true">
        {fallback}
      </div>
      {canRender ? (
        <div
          className={`visit-map-mascot-spritesheet${sheet.pixelated ? ' visit-map-mascot-spritesheet--pixelated' : ''}`}
          style={{
            width: `${sheet.frameWidth}px`,
            height: `${sheet.frameHeight}px`,
            backgroundImage: `url("${sheet.src}")`,
            backgroundPositionX: `-${spriteStartCol * sheet.frameWidth}px`,
            backgroundPositionY: `-${Math.max(0, Number(stateSpec.row) || 0) * sheet.frameHeight}px`,
            '--visit-sprite-frames': Math.max(1, Number(stateSpec.frames) || 1),
            '--visit-sprite-fps': Math.max(1, Number(stateSpec.fps) || 1),
            '--visit-sprite-frame-width': `${sheet.frameWidth}px`,
            '--visit-sprite-start-x': `${-spriteStartCol * sheet.frameWidth}px`,
          }}
          onError={() => setImgError(true)}
          role="presentation"
          aria-hidden="true"
        />
      ) : null}
      {/* Précharge l'image pour détecter rapidement les assets manquants. */}
      {canRender ? (
        <img
          src={sheet.src}
          alt=""
          aria-hidden="true"
          className="visit-map-mascot-sprite-preload"
          onError={() => setImgError(true)}
        />
      ) : null}
    </div>
  );
}

export default VisitMapMascotSpritesheet;
