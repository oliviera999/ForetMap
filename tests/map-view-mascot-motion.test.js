import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  pickMapMascotMoveTransient,
  MAP_VIEW_MASCOT_RUN_DIST_PCT,
  MAP_VIEW_MASCOT_SURPRISE_DIST_PCT,
} from '../src/utils/mapViewMascotMotion.js';
import { VISIT_MASCOT_STATE } from '../src/utils/visitMascotState.js';

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
