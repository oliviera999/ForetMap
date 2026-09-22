import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampMapMascotPctForViewport,
  pickMapMascotMoveTransient,
  resolveMapViewMascotFitScale,
  MAP_VIEW_MASCOT_ESTIMATED_HEIGHT_PX,
  MAP_VIEW_MASCOT_MAX_Y_PCT,
  MAP_VIEW_MASCOT_RUN_DIST_PCT,
  MAP_VIEW_MASCOT_SURPRISE_DIST_PCT,
} from '../src/utils/mapViewMascotMotion.js';
import { VISIT_MASCOT_STATE } from '../src/utils/visitMascotState.js';

describe('resolveMapViewMascotFitScale', () => {
  it('vaut 1 au repos (échelle monde 1, SharedMapStage contentMode stage)', () => {
    assert.equal(resolveMapViewMascotFitScale(1), 1);
  });

  it('ne rétrécit pas la mascotte quand on zoome sur un lieu (s > 1)', () => {
    // Régression : `1/s` seul faisait disparaître la mascotte sur la carte tâches.
    assert.equal(resolveMapViewMascotFitScale(2), 1);
    assert.equal(resolveMapViewMascotFitScale(8), 1);
  });

  it('compense un dézoom (s < 1) pour garder une taille d’écran lisible', () => {
    assert.equal(resolveMapViewMascotFitScale(0.5), 2);
    assert.equal(resolveMapViewMascotFitScale(0.25), 4);
  });

  it('repli sur 1 si l’échelle est invalide', () => {
    assert.equal(resolveMapViewMascotFitScale(0), 1);
    assert.equal(resolveMapViewMascotFitScale(NaN), 1);
    assert.equal(resolveMapViewMascotFitScale(-1), 1);
  });
});

describe('pickMapMascotMoveTransient', () => {
  it('retourne null sous le seuil surprise', () => {
    assert.equal(pickMapMascotMoveTransient(MAP_VIEW_MASCOT_SURPRISE_DIST_PCT - 1), null);
  });

  it('retourne surprise entre les seuils', () => {
    const t = pickMapMascotMoveTransient(12);
    assert.equal(t?.state, VISIT_MASCOT_STATE.SURPRISE);
    assert.ok(t.durationMs > 0);
  });

  it('retourne running au-delà du seuil course', () => {
    const t = pickMapMascotMoveTransient(MAP_VIEW_MASCOT_RUN_DIST_PCT + 1);
    assert.equal(t?.state, VISIT_MASCOT_STATE.RUNNING);
  });
});

describe('clampMapMascotPctForViewport', () => {
  it('laisse la position telle quelle quand la hauteur du plan est inconnue', () => {
    assert.deepEqual(clampMapMascotPctForViewport(42, 63, 0), { xp: 42, yp: 63 });
  });

  it('remonte la mascotte juste assez pour ne pas la couper en bas', () => {
    const { yp } = clampMapMascotPctForViewport(50, 1, 780);
    assert.equal(yp, (MAP_VIEW_MASCOT_ESTIMATED_HEIGHT_PX / 780) * 100);
  });

  it('ne sort JAMAIS la mascotte du plan, même sans hauteur mesurée', () => {
    // Régression : `imgSize` vaut `{ w: 1, h: 1 }` tant que le viewport n'a rien mesuré ;
    // la marge basse valait alors 7800 % et la mascotte partait 25 000 px sous la carte de
    // travail des tâches, donc invisible.
    for (const fitHeightPx of [1, 2, 10, 77]) {
      const { yp } = clampMapMascotPctForViewport(50, 50, fitHeightPx);
      assert.ok(yp <= MAP_VIEW_MASCOT_MAX_Y_PCT, `yp=${yp} hors plan pour h=${fitHeightPx}`);
      assert.ok(yp >= 0);
    }
  });

  it('plafonne l’ordonnée au bas du plan', () => {
    assert.equal(clampMapMascotPctForViewport(50, 100, 780).yp, MAP_VIEW_MASCOT_MAX_Y_PCT);
  });

  it('borne l’abscisse dans [0,100]', () => {
    assert.equal(clampMapMascotPctForViewport(-20, 50, 780).xp, 0);
    assert.equal(clampMapMascotPctForViewport(140, 50, 780).xp, 100);
  });
});
