/**
 * Géométrie des crans de la feuille basse partagée (`BottomSheet`) — fonctions pures,
 * testables sans DOM.
 *
 * Crans : `peek` (aperçu ≈ 30 dvh), `half` (mi-hauteur ≈ 55 dvh), `full`
 * (plein = viewport − zone sûre haute − 24 px).
 */

export const BOTTOM_SHEET_SNAPS = Object.freeze(['peek', 'half', 'full']);

/** Fraction du viewport pour les crans relatifs (le cran `full` est absolu). */
const SNAP_VIEWPORT_RATIO = Object.freeze({ peek: 0.3, half: 0.55 });

/** Marge conservée au-dessus de la feuille au cran `full` (px). */
export const BOTTOM_SHEET_FULL_TOP_GAP = 24;

/** Mouvement minimal (px) avant de considérer qu'un appui est un glisser. */
export const BOTTOM_SHEET_DRAG_THRESHOLD = 4;

/** Vitesse (px/ms, vers le bas) au-delà de laquelle un relâchement ferme depuis le cran bas. */
export const BOTTOM_SHEET_FLICK_VELOCITY = 0.6;

/** Fenêtre de projection de la vitesse au relâchement (ms). */
const VELOCITY_PROJECTION_MS = 120;

/** Vitesse plafonnée (px/ms) : borne la projection sur les échantillons trop rapprochés. */
const MAX_VELOCITY = 6;

/** Sous cette fraction du cran le plus bas, relâcher ferme la feuille (`dismissOnDragDown`). */
const DISMISS_RATIO = 0.6;

/** Ordonne et filtre une liste de crans demandée (valeurs inconnues ignorées, doublons retirés). */
export function normalizeSnapPoints(snapPoints) {
  const wanted = new Set(Array.isArray(snapPoints) ? snapPoints : []);
  const ordered = BOTTOM_SHEET_SNAPS.filter((s) => wanted.has(s));
  return ordered.length > 0 ? ordered : [...BOTTOM_SHEET_SNAPS];
}

/** Cran initial valide : `initialSnap` s'il est proposé, sinon le premier cran disponible. */
export function resolveInitialSnap(snapPoints, initialSnap) {
  const points = normalizeSnapPoints(snapPoints);
  return points.includes(initialSnap) ? initialSnap : points[0];
}

/**
 * Hauteur en px de chaque cran pour un viewport donné.
 * @param {object} p
 * @param {number} p.viewportHeight hauteur du viewport (px)
 * @param {number} [p.safeTop=0] zone sûre haute (px)
 * @param {string[]} [p.snapPoints]
 * @returns {Record<string, number>}
 */
export function computeSnapHeights({ viewportHeight, safeTop = 0, snapPoints }) {
  const vh = Math.max(0, Number(viewportHeight) || 0);
  const full = Math.max(0, vh - (Number(safeTop) || 0) - BOTTOM_SHEET_FULL_TOP_GAP);
  const heights = {};
  for (const snap of normalizeSnapPoints(snapPoints)) {
    heights[snap] = snap === 'full' ? full : Math.min(full, vh * SNAP_VIEWPORT_RATIO[snap]);
  }
  return heights;
}

/**
 * Vitesse verticale (px/ms, positive = doigt vers le HAUT, donc feuille qui grandit) à partir
 * des derniers échantillons `{ t, y }`. Sans écart de temps mesurable, 0.
 */
export function releaseVelocity(samples) {
  if (!Array.isArray(samples) || samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  let first = samples[0];
  for (let i = samples.length - 2; i >= 0; i -= 1) {
    if (last.t - samples[i].t > 100) break;
    first = samples[i];
  }
  const dt = last.t - first.t;
  if (!(dt > 0)) return 0;
  return (first.y - last.y) / dt;
}

/**
 * Décide du devenir de la feuille au relâchement : aimantation au cran le plus proche de la
 * position projetée (position + vitesse), ou fermeture si l'on est passé nettement sous le
 * cran le plus bas (ou si un mouvement vif vers le bas part de ce cran).
 *
 * @param {object} p
 * @param {number} p.height hauteur courante de la feuille (px)
 * @param {number} p.velocity px/ms, positive vers le haut
 * @param {Record<string, number>} p.snapHeights issu de `computeSnapHeights`
 * @param {string} p.fromSnap cran au début du geste
 * @param {boolean} [p.dismissOnDragDown=true]
 * @returns {{ action: 'snap', snap: string } | { action: 'dismiss' }}
 */
export function resolveSnapRelease({
  height,
  velocity = 0,
  snapHeights,
  fromSnap,
  dismissOnDragDown = true,
}) {
  const entries = Object.entries(snapHeights || {}).filter(([, px]) => Number.isFinite(px));
  if (entries.length === 0) return { action: 'dismiss' };
  entries.sort((a, b) => a[1] - b[1]);
  const [lowestSnap, lowestPx] = entries[0];
  const raw = Number.isFinite(velocity) ? velocity : 0;
  const v = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, raw));
  const projected = height + v * VELOCITY_PROJECTION_MS;

  if (dismissOnDragDown) {
    if (projected < lowestPx * DISMISS_RATIO) return { action: 'dismiss' };
    if (fromSnap === lowestSnap && v < -BOTTOM_SHEET_FLICK_VELOCITY && height <= lowestPx) {
      return { action: 'dismiss' };
    }
  }

  let best = entries[0];
  for (const entry of entries) {
    if (Math.abs(entry[1] - projected) < Math.abs(best[1] - projected)) best = entry;
  }
  return { action: 'snap', snap: best[0] };
}
