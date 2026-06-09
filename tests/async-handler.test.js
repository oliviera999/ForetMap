'use strict';

const test = require('node:test');
const assert = require('node:assert');
const asyncHandler = require('../lib/asyncHandler');

function mockNext() {
  const calls = [];
  const next = (err) => { calls.push(err); };
  next.calls = calls;
  return next;
}

test('asyncHandler: succès -> ne touche pas next', async () => {
  let ran = false;
  const next = mockNext();
  const wrapped = asyncHandler(async (req, res) => { ran = true; res.ok = true; });
  const res = {};
  await wrapped({}, res, next);
  assert.strictEqual(ran, true);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(next.calls.length, 0);
});

test('asyncHandler: rejet async -> next(err)', async () => {
  const next = mockNext();
  const boom = new Error('boom');
  const wrapped = asyncHandler(async () => { throw boom; });
  await wrapped({}, {}, next);
  assert.strictEqual(next.calls.length, 1);
  assert.strictEqual(next.calls[0], boom);
});

test('asyncHandler: throw synchrone -> next(err)', async () => {
  const next = mockNext();
  const boom = new Error('sync-boom');
  const wrapped = asyncHandler(() => { throw boom; });
  await wrapped({}, {}, next);
  assert.strictEqual(next.calls.length, 1);
  assert.strictEqual(next.calls[0], boom);
});

test('asyncHandler: préserve err.status pour le handler central', async () => {
  const next = mockNext();
  const wrapped = asyncHandler(async () => {
    const e = new Error('Interdit');
    e.status = 403;
    throw e;
  });
  await wrapped({}, {}, next);
  assert.strictEqual(next.calls[0].status, 403);
});

test('asyncHandler: argument non-fonction -> TypeError', () => {
  assert.throws(() => asyncHandler(null), TypeError);
});
