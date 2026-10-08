/**
 * Géométrie pure du **mode parcours** : points des étapes, états des tronçons, chevrons de
 * sens, et décision de cadrage de la caméra. Aucun DOM, aucun React — testé par
 * `tests/route-geometry.test.js`.
 *
 * Toutes les positions sont en % du rectangle image (`{ xp, yp }`), comme le reste du noyau
 * carte ; les chevrons se calculent en pixels du calque, pour rester réguliers à l'écran.
 */
import { routeEntryFocusPct } from './mapRouteSteps.js';
import { distanceMetersBetweenPct } from '../pct-map/positionGeometry.js';
import { fitPctBoundsView } from '../pct-map/pctMapTransform.js';

/**
 * Déplacement (en % de plan) tenu pour une marche quand la carte n'a pas de taille réelle
 * connue : sans calage, on ne sait pas convertir en mètres.
 */
const WALK_TRIGGER_FALLBACK_PCT = 1.5;

/**
 * Points dessinables d'un parcours, dans l'ordre. Une étape sans coordonnées exploitables
 * (zone sans polygone) est sautée, mais garde son numéro : le tracé relie alors l'étape
 * précédente à la suivante.
 * @param {Array<{ index: number, number: number, place: object }>} steps étapes résolues.
 * @returns {Array<{ xp: number, yp: number, index: number, number: number }>}
 */
export function routeStepPoints(steps) {
  const out = [];
  for (const entry of steps || []) {
    const pct = routeEntryFocusPct(entry);
    if (!pct || !Number.isFinite(pct.xp) || !Number.isFinite(pct.yp)) continue;
    out.push({ xp: pct.xp, yp: pct.yp, index: Number(entry.index), number: Number(entry.number) });
  }
  return out;
}

/**
 * État d'une étape pour son rendu : `overview` (vue d'ensemble), `done` (déjà passée),
 * `current` (étape en cours) ou `upcoming` (à venir).
 */
export function routeStepState(stepIndex, { phase = 'steps', currentIndex = 0 } = {}) {
  if (phase !== 'steps') return 'overview';
  if (stepIndex < currentIndex) return 'done';
  if (stepIndex === currentIndex) return 'current';
  return 'upcoming';
}

/**
 * Tronçons du tracé complet (étape i → étape suivante), avec l'état de leur **arrivée** : le
 * tronçon qui mène à l'étape courante est `current`, ceux d'avant sont `done`.
 * @returns {Array<{ from: object, to: object, state: string }>}
 */
export function routeSegments(points, { phase = 'steps', currentIndex = 0 } = {}) {
  const segments = [];
  for (let i = 0; i + 1 < (points || []).length; i += 1) {
    const from = points[i];
    const to = points[i + 1];
    segments.push({ from, to, state: routeStepState(to.index, { phase, currentIndex }) });
  }
  return segments;
}

/**
 * Chevrons de sens le long d'un segment, en pixels du calque : un tous les `spacingPx`,
 * centrés dans le segment ; un seul au milieu d'un segment trop court pour deux. Rien sous
 * `minLengthPx` (deux étapes presque confondues : une flèche n'y dirait rien de lisible).
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @param {{ spacingPx: number, minLengthPx?: number }} options
 * @returns {Array<{ x: number, y: number, angleDeg: number }>}
 */
export function segmentChevrons(a, b, { spacingPx, minLengthPx = 0 } = {}) {
  const dx = Number(b?.x) - Number(a?.x);
  const dy = Number(b?.y) - Number(a?.y);
  const length = Math.hypot(dx, dy);
  const spacing = Number(spacingPx);
  if (!Number.isFinite(length) || length <= 0 || !(spacing > 0)) return [];
  if (length < minLengthPx) return [];
  const count = Math.max(1, Math.floor(length / spacing));
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const t = (i + 0.5) / count;
    out.push({ x: a.x + dx * t, y: a.y + dy * t, angleDeg });
  }
  return out;
}

/** % du rectangle image → pixels du calque. */
export function pctToLayerPx(pct, widthPx, heightPx) {
  return { x: (Number(pct?.xp) / 100) * widthPx, y: (Number(pct?.yp) / 100) * heightPx };
}

/**
 * La personne a-t-elle commencé à marcher depuis le début de l'étape ? En mètres si la carte
 * est calée (taille réelle connue), sinon en % de plan.
 */
export function hasWalkedFrom(startPct, currentPct, planSize, triggerM) {
  if (!startPct || !currentPct) return false;
  const meters = distanceMetersBetweenPct(startPct, currentPct, planSize);
  if (meters != null) return meters >= Number(triggerM || 0);
  const dpct = Math.hypot(
    Number(currentPct.xp) - Number(startPct.xp),
    Number(currentPct.yp) - Number(startPct.yp),
  );
  return dpct >= WALK_TRIGGER_FALLBACK_PCT;
}

/**
 * Décision de cadrage, indépendante de l'écran :
 *   - vue d'ensemble : toutes les étapes ;
 *   - étape, position connue : la position **et** l'étape, tant qu'on n'a pas commencé à
 *     marcher ; puis le suivi de marche (`walk`) ;
 *   - étape sans position : l'étape précédente et la courante — le cadrage montre le sens —,
 *     ou l'étape seule au départ.
 * @returns {{ mode: 'bounds', points: Array<object> }|{ mode: 'walk', positionPct: object,
 *   targetPct: object|null }|null}
 */
export function routeCameraPlan({
  phase = 'steps',
  stepPoints = [],
  currentIndex = 0,
  positionPct = null,
  targetPct = null,
  walking = false,
} = {}) {
  if (phase === 'overview') {
    return stepPoints.length ? { mode: 'bounds', points: stepPoints } : null;
  }
  if (positionPct && targetPct) {
    return walking
      ? { mode: 'walk', positionPct, targetPct }
      : { mode: 'bounds', points: [positionPct, targetPct] };
  }
  if (targetPct) {
    let previous = null;
    for (const point of stepPoints) {
      if (point.index < currentIndex) previous = point;
    }
    return { mode: 'bounds', points: previous ? [previous, targetPct] : [targetPct] };
  }
  if (positionPct) return { mode: 'walk', positionPct, targetPct: null };
  return null;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Centre de la vue en marche : la personne, **décalée vers l'étape**. Sur chaque axe, le centre
 * se place à mi-chemin de la cible, sans jamais éloigner la personne du centre de plus de
 * `lookahead` × la demi-vue. Étape proche : les deux tiennent à l'écran ; étape lointaine : la
 * personne glisse vers le bord opposé et la vue s'ouvre sur la ligne à suivre.
 * @param {{ positionPct: object, targetPct: object|null, spanPct: { w: number, h: number },
 *   lookahead: number }} args `spanPct` : taille de la zone visible, en % de plan.
 */
export function walkingCenterPct({ positionPct, targetPct, spanPct, lookahead = 0.6 }) {
  const p = { xp: Number(positionPct.xp), yp: Number(positionPct.yp) };
  if (!targetPct) return p;
  const k = clamp(Number(lookahead) || 0, 0, 0.9);
  const maxX = (Math.max(0, Number(spanPct?.w) || 0) / 2) * k;
  const maxY = (Math.max(0, Number(spanPct?.h) || 0) / 2) * k;
  return {
    xp: p.xp + clamp((Number(targetPct.xp) - p.xp) / 2, -maxX, maxX),
    yp: p.yp + clamp((Number(targetPct.yp) - p.yp) / 2, -maxY, maxY),
  };
}

/**
 * Traduit une décision de cadrage en vue concrète (`{ centerPct, scale }`) pour un écran donné.
 * Le résultat passe ensuite par le suivi continu du moteur de vue, qui borne la translation :
 * près d'un bord du plan, la vue se cale sur le plan au lieu d'en montrer le vide, et la ligne
 * reste devant soi.
 *
 * @param {object} plan sortie de `routeCameraPlan`.
 * @param {object} view
 * @param {{ w: number, h: number }} view.stage taille du cadre (px).
 * @param {{ width: number, height: number }} view.fitRect rectangle image à l'échelle 1 (px).
 * @param {{ top?: number, right?: number, bottom?: number, left?: number }|null} [view.insets]
 *   bords recouverts (barre d'étape).
 * @param {number} [view.fitScale=1] échelle « carte entière ».
 * @param {number} [view.walkingZoom=3] zoom de marche, en multiple de la carte entière.
 * @param {number} [view.lookahead=0.6]
 * @param {number} [view.paddingPx=56] marge autour d'un cadrage.
 * @returns {{ centerPct: { xp: number, yp: number }, scale: number }|null}
 */
export function routeCameraView(
  plan,
  { stage, fitRect, insets = null, fitScale = 1, walkingZoom = 3, lookahead = 0.6, paddingPx = 56 },
) {
  if (!plan) return null;
  const sw = Number(stage?.w) || 0;
  const sh = Number(stage?.h) || 0;
  const fw = Number(fitRect?.width) || 0;
  const fh = Number(fitRect?.height) || 0;
  if (!(sw > 0) || !(sh > 0) || !(fw > 0) || !(fh > 0)) return null;
  const visibleW = Math.max(1, sw - (Number(insets?.left) || 0) - (Number(insets?.right) || 0));
  const visibleH = Math.max(1, sh - (Number(insets?.top) || 0) - (Number(insets?.bottom) || 0));
  const fit = Number(fitScale) > 0 ? Number(fitScale) : 1;
  const maxScale = fit * Math.max(1, Number(walkingZoom) || 1);
  if (plan.mode === 'walk') {
    const scale = maxScale;
    const spanPct = { w: (visibleW / (fw * scale)) * 100, h: (visibleH / (fh * scale)) * 100 };
    return {
      centerPct: walkingCenterPct({
        positionPct: plan.positionPct,
        targetPct: plan.targetPct,
        spanPct,
        lookahead,
      }),
      scale,
    };
  }
  return fitPctBoundsView(plan.points, {
    visibleW,
    visibleH,
    fitRect: { width: fw, height: fh },
    paddingPx,
    minScale: fit,
    maxScale,
  });
}
