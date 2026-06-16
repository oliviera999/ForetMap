import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeScrollProgress,
  countUpValue,
  easeOutCubic,
  isElementScrollRevealVisible,
  parseRootMargin,
} from '../src/shared/utils/motionMath.js';

describe('motionMath', () => {
  it('computeScrollProgress retourne 0 sans scroll possible', () => {
    assert.equal(computeScrollProgress({ scrollTop: 0, scrollHeight: 100, clientHeight: 100 }), 0);
  });

  it('computeScrollProgress retourne 1 en bas de page', () => {
    assert.equal(
      computeScrollProgress({ scrollTop: 400, scrollHeight: 500, clientHeight: 100 }),
      1,
    );
  });

  it('computeScrollProgress borne entre 0 et 1', () => {
    assert.equal(
      computeScrollProgress({ scrollTop: 200, scrollHeight: 500, clientHeight: 100 }),
      0.5,
    );
    assert.equal(
      computeScrollProgress({ scrollTop: 999, scrollHeight: 500, clientHeight: 100 }),
      1,
    );
  });

  it('parseRootMargin lit quatre valeurs px', () => {
    assert.deepEqual(parseRootMargin('0px 0px -80px 0px'), {
      top: 0,
      right: 0,
      bottom: -80,
      left: 0,
    });
  });

  it('isElementScrollRevealVisible respecte rootMargin et threshold', () => {
    const el = {
      getBoundingClientRect: () => ({
        top: 100,
        left: 0,
        bottom: 200,
        right: 300,
        width: 300,
        height: 100,
      }),
    };
    assert.equal(
      isElementScrollRevealVisible(el, {
        rootMargin: '0px',
        threshold: 0.5,
        viewport: { top: 0, left: 0, width: 400, height: 500 },
      }),
      true,
    );
    assert.equal(
      isElementScrollRevealVisible(el, {
        rootMargin: '0px 0px -500px 0px',
        threshold: 0.01,
        viewport: { top: 0, left: 0, width: 400, height: 300 },
      }),
      false,
    );
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
