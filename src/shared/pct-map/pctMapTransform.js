/**
 * Géométrie pure du pan/zoom d'une carte « % image » (noyau carte partagé, lot 2 du plan de
 * convergence — `docs/AUDIT_CONVERGENCE_APPS_2026-09.md` §5.2 « Noyau carte »).
 *
 * Transform = `{ x, y, s }` : translation écran (px) + échelle appliquées au calque monde
 * (`transform-origin: 0 0`). Le contenu (image en px naturels pour la carte de travail, scène
 * entière pour la Visite et les plateaux G&L) mesure `content.w × content.h` px à l'échelle 1.
 *
 * Généralise `visitMapTransform.js` (bornes [1, 8], contenu = scène) :
 *   - bornes « contain » : le contenu ne sort jamais du cadre quand il est plus grand que lui,
 *     et reste entièrement dans le cadre quand il est plus petit (dézoom sous le cadre autorisé) ;
 *   - échelle minimale paramétrable (au-dessous de l'échelle d'ajustement) ;
 *   - élasticité : dépassement amorti pendant le geste, retour en butée en fin de geste.
 * Aucune dépendance DOM : testable en environnement node.
 */

/** Bornes d'échelle par défaut (mêmes valeurs que la carte de travail et la Visite). */
export const PCT_MAP_SCALE_MIN_DEFAULT = 0.15;
export const PCT_MAP_SCALE_MAX_DEFAULT = 8;

/** Part du dépassement restituée pendant un geste (effet « élastique »). */
export const PCT_MAP_ELASTIC_RATIO = 0.35;

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Borne une échelle dans `[min, max]` ; valeur non numérique ou nulle → `min`.
 * @param {number} scale
 * @param {{ min?: number, max?: number }} [limits]
 */
export function clampPctMapScale(
  scale,
  { min = PCT_MAP_SCALE_MIN_DEFAULT, max = PCT_MAP_SCALE_MAX_DEFAULT } = {},
) {
  const lo = Math.max(1e-6, num(min, PCT_MAP_SCALE_MIN_DEFAULT));
  const hi = Math.max(lo, num(max, PCT_MAP_SCALE_MAX_DEFAULT));
  const s = num(scale, 0) > 0 ? Number(scale) : lo;
  return Math.max(lo, Math.min(hi, s));
}

/**
 * Transformation d'ajustement : contenu entier visible, centré dans le cadre, sans agrandir
 * au-delà de `maxFitScale` (1 par défaut : une image plus petite que le cadre n'est pas étirée).
 * @param {{ w: number, h: number }} content taille du contenu à l'échelle 1.
 * @param {{ w: number, h: number }} stage taille du cadre (px).
 * @param {{ maxFitScale?: number }} [options]
 * @returns {{ x: number, y: number, s: number }}
 */
export function fitPctMapTransform(content, stage, { maxFitScale = 1 } = {}) {
  const cw = Math.max(1, num(content?.w, 1));
  const ch = Math.max(1, num(content?.h, 1));
  const sw = Math.max(1, num(stage?.w, 1));
  const sh = Math.max(1, num(stage?.h, 1));
  const s = Math.min(sw / cw, sh / ch, num(maxFitScale, 1) > 0 ? Number(maxFitScale) : 1);
  return { x: (sw - cw * s) / 2, y: (sh - ch * s) / 2, s };
}

/**
 * Intervalle autorisé d'une translation sur un axe : contenu plus grand que le cadre →
 * `[stage − content·s, 0]` (jamais de bord visible) ; plus petit → `[0, stage − content·s]`
 * (entièrement dans le cadre).
 * @returns {{ lo: number, hi: number }}
 */
export function pctMapAxisRange(contentPx, stagePx, scale) {
  const overflow = num(stagePx, 0) - num(contentPx, 0) * num(scale, 1);
  return { lo: Math.min(0, overflow), hi: Math.max(0, overflow) };
}

/**
 * Borne une transformation candidate au cadre (« contain »).
 * Sans cadre exploitable, seule l'échelle est bornée.
 * @param {{ x?: number, y?: number, s?: number }} next
 * @param {{ content: { w: number, h: number }, stage: { w: number, h: number }|null, min?: number, max?: number }} bounds
 * @returns {{ x: number, y: number, s: number }}
 */
export function clampPctMapTransform(next, bounds) {
  const s = clampPctMapScale(next?.s, bounds);
  const stage = bounds?.stage;
  if (!stage || !(num(stage.w) > 0) || !(num(stage.h) > 0)) {
    return { x: num(next?.x), y: num(next?.y), s };
  }
  const content = bounds.content || stage;
  const rx = pctMapAxisRange(content.w, stage.w, s);
  const ry = pctMapAxisRange(content.h, stage.h, s);
  return {
    x: Math.min(rx.hi, Math.max(rx.lo, num(next?.x))),
    y: Math.min(ry.hi, Math.max(ry.lo, num(next?.y))),
    s,
  };
}

/**
 * Variante élastique pour les frames de geste : au-delà des butées, seule une fraction du
 * dépassement est restituée (`PCT_MAP_ELASTIC_RATIO`), le retour en butée se faisant en fin
 * de geste via `clampPctMapTransform`.
 */
export function elasticPctMapTransform(next, bounds, ratio = PCT_MAP_ELASTIC_RATIO) {
  const clamped = clampPctMapTransform(next, bounds);
  const k = Math.max(0, Math.min(1, num(ratio, PCT_MAP_ELASTIC_RATIO)));
  return {
    x: clamped.x + (num(next?.x) - clamped.x) * k,
    y: clamped.y + (num(next?.y) - clamped.y) * k,
    s: clamped.s,
  };
}

/**
 * Zoom vers `nextScale` en gardant le point (px, py) — coordonnées cadre en px —
 * visuellement fixe : x' = px − (px − x)·(s'/s). Résultat borné (`clamp`) ou élastique.
 * Sert la molette, le pinch (échelle = s₀·dist/dist₀), le double-tap et chaque pas des
 * animations de zoom.
 * @param {{ x?: number, y?: number, s?: number }} from
 * @param {number} px
 * @param {number} py
 * @param {number} nextScale
 * @param {object} bounds cf. `clampPctMapTransform`
 * @param {{ elastic?: boolean }} [options]
 */
export function zoomPctMapTransformToScale(
  from,
  px,
  py,
  nextScale,
  bounds,
  { elastic = false } = {},
) {
  const fromScale = num(from?.s, 1) > 0 ? Number(from.s) : 1;
  const s = clampPctMapScale(nextScale, bounds);
  const ratio = s / fromScale;
  const candidate = {
    s,
    x: num(px) - (num(px) - num(from?.x)) * ratio,
    y: num(py) - (num(py) - num(from?.y)) * ratio,
  };
  return elastic
    ? elasticPctMapTransform(candidate, bounds)
    : clampPctMapTransform(candidate, bounds);
}

/**
 * Pinch à deux doigts avec point médian vivant : le point du contenu qui était sous le
 * médian initial reste sous le médian courant (pinch + déplacement dans le même geste).
 * @param {{ x: number, y: number, s: number }} start transformation au début du pinch.
 * @param {{ x: number, y: number, dist: number }} startMid médian et écartement initiaux (px cadre).
 * @param {{ x: number, y: number, dist: number }} mid médian et écartement courants.
 * @param {object} bounds
 */
export function pinchPctMapTransform(start, startMid, mid, bounds) {
  const s0 = num(start?.s, 1) > 0 ? Number(start.s) : 1;
  const d0 = Math.max(1, num(startMid?.dist, 1));
  const d1 = Math.max(1, num(mid?.dist, 1));
  const s = clampPctMapScale(s0 * (d1 / d0), bounds);
  const ratio = s / s0;
  return elasticPctMapTransform(
    {
      s,
      x: num(mid?.x) - (num(startMid?.x) - num(start?.x)) * ratio,
      y: num(mid?.y) - (num(startMid?.y) - num(start?.y)) * ratio,
    },
    bounds,
  );
}

/**
 * Transformation qui place le point contenu (`xp`, `yp` en % du rectangle image) au centre
 * du cadre, à l'échelle `scale`, bornée au cadre.
 * @param {{ xp: number, yp: number }} pct
 * @param {number} scale
 * @param {object} bounds `{ content, stage, min, max }`
 * @param {{ offsetX?: number, offsetY?: number, width?: number, height?: number }} [fitRect]
 *   rectangle de l'image dans le contenu (mode « scène » : image en `object-fit: contain`).
 */
export function centerPctMapTransformOnPct(pct, scale, bounds, fitRect = null) {
  const content = bounds?.content || { w: 1, h: 1 };
  const stage = bounds?.stage || { w: 1, h: 1 };
  const s = clampPctMapScale(scale, bounds);
  const fw = fitRect && num(fitRect.width) > 0 ? Number(fitRect.width) : num(content.w, 1);
  const fh = fitRect && num(fitRect.height) > 0 ? Number(fitRect.height) : num(content.h, 1);
  const fox = fitRect && num(fitRect.width) > 0 ? num(fitRect.offsetX) : 0;
  const foy = fitRect && num(fitRect.height) > 0 ? num(fitRect.offsetY) : 0;
  const cx = fox + (num(pct?.xp) / 100) * fw;
  const cy = foy + (num(pct?.yp) / 100) * fh;
  return clampPctMapTransform(
    { s, x: num(stage.w) / 2 - cx * s, y: num(stage.h) / 2 - cy * s },
    bounds,
  );
}

/** Accélération de retombée de l'inertie (px/ms²) — décroissance exponentielle de la vitesse. */
export const PCT_MAP_INERTIA_FRICTION = 0.0045;
/** Vitesse (px/ms) sous laquelle un relâchement ne déclenche pas d'inertie. */
export const PCT_MAP_INERTIA_MIN_VELOCITY = 0.05;
/** Vitesse (px/ms) sous laquelle l'inertie s'arrête. */
export const PCT_MAP_INERTIA_STOP_VELOCITY = 0.02;

/**
 * Vitesse (px/ms) estimée à partir des derniers échantillons d'un déplacement.
 * @param {Array<{ x: number, y: number, t: number }>} samples chronologiques.
 * @param {{ windowMs?: number }} [options] fenêtre d'échantillons prise en compte (défaut 100 ms).
 * @returns {{ vx: number, vy: number }}
 */
export function pctMapReleaseVelocity(samples, { windowMs = 100 } = {}) {
  const list = Array.isArray(samples) ? samples.filter(Boolean) : [];
  if (list.length < 2) return { vx: 0, vy: 0 };
  const last = list[list.length - 1];
  let first = list[0];
  for (let i = list.length - 2; i >= 0; i -= 1) {
    if (last.t - list[i].t > windowMs) break;
    first = list[i];
  }
  const dt = num(last.t) - num(first.t);
  if (!(dt > 0)) return { vx: 0, vy: 0 };
  return { vx: (num(last.x) - num(first.x)) / dt, vy: (num(last.y) - num(first.y)) / dt };
}

/**
 * Pas d'inertie : avance la translation selon la vitesse courante puis freine.
 * @param {{ x: number, y: number, s: number }} tx
 * @param {{ vx: number, vy: number }} velocity px/ms.
 * @param {number} dtMs
 * @param {object} bounds
 * @returns {{ tx: { x: number, y: number, s: number }, velocity: { vx: number, vy: number }, done: boolean }}
 */
export function pctMapInertiaStep(tx, velocity, dtMs, bounds) {
  const dt = Math.max(0, Math.min(64, num(dtMs, 16)));
  const decay = Math.exp(-PCT_MAP_INERTIA_FRICTION * dt * 4);
  const vx = num(velocity?.vx) * decay;
  const vy = num(velocity?.vy) * decay;
  const moved = { x: num(tx?.x) + vx * dt, y: num(tx?.y) + vy * dt, s: num(tx?.s, 1) };
  const clamped = clampPctMapTransform(moved, bounds);
  // Butée atteinte sur un axe : la vitesse y est annulée (pas de rebond).
  const nextVx = Math.abs(clamped.x - moved.x) > 1e-6 ? 0 : vx;
  const nextVy = Math.abs(clamped.y - moved.y) > 1e-6 ? 0 : vy;
  const done = Math.hypot(nextVx, nextVy) < PCT_MAP_INERTIA_STOP_VELOCITY;
  return { tx: clamped, velocity: { vx: nextVx, vy: nextVy }, done };
}

/** Égalité approchée de deux transformations (évite un re-render sans changement visible). */
export function pctMapTransformEquals(a, b, { epsilon = 0.5, scaleEpsilon = 1e-4 } = {}) {
  if (!a || !b) return false;
  return (
    Math.abs(num(a.x) - num(b.x)) < epsilon &&
    Math.abs(num(a.y) - num(b.y)) < epsilon &&
    Math.abs(num(a.s, 1) - num(b.s, 1)) < scaleEpsilon
  );
}
