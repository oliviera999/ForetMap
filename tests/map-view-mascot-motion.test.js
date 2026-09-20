import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  pickMapMascotMoveTransient,
  resolveMapViewMascotFitScale,
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
