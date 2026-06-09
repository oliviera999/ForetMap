'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { z, validate, formatZodError } = require('../lib/validate');

function mockReqRes({ body, query, params } = {}) {
  const req = { body, query, params };
  const res = {
    statusCode: 200,
    jsonBody: undefined,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.jsonBody = payload; return this; },
  };
  let nextCalled = false;
  let nextErr;
  const next = (err) => { nextCalled = true; nextErr = err; };
  return { req, res, next, get nextCalled() { return nextCalled; }, get nextErr() { return nextErr; } };
}

test('validate: corps valide -> next() et req.body coerce', () => {
  const schema = z.object({ reason: z.string().trim().min(1).max(10) });
  const mw = validate({ body: schema });
  const ctx = mockReqRes({ body: { reason: '  ok  ' } });
  mw(ctx.req, ctx.res, ctx.next);
  assert.strictEqual(ctx.nextCalled, true);
  assert.strictEqual(ctx.req.body.reason, 'ok'); // trim applique
  assert.strictEqual(ctx.res.statusCode, 200);
});

test('validate: corps invalide -> 400 avec message lisible', () => {
  const schema = z.object({ reason: z.string().min(1) });
  const mw = validate({ body: schema });
  const ctx = mockReqRes({ body: { reason: '' } });
  mw(ctx.req, ctx.res, ctx.next);
  assert.strictEqual(ctx.nextCalled, false);
  assert.strictEqual(ctx.res.statusCode, 400);
  assert.ok(typeof ctx.res.jsonBody.error === 'string' && ctx.res.jsonBody.error.length > 0);
});

test('validate: query exposee sur req.validatedQuery (Express 5 read-only)', () => {
  const schema = z.object({ page: z.coerce.number().int().min(1).default(1) });
  const mw = validate({ query: schema });
  const ctx = mockReqRes({ query: { page: '3' } });
  mw(ctx.req, ctx.res, ctx.next);
  assert.strictEqual(ctx.nextCalled, true);
  assert.strictEqual(ctx.req.validatedQuery.page, 3); // coercion string -> number
});

test('validate: params invalides -> 400', () => {
  const schema = z.object({ id: z.string().regex(/^\d+$/) });
  const mw = validate({ params: schema });
  const ctx = mockReqRes({ params: { id: 'abc' } });
  mw(ctx.req, ctx.res, ctx.next);
  assert.strictEqual(ctx.res.statusCode, 400);
});

test('formatZodError: chemin + message', () => {
  const schema = z.object({ a: z.object({ b: z.string() }) });
  const r = schema.safeParse({ a: { b: 123 } });
  assert.strictEqual(r.success, false);
  const msg = formatZodError(r.error);
  assert.ok(msg.includes('a.b'));
});
