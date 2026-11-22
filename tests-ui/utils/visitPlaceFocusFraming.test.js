import { describe, test, expect } from 'vitest';

import {
  VISIT_DETAIL_SHEET_HALF_RATIO,
  VISIT_FOCUS_REVEAL_TOP_GAP_PX,
  computeVisitDetailFocusInsets,
  computeVisitMascotFocusPoints,
  computeVisitStageRevealScroll,
  shiftStageRect,
  visibleStageBandPx,
  visitDetailSidePanelWidthPx,
} from '../../src/utils/visitPlaceFocusFraming.js';

/**
 * Cadrage « zoom sur la mascotte, puis fiche » de la Visite : les marges recouvertes par la
 * fiche sont exprimées dans le cadre de la carte, pas dans la fenêtre.
 */

const phone = { width: 393, height: 851 };
const sheetTop = phone.height * (1 - VISIT_DETAIL_SHEET_HALF_RATIO);

describe('computeVisitDetailFocusInsets', () => {
  test('plein écran mobile : la feuille basse couvre 55 % du bas du cadre', () => {
    const insets = computeVisitDetailFocusInsets({
      isDesktop: false,
      stageRect: { top: 0, left: 0, width: 393, height: 851 },
      viewport: phone,
    });
    expect(insets).toEqual({
      top: 0,
      left: 0,
      right: 0,
      bottom: Math.round(851 - sheetTop),
    });
  });

  test('visite sans compte : la carte commence à mi-écran → marge bornée au cadre', () => {
    // Avant : bottom = 55 % de la fenêtre (468 px) appliqué à un cadre de 420 px de haut.
    const stageRect = { top: 443, left: 16, width: 361, height: 420 };
    const insets = computeVisitDetailFocusInsets({ isDesktop: false, stageRect, viewport: phone });
    expect(insets.bottom).toBe(420);
    expect(visibleStageBandPx(stageRect, insets)).toBe(0);
  });

  test('carte remontée en haut de page : une vraie bande reste visible au-dessus de la feuille', () => {
    const stageRect = { top: 8, left: 16, width: 361, height: 420 };
    const insets = computeVisitDetailFocusInsets({ isDesktop: false, stageRect, viewport: phone });
    expect(insets.bottom).toBe(Math.round(8 + 420 - sheetTop));
    expect(visibleStageBandPx(stageRect, insets)).toBeGreaterThan(300);
  });

  test('partie du cadre au-dessus de la fenêtre comptée en marge haute', () => {
    const insets = computeVisitDetailFocusInsets({
      isDesktop: false,
      stageRect: { top: -100, left: 0, width: 393, height: 420 },
      viewport: phone,
    });
    expect(insets.top).toBe(100);
  });

  test('ordinateur : seul ce que recouvre le panneau latéral compte à droite', () => {
    const viewport = { width: 1280, height: 800 };
    const panel = visitDetailSidePanelWidthPx(1280);
    const insets = computeVisitDetailFocusInsets({
      isDesktop: true,
      stageRect: { top: 220, left: 172, width: 936, height: 580 },
      viewport,
    });
    expect(insets.right).toBe(172 + 936 - (1280 - panel));
    expect(insets.bottom).toBe(0);
    expect(insets.top).toBe(0);
  });

  test('cadre non mesuré : repli sur les marges relatives à la fenêtre', () => {
    expect(
      computeVisitDetailFocusInsets({ isDesktop: false, stageRect: null, viewport: phone }).bottom,
    ).toBe(Math.round(851 * VISIT_DETAIL_SHEET_HALF_RATIO));
    expect(computeVisitDetailFocusInsets({ isDesktop: false, viewport: {} })).toBeNull();
  });
});

describe('computeVisitStageRevealScroll', () => {
  const stageRect = { top: 443, height: 420 };

  test('bande trop étroite : la page défile pour amener le cadre en haut', () => {
    const plan = computeVisitStageRevealScroll({
      stageRect,
      visibleBandPx: 0,
      scrollTop: 0,
      maxScrollTop: 2000,
    });
    expect(plan).toEqual({ delta: 443 - VISIT_FOCUS_REVEAL_TOP_GAP_PX, missingPx: 0 });
  });

  test('page trop courte : défilement borné et hauteur manquante signalée', () => {
    const plan = computeVisitStageRevealScroll({
      stageRect,
      visibleBandPx: 0,
      scrollTop: 0,
      maxScrollTop: 100,
    });
    expect(plan.delta).toBe(100);
    expect(plan.missingPx).toBe(443 - VISIT_FOCUS_REVEAL_TOP_GAP_PX - 100);
  });

  test('bande suffisante : rien à faire', () => {
    expect(
      computeVisitStageRevealScroll({
        stageRect,
        visibleBandPx: 260,
        scrollTop: 0,
        maxScrollTop: 2000,
      }),
    ).toEqual({ delta: 0, missingPx: 0 });
  });

  test('défilement anticipé : les marges sont recalculées pour la position d’arrivée', () => {
    const moved = shiftStageRect({ top: 443, left: 16, width: 361, height: 420 }, 435);
    expect(moved.top).toBe(8);
  });
});

describe('computeVisitMascotFocusPoints', () => {
  test('silhouette ancrée par les pieds : points au-dessus du lieu', () => {
    const points = computeVisitMascotFocusPoints({
      anchorPct: { xp: 12, yp: 50 },
      mascotSize: { width: 54, height: 62 },
      layerSize: { width: 540, height: 620 },
    });
    expect(points).toEqual([
      { xp: 12, yp: 50 },
      { xp: 7, yp: 40 },
      { xp: 17, yp: 40 },
    ]);
  });

  test('tailles inconnues : le point d’ancrage seul ; destination inconnue : rien', () => {
    expect(
      computeVisitMascotFocusPoints({ anchorPct: { xp: 1, yp: 2 }, mascotSize: null }),
    ).toEqual([{ xp: 1, yp: 2 }]);
    expect(computeVisitMascotFocusPoints({ anchorPct: null })).toEqual([]);
  });
});
