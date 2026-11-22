/**
 * Cadrage « zoom sur la mascotte, puis fiche » de la Visite.
 *
 * Avant ce module, les marges recouvertes par la fiche étaient calculées par rapport à la
 * **fenêtre** (55 % de sa hauteur sous la feuille basse) puis appliquées au **cadre de la
 * carte**. En visite sans compte sur mobile, la carte commence à mi-écran : la marge dépassait
 * la hauteur du cadre, le lieu était plaqué contre son bord haut et la mascotte, dessinée
 * au-dessus de son point d'ancrage, sortait de l'écran quand la fiche s'ouvrait.
 *
 * Tout est exprimé ici en pixels CSS du cadre de la carte (repère de `flyToPctBounds`).
 * Fonctions pures, testées dans `tests-ui/utils/visitPlaceFocusFraming.test.js`.
 */

/** Hauteur de la feuille basse au cran « moitié » (fraction de la fenêtre, `55dvh`). */
export const VISIT_DETAIL_SHEET_HALF_RATIO = 0.55;

/** Bande de carte visible minimale sous laquelle on fait d'abord défiler la page (px). */
export const VISIT_FOCUS_MIN_VISIBLE_BAND_PX = 200;

/** Marge laissée au-dessus du cadre de la carte quand la page défile pour le montrer (px). */
export const VISIT_FOCUS_REVEAL_TOP_GAP_PX = 8;

function finite(n, fallback = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fallback;
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

/** Largeur du panneau latéral (≥ 1024 px), marge comprise — miroir du CSS de la fiche. */
export function visitDetailSidePanelWidthPx(viewportWidth) {
  return Math.round(Math.min(420, finite(viewportWidth) * 0.36)) + 24;
}

/**
 * Marges du cadre de la carte qui ne seront **pas visibles** une fois la fiche ouverte : parties
 * hors de la fenêtre, et part recouverte par la fiche (feuille basse au cran « moitié » sur
 * mobile, panneau latéral sur ordinateur).
 *
 * @param {object} params
 * @param {boolean} params.isDesktop panneau latéral (≥ 1024 px) plutôt que feuille basse.
 * @param {{ top: number, left: number, width: number, height: number }} params.stageRect
 *   rectangle du cadre de la carte dans la fenêtre (`getBoundingClientRect`).
 * @param {{ width: number, height: number }} params.viewport taille de la fenêtre.
 * @returns {{ top: number, right: number, bottom: number, left: number }|null}
 */
export function computeVisitDetailFocusInsets({ isDesktop, stageRect, viewport }) {
  const vw = finite(viewport?.width);
  const vh = finite(viewport?.height);
  if (!(vw > 0) || !(vh > 0)) return null;
  const w = finite(stageRect?.width);
  const h = finite(stageRect?.height);
  if (!(w > 0) || !(h > 0)) {
    // Cadre non mesuré : repli historique (marges relatives à la fenêtre).
    return isDesktop
      ? { top: 0, right: visitDetailSidePanelWidthPx(vw), bottom: 0, left: 0 }
      : { top: 0, right: 0, bottom: Math.round(vh * VISIT_DETAIL_SHEET_HALF_RATIO), left: 0 };
  }
  const top = finite(stageRect.top);
  const left = finite(stageRect.left);
  const bottomEdge = top + h;
  const rightEdge = left + w;

  // Bas de la zone utile de la fenêtre : la feuille basse en recouvre la moitié basse.
  const usableBottom = isDesktop ? vh : vh * (1 - VISIT_DETAIL_SHEET_HALF_RATIO);
  const usableRight = isDesktop ? vw - visitDetailSidePanelWidthPx(vw) : vw;

  return {
    top: Math.round(clamp(-top, 0, h)),
    left: Math.round(clamp(-left, 0, w)),
    bottom: Math.round(clamp(bottomEdge - usableBottom, 0, h)),
    right: Math.round(clamp(rightEdge - usableRight, 0, w)),
  };
}

/** Hauteur de carte qui restera visible avec ces marges (px). */
export function visibleStageBandPx(stageRect, insets) {
  const h = finite(stageRect?.height);
  if (!insets) return h;
  return Math.max(0, h - finite(insets.top) - finite(insets.bottom));
}

/**
 * Défilement à appliquer pour que le cadre de la carte reste visible au-dessus de la fiche :
 * quand la bande visible est trop étroite pour y voir la mascotte, le haut du cadre remonte
 * près du haut de la fenêtre.
 *
 * @param {object} params
 * @param {{ top: number, height: number }} params.stageRect
 * @param {number} params.visibleBandPx bande visible calculée avec les marges actuelles.
 * @param {number} params.scrollTop défilement actuel du conteneur.
 * @param {number} params.maxScrollTop défilement maximal du conteneur.
 * @param {number} [params.containerTop=0] haut visible du conteneur dans la fenêtre.
 * @param {number} [params.minBandPx]
 * @returns {{ delta: number, missingPx: number }} `delta` à ajouter à `scrollTop` (borné par
 *   ce que le conteneur peut défiler) ; `missingPx` : hauteur qui manque en bas de page pour
 *   défiler jusqu'au bout (page trop courte, cas de la visite sans compte).
 */
export function computeVisitStageRevealScroll({
  stageRect,
  visibleBandPx,
  scrollTop,
  maxScrollTop,
  containerTop = 0,
  minBandPx = VISIT_FOCUS_MIN_VISIBLE_BAND_PX,
}) {
  const none = { delta: 0, missingPx: 0 };
  const h = finite(stageRect?.height);
  if (!(h > 0)) return none;
  // Une carte plus basse que le seuil ne peut pas faire mieux que sa propre hauteur.
  if (finite(visibleBandPx) >= Math.min(minBandPx, h * 0.6)) return none;
  const wanted = finite(stageRect.top) - finite(containerTop) - VISIT_FOCUS_REVEAL_TOP_GAP_PX;
  const current = finite(scrollTop);
  const max = Math.max(0, finite(maxScrollTop));
  const delta = clamp(current + wanted, 0, max) - current;
  const missingPx = Math.max(0, Math.ceil(current + wanted - max));
  return { delta: Math.abs(delta) < 1 ? 0 : Math.round(delta), missingPx };
}

/**
 * Applique un défilement anticipé aux marges : le cadre se déplace de `-delta` dans la fenêtre.
 * @param {{ top: number, left: number, width: number, height: number }} stageRect
 * @param {number} delta
 */
export function shiftStageRect(stageRect, delta) {
  return { ...stageRect, top: finite(stageRect?.top) - finite(delta) };
}

/**
 * Points (% du plan) que la mascotte occupera à sa destination : elle est ancrée **par les
 * pieds** (`translate(-50%, -100%)`), son corps et sa bulle s'élèvent au-dessus du point. Les
 * ajouter au cadrage du lieu garde la mascotte entière à l'écran (« zoom sur la mascotte »).
 *
 * Les tailles sont lues dans le même calque zoomé que la carte : leur rapport ne dépend pas
 * du zoom courant.
 *
 * @param {object} params
 * @param {{ xp: number, yp: number }|null} params.anchorPct pieds de la mascotte à l'arrivée.
 * @param {{ width: number, height: number }|null} params.mascotSize taille affichée (px).
 * @param {{ width: number, height: number }|null} params.layerSize taille affichée du calque
 *   « fit » de la carte (px, même zoom que la mascotte).
 * @returns {Array<{ xp: number, yp: number }>}
 */
export function computeVisitMascotFocusPoints({ anchorPct, mascotSize, layerSize }) {
  const xp = finite(anchorPct?.xp, NaN);
  const yp = finite(anchorPct?.yp, NaN);
  if (!Number.isFinite(xp) || !Number.isFinite(yp)) return [];
  const lw = finite(layerSize?.width);
  const lh = finite(layerSize?.height);
  const mw = finite(mascotSize?.width);
  const mh = finite(mascotSize?.height);
  if (!(lw > 0) || !(lh > 0) || !(mw > 0) || !(mh > 0)) return [{ xp, yp }];
  const halfWPct = ((mw / lw) * 100) / 2;
  const hPct = (mh / lh) * 100;
  const topYp = yp - hPct;
  return [
    { xp, yp },
    { xp: xp - halfWPct, yp: topYp },
    { xp: xp + halfWPct, yp: topYp },
  ];
}

/**
 * Conteneur qui fait défiler la carte : premier ancêtre défilant verticalement, sinon la page.
 * @param {Element|null} el
 * @returns {Element|null}
 */
export function findVisitScrollContainer(el) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  let node = el?.parentElement || null;
  while (node && node !== document.body && node !== document.documentElement) {
    const style = window.getComputedStyle(node);
    const oy = style?.overflowY || '';
    if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight + 1) {
      return node;
    }
    node = node.parentElement;
  }
  return document.scrollingElement || document.documentElement || null;
}

/**
 * Marges du cadre de la carte pour la fiche à venir, après avoir fait défiler la page si la
 * carte serait presque entièrement cachée par la feuille basse (visite sans compte sur mobile :
 * la carte commence à mi-écran). Le défilement est lancé (doux sauf mouvement réduit) et les
 * marges sont calculées pour la position **d'arrivée** : la caméra et la page bougent ensemble.
 *
 * Page trop courte pour défiler jusque-là : `ensureScrollRoom(px)` doit allonger la page de
 * `px` **de façon synchrone** (cale sous la visite, rendue avec `flushSync`).
 *
 * @param {Element|null} stageEl cadre de la carte.
 * @param {{ isDesktop: boolean, prefersReducedMotion?: boolean,
 *   ensureScrollRoom?: (px: number) => void }} options
 * @returns {{ top: number, right: number, bottom: number, left: number }|null}
 */
export function prepareVisitDetailFocusInsets(
  stageEl,
  { isDesktop, prefersReducedMotion = false, ensureScrollRoom = null },
) {
  if (typeof window === 'undefined') return null;
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const rect =
    stageEl && typeof stageEl.getBoundingClientRect === 'function'
      ? stageEl.getBoundingClientRect()
      : null;
  let stageRect = rect
    ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
    : null;
  let insets = computeVisitDetailFocusInsets({ isDesktop, stageRect, viewport });
  if (!stageRect || !insets) return insets;

  const scroller = findVisitScrollContainer(stageEl);
  if (!scroller) return insets;
  const isPage = scroller === document.scrollingElement || scroller === document.documentElement;
  const containerTop = isPage ? 0 : Math.max(0, scroller.getBoundingClientRect().top);
  const measure = () =>
    computeVisitStageRevealScroll({
      stageRect,
      visibleBandPx: visibleStageBandPx(stageRect, insets),
      scrollTop: scroller.scrollTop,
      maxScrollTop: scroller.scrollHeight - scroller.clientHeight,
      containerTop,
    });
  let plan = measure();
  if (plan.missingPx > 0 && typeof ensureScrollRoom === 'function') {
    ensureScrollRoom(plan.missingPx);
    plan = measure();
  }
  if (plan.delta === 0) return insets;
  try {
    const behavior = prefersReducedMotion ? 'auto' : 'smooth';
    if (isPage) window.scrollBy({ top: plan.delta, behavior });
    else scroller.scrollBy({ top: plan.delta, behavior });
  } catch {
    return insets;
  }
  stageRect = shiftStageRect(stageRect, plan.delta);
  insets = computeVisitDetailFocusInsets({ isDesktop, stageRect, viewport });
  return insets;
}
