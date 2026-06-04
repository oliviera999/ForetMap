import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FETCH_ALL_MAX_LOOP_ITERATIONS,
  FETCH_ALL_MAX_WALL_MS,
  getFetchAllLoopAbortReason,
} from '../src/constants/app-runtime.js';

describe('getFetchAllLoopAbortReason', () => {
  test('null tant que dans les limites', () => {
    const started = 1_000_000;
    assert.equal(
      getFetchAllLoopAbortReason({ loopIterations: 1, jobStartedAt: started, now: started + 1000 }),
      null,
    );
  });

  test('iterations au-delà du plafond', () => {
    assert.equal(
      getFetchAllLoopAbortReason({
        loopIterations: FETCH_ALL_MAX_LOOP_ITERATIONS + 1,
        jobStartedAt: 0,
        now: 1,
      }),
      'iterations',
    );
  });

  test('wall au-delà du délai max', () => {
    assert.equal(
      getFetchAllLoopAbortReason({
        loopIterations: 1,
        jobStartedAt: 0,
        now: FETCH_ALL_MAX_WALL_MS + 1,
      }),
      'wall',
    );
  });
});
