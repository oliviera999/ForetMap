/**
 * Convertit un pack mascotte GL (`sprite_cut`) vers le format visite
 * pour réutiliser `expandMascotPackToSpriteCut` / le renderer ForetMap.
 */
import { VISIT_MASCOT_STATE } from './visitMascotState.js';
import { expandMascotPackToSpriteCut, validateMascotPack } from './mascotPack.js';

const GL_STATE_ALIASES = {
  idle: VISIT_MASCOT_STATE.IDLE,
  walking: VISIT_MASCOT_STATE.WALKING,
  walk: VISIT_MASCOT_STATE.WALKING,
  running: VISIT_MASCOT_STATE.RUNNING,
  run: VISIT_MASCOT_STATE.RUNNING,
  happy: VISIT_MASCOT_STATE.HAPPY,
  talk: VISIT_MASCOT_STATE.TALK,
  talking: VISIT_MASCOT_STATE.TALK,
  alert: VISIT_MASCOT_STATE.ALERT,
  angry: VISIT_MASCOT_STATE.ANGRY,
  sad: VISIT_MASCOT_STATE.ANGRY,
  surprise: VISIT_MASCOT_STATE.SURPRISE,
  celebrate: VISIT_MASCOT_STATE.CELEBRATE,
  inspect: VISIT_MASCOT_STATE.INSPECT,
};

/**
 * @param {string} key
 * @returns {string}
 */
export function mapGlMascotStateKeyToVisit(key) {
  const raw = String(key || '')
    .trim()
    .toLowerCase();
  if (GL_STATE_ALIASES[raw]) return GL_STATE_ALIASES[raw];
  const values = Object.values(VISIT_MASCOT_STATE);
  if (values.includes(raw)) return raw;
  return VISIT_MASCOT_STATE.IDLE;
}

/**
 * @param {import('zod').infer<typeof import('./glMascotPack.js').glMascotPackSchema>} glPack
 * @param {{ relaxAssetPrefix?: boolean }} [opts]
 * @returns {{ ok: true, pack: object, spriteCut: object, visitPack: object } | { ok: false, error: unknown }}
 */
export function glMascotPackSpriteCutToVisitValidation(glPack, opts = {}) {
  if (!glPack || glPack.renderer !== 'sprite_cut') {
    return { ok: false, error: new Error('Pack GL non sprite_cut') };
  }
  const assets = Array.isArray(glPack.assets) ? glPack.assets : [];
  const stateFrames = {};
  for (const st of glPack.states || []) {
    const visitState = mapGlMascotStateKeyToVisit(st.key);
    const srcs = (Array.isArray(st.frames) ? st.frames : [])
      .map((idx) => {
        const asset = assets[Number(idx)];
        return asset?.src ? String(asset.src).trim() : '';
      })
      .filter(Boolean);
    if (srcs.length === 0) continue;
    stateFrames[visitState] = {
      srcs,
      fps: Math.max(1, Number(st.fps) || 8),
    };
  }
  if (Object.keys(stateFrames).length === 0) {
    return { ok: false, error: new Error('Aucun état avec images résolues') };
  }
  const visitPack = {
    mascotPackVersion: 1,
    id:
      String(glPack.id || 'gl-pack')
        .replace(/[^a-z0-9-]/gi, '-')
        .toLowerCase()
        .slice(0, 64) || 'gl-pack',
    label: String(glPack.name || glPack.id || 'Pack GL').slice(0, 120),
    renderer: 'sprite_cut',
    framesBase: '/assets/mascots/gl-pack/',
    frameWidth: Math.max(8, Number(glPack.frameWidth) || 64),
    frameHeight: Math.max(8, Number(glPack.frameHeight) || 64),
    pixelated: glPack.pixelated !== false,
    displayScale: glPack.displayScale != null ? Number(glPack.displayScale) : 1,
    fallbackSilhouette: String(glPack.fallbackSilhouette || 'gnome').slice(0, 40),
    stateFrames,
  };
  const validated = validateMascotPack(visitPack, {
    relaxAssetPrefix: Boolean(opts.relaxAssetPrefix),
  });
  if (!validated.ok) return { ok: false, error: validated.error };
  return {
    ok: true,
    pack: validated.pack,
    spriteCut: validated.spriteCut,
    visitPack: validated.pack,
  };
}

/**
 * @param {unknown} glPack
 * @param {{ relaxAssetPrefix?: boolean }} [opts]
 */
export function expandGlMascotPackSpriteCut(glPack, opts = {}) {
  const mapped = glMascotPackSpriteCutToVisitValidation(glPack, opts);
  if (!mapped.ok) return mapped;
  return {
    ok: true,
    spriteCut: expandMascotPackToSpriteCut(mapped.visitPack),
    visitPack: mapped.visitPack,
  };
}
