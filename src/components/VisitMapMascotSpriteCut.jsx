import { useEffect, useMemo, useState } from 'react';
import { usePrefersReducedMotion } from '../shared/hooks/usePrefersReducedMotion.js';
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

/**
 * Toutes les URLs de frames d'un pack sprite_cut (tous les états).
 * Sert au préchargement : sans ça, un changement d'état (marche → inspect) charge
 * la 1ʳᵉ frame trop tard et l'`<img>` remplacé laisse une phase vide/blanche.
 * @param {{ stateFrames?: Record<string, { srcs?: unknown[] }> } | null} spriteCut
 * @returns {string[]}
 */
export function collectSpriteCutFrameUrls(spriteCut) {
  const frames = spriteCut?.stateFrames;
  if (!frames || typeof frames !== 'object') return [];
  const out = [];
  const seen = new Set();
  for (const spec of Object.values(frames)) {
    if (!Array.isArray(spec?.srcs)) continue;
    for (const raw of spec.srcs) {
      const url = String(raw || '').trim();
      if (!url || seen.has(url)) continue;
      seen.add(url);
      out.push(url);
    }
  }
  return out;
}

/** URLs déjà préchargées (module) : évite de re-télécharger les frames à chaque changement d'état. */
const preloadedSpriteCutUrls = new Set();

function preloadSpriteCutUrl(url) {
  const u = String(url || '').trim();
  if (!u || preloadedSpriteCutUrls.has(u)) return;
  preloadedSpriteCutUrls.add(u);
  const img = new Image();
  img.src = u;
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

/**
 * Attend que `wantedSrc` soit décodable avant d'appeler `onReady`.
 * Si déjà en cache (`complete`), applique synchronement — pas de trou de peinture.
 * @returns {() => void} cleanup
 */
export function whenSpriteCutSrcReady(wantedSrc, onReady) {
  const url = String(wantedSrc || '').trim();
  if (!url) return () => {};
  let cancelled = false;
  const img = new Image();
  const apply = () => {
    if (!cancelled) onReady(url);
  };
  img.onload = apply;
  img.src = url;
  if (img.complete && img.naturalWidth > 0) apply();
  return () => {
    cancelled = true;
  };
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
    () =>
      Array.isArray(stateSpec?.srcs)
        ? stateSpec.srcs.map((u) => String(u || '').trim()).filter(Boolean)
        : [],
    [stateSpec?.srcs],
  );
  const fps = Math.max(1, Number(stateSpec?.fps) || 1);
  const dwellMsFull = useMemo(
    () => computeDwellMsForSrcs(stateSpec, srcs.length),
    [stateSpec, srcs.length],
  );
  const [frameIndex, setFrameIndex] = useState(0);
  const [failedSrcs, setFailedSrcs] = useState(() => new Set());
  /** Dernière frame réellement peinte : on ne bascule qu'une fois la suivante prête. */
  const [displaySrc, setDisplaySrc] = useState('');

  const dwellKey = useMemo(
    () => (Array.isArray(stateSpec?.frameDwellMs) ? JSON.stringify(stateSpec.frameDwellMs) : ''),
    [stateSpec?.frameDwellMs],
  );

  const spriteAnimKey = useMemo(
    () => [mascotId, mascotState, srcs.join('|'), fps, dwellKey].join('::'),
    [mascotId, mascotState, srcs, fps, dwellKey],
  );

  const packPreloadKey = useMemo(
    () => `${mascotId}::${collectSpriteCutFrameUrls(cut).join('|')}`,
    [mascotId, cut],
  );

  const workingSrcs = useMemo(() => srcs.filter((u) => !failedSrcs.has(u)), [srcs, failedSrcs]);

  const workingDwells = useMemo(() => {
    return srcs
      .map((url, i) => (!failedSrcs.has(url) ? dwellMsFull[i] : null))
      .filter((d) => d != null);
  }, [srcs, failedSrcs, dwellMsFull]);

  useEffect(() => {
    setFrameIndex(0);
    setFailedSrcs(new Set());
  }, [spriteAnimKey]);

  // Précharge **tous** les états du pack dès le montage / changement de pack — pas seulement
  // l'état courant (sinon marche→inspect flash blanc sur la 1ʳᵉ frame non encore en cache).
  useEffect(() => {
    collectSpriteCutFrameUrls(cut).forEach(preloadSpriteCutUrl);
  }, [packPreloadKey, cut]);

  useEffect(() => {
    if (workingSrcs.length <= 1 || prefersReducedMotion) return undefined;
    const n = workingSrcs.length;
    const idx = frameIndex % n;
    const dwell = workingDwells[idx] ?? Math.max(33, Math.round(1000 / fps));
    const id = window.setTimeout(
      () => {
        setFrameIndex((i) => (i + 1) % n);
      },
      Math.max(33, dwell),
    );
    return () => window.clearTimeout(id);
  }, [frameIndex, workingSrcs, workingDwells, prefersReducedMotion, fps, spriteAnimKey]);

  const safeIndex =
    workingSrcs.length === 0 ? 0 : prefersReducedMotion ? 0 : frameIndex % workingSrcs.length;
  const currentSrc = workingSrcs[safeIndex] || '';

  // Changement de mascotte : abandonner l'ancienne silhouette. (Pas sur un simple
  // changement d'état — on garde la frame peinte pour éviter le flash blanc.)
  useEffect(() => {
    setDisplaySrc('');
  }, [mascotId]);

  // Hold-until-ready : garder la frame précédente tant que la suivante n'est pas décodée.
  // Évite le trou blanc quand on change `src` (navigateur qui vide l'`<img>` avant paint).
  // Placé **après** le reset mascotte pour que le chargement de la nouvelle frame gagne.
  useEffect(() => {
    if (!currentSrc) {
      if (workingSrcs.length === 0) setDisplaySrc('');
      return undefined;
    }
    if (currentSrc === displaySrc) return undefined;
    return whenSpriteCutSrcReady(currentSrc, setDisplaySrc);
  }, [currentSrc, displaySrc, workingSrcs.length]);

  const onImgError = () => {
    const broken = displaySrc || currentSrc;
    if (!broken) return;
    setFailedSrcs((prev) => {
      const next = new Set(prev);
      next.add(broken);
      return next;
    });
    setFrameIndex(0);
  };

  const canRender =
    workingSrcs.length > 0 && Number(cut?.frameWidth) > 0 && Number(cut?.frameHeight) > 0;
  const paintedSrc = displaySrc || '';
  const showPainted = canRender && !!paintedSrc;
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
      {!showPainted ? (
        <div className="visit-map-mascot-static" aria-hidden="true">
          {fallback}
        </div>
      ) : null}
      {showPainted ? (
        <div
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
          {/* Pas de remount par état : on met à jour src uniquement quand displaySrc est prêt. */}
          <img src={paintedSrc} alt="" decoding="async" draggable={false} onError={onImgError} />
        </div>
      ) : null}
    </div>
  );
}

export default VisitMapMascotSpriteCut;
