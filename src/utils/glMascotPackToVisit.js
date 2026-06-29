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
  surprise: VISIT_MASCOT_STATE.SURPRISE,
  celebrate: VISIT_MASCOT_STATE.CELEBRATE,
  inspect: VISIT_MASCOT_STATE.INSPECT,
  // Palette élargie : alias directs (1:1) pour les nouveaux états canoniques.
  sleep: VISIT_MASCOT_STATE.SLEEP,
  sleeping: VISIT_MASCOT_STATE.SLEEP,
  wave: VISIT_MASCOT_STATE.WAVE,
  hello: VISIT_MASCOT_STATE.WAVE,
  dance: VISIT_MASCOT_STATE.DANCE,
  dancing: VISIT_MASCOT_STATE.DANCE,
  eat: VISIT_MASCOT_STATE.EAT,
  eating: VISIT_MASCOT_STATE.EAT,
  search: VISIT_MASCOT_STATE.SEARCH,
  searching: VISIT_MASCOT_STATE.SEARCH,
  sad: VISIT_MASCOT_STATE.SAD,
  love: VISIT_MASCOT_STATE.LOVE,
  heart: VISIT_MASCOT_STATE.LOVE,
  point: VISIT_MASCOT_STATE.POINT,
  pointing: VISIT_MASCOT_STATE.POINT,
};

/** Normalise une clé d'état GL libre en clé personnalisée visite valide (ou '' si vide). */
function sanitizeCustomStateKey(key) {
  return String(key || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

/**
 * Mappe une clé d'état GL vers un état visite : alias connu → état canonique ;
 * sinon la clé est **préservée** comme état personnalisé (rendu via `stateFrames`).
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
  return sanitizeCustomStateKey(raw) || VISIT_MASCOT_STATE.IDLE;
}

/**
 * Adaptateur **mince** GL → visite (étape 6 de convergence). Ne fait QUE la spécificité GL :
 * - résoudre les indices `frames` → `srcs` (depuis `assets`) ;
 * - remapper les clés d'état GL vers la convention visite (`mapGlMascotStateKeyToVisit`) ;
 * - porter les `triggers` GL vers `customTriggers` (états remappés) ;
 * - fournir les **defaults de cadrage** que le schéma GL ne porte pas (frameWidth/Height,
 *   fallbackSilhouette, id, framesBase).
 *
 * Tout le reste — désucrage de la **forme unifiée `states[]`** vers `stateFrames`/`customStates`
 * (`normalizeUnifiedStates`) **et** les clamp/defaults d'animation (`fps`, `pixelated`,
 * `displayScale`) — est délégué à `validateMascotPack` / `expandMascotPackToSpriteCut`.
 * Plus aucune logique clamp/defaults dupliquée : un seul chemin (cœur visite).
 *
 * @param {import('zod').infer<typeof import('./glMascotPack.js').glMascotPackSchema>} glPack
 * @param {{ relaxAssetPrefix?: boolean }} [opts]
 * @returns {{ ok: true, pack: object, spriteCut: object, visitPack: object } | { ok: false, error: unknown }}
 */
export function glMascotPackSpriteCutToVisitValidation(glPack, opts = {}) {
  if (!glPack || glPack.renderer !== 'sprite_cut') {
    return { ok: false, error: new Error('Pack GL non sprite_cut') };
  }
  const assets = Array.isArray(glPack.assets) ? glPack.assets : [];

  // Spécificité GL : indices `frames` → `srcs` + remappage de clé, en FORME UNIFIÉE `states[]`.
  // Le désucrage (stateFrames/customStates) et le default `fps` sont délégués au cœur visite.
  const states = [];
  for (const st of glPack.states || []) {
    const key = mapGlMascotStateKeyToVisit(st.key);
    const srcs = (Array.isArray(st.frames) ? st.frames : [])
      .map((idx) => {
        const asset = assets[Number(idx)];
        return asset?.src ? String(asset.src).trim() : '';
      })
      .filter(Boolean);
    if (srcs.length === 0) continue;
    const entry = { key, srcs, label: String(st.label || st.key || key).slice(0, 60) };
    if (Number(st.fps) > 0) entry.fps = Number(st.fps);
    states.push(entry);
  }
  if (states.length === 0) {
    return { ok: false, error: new Error('Aucun état avec images résolues') };
  }

  // Déclencheurs personnalisés GL → format visite (`customTriggers`), états remappés.
  const customTriggers = (Array.isArray(glPack.triggers) ? glPack.triggers : [])
    .map((trig) => {
      const state = mapGlMascotStateKeyToVisit(trig.state);
      const out = {
        key: String(trig.key || '').slice(0, 40),
        label: String(trig.label || trig.key || 'Comportement').slice(0, 60),
        type: trig.type === 'tap' ? 'tap' : 'periodic',
        state,
        durationMs: Math.max(200, Math.min(60_000, Number(trig.durationMs) || 1000)),
      };
      if (out.type === 'periodic') {
        out.everyMs = Math.max(1000, Math.min(600_000, Number(trig.everyMs) || 10_000));
      }
      return out;
    })
    .filter((t) => t.key && t.state);

  const visitPack = {
    mascotPackVersion: customTriggers.length ? 2 : 1,
    id:
      String(glPack.id || 'gl-pack')
        .replace(/[^a-z0-9-]/gi, '-')
        .toLowerCase()
        .slice(0, 64) || 'gl-pack',
    label: String(glPack.name || glPack.id || 'Pack GL').slice(0, 120),
    renderer: 'sprite_cut',
    framesBase: '/assets/mascots/gl-pack/',
    // Defaults de cadrage spécifiques GL (le schéma GL ne porte pas ces champs).
    frameWidth: Math.max(8, Number(glPack.frameWidth) || 64),
    frameHeight: Math.max(8, Number(glPack.frameHeight) || 64),
    fallbackSilhouette: String(glPack.fallbackSilhouette || 'gnome').slice(0, 40),
    // `pixelated`/`displayScale` : transmis tels quels ; defaults/clamp appliqués par le cœur visite.
    ...(typeof glPack.pixelated === 'boolean' ? { pixelated: glPack.pixelated } : {}),
    ...(glPack.displayScale != null ? { displayScale: Number(glPack.displayScale) } : {}),
    // Forme unifiée : `normalizeUnifiedStates` désucre vers stateFrames + customStates.
    states,
    ...(customTriggers.length ? { customTriggers } : {}),
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
