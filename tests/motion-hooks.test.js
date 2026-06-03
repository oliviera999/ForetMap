import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeScrollProgress,
  countUpValue,
  easeOutCubic,
} from '../src/shared/utils/motionMath.js';

describe('motionMath', () => {
  it('computeScrollProgress retourne 0 sans scroll possible', () => {
    assert.equal(computeScrollProgress({ scrollTop: 0, scrollHeight: 100, clientHeight: 100 }), 0);
  });

  it('computeScrollProgress retourne 1 en bas de page', () => {
    assert.equal(computeScrollProgress({ scrollTop: 400, scrollHeight: 500, clientHeight: 100 }), 1);
  });

  it('computeScrollProgress borne entre 0 et 1', () => {
    assert.equal(computeScrollProgress({ scrollTop: 200, scrollHeight: 500, clientHeight: 100 }), 0.5);
    assert.equal(computeScrollProgress({ scrollTop: 999, scrollHeight: 500, clientHeight: 100 }), 1);
  });

  it('easeOutCubic et countUpValue interpolent correctement', () => {
    assert.equal(easeOutCubic(0), 0);
    assert.equal(easeOutCubic(1), 1);
    assert.equal(countUpValue(0, 100, 0), 0);
    assert.equal(countUpValue(0, 100, 1), 100);
    const mid = countUpValue(10, 20, 0.5);
    assert.ok(mid >= 17 && mid <= 19);
  });
});
